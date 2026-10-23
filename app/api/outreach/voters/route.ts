import { NextRequest, NextResponse } from "next/server";

import {
  CURRENT_CAMPAIGN_ID,
  ELIGIBLE_VOTER_FILTER,
  escapeRegex,
  getCachedCount,
  getOutreachDb,
  getSignedInUser,
  getVoterPhone,
  serializeHistory,
  type OutreachHistoryDocument,
  type OutreachVoterDocument,
} from "@/lib/outreach";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

const FILTERS = ["all", "not_sent", "sent", "pending"] as const;
type Filter = (typeof FILTERS)[number];

// $nin [null, ""] also excludes missing fields.
function hasValue(field: string) {
  return { [field]: { $nin: [null, ""] } };
}

/*
 * GET /api/outreach/voters?search=&filter=all|not_sent|sent|pending&district2=true&skip=&limit=
 * "pending" = SMS initiated by the current user and not yet confirmed.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const search = (params.get("search") || "").trim().slice(0, 100);
    const filterParam = params.get("filter") || "all";
    const filter: Filter = FILTERS.includes(filterParam as Filter)
      ? (filterParam as Filter)
      : "all";
    const district2 = params.get("district2") === "true";
    const skip = Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(params.get("limit") || "", 10) || DEFAULT_LIMIT),
    );

    const db = await getOutreachDb();
    const history = db.collection<OutreachHistoryDocument>("outreach_history");
    const voters = db.collection<OutreachVoterDocument>("voters");

    const smsScope = { campaign_id: CURRENT_CAMPAIGN_ID, channel: "sms" as const };

    const and: Record<string, unknown>[] = [
      ELIGIBLE_VOTER_FILTER,
      { $or: [hasValue("contact.phone_primary"), hasValue("contact.phone_secondary")] },
    ];

    if (district2) {
      and.push({ "flags.srd2": true });
    }

    if (search) {
      const safe = escapeRegex(search);
      const digits = search.replace(/\D/g, "");
      const or: Record<string, unknown>[] = [
        { "name.full": { $regex: safe, $options: "i" } },
        { "name.first": { $regex: safe, $options: "i" } },
        { "name.last": { $regex: safe, $options: "i" } },
      ];

      if (digits.length >= 3) {
        // Phone numbers are stored in mixed formats; allow separators between digits.
        const phonePattern = digits.split("").join("\\D*");
        or.push({ "contact.phone_primary": { $regex: phonePattern } });
        or.push({ "contact.phone_secondary": { $regex: phonePattern } });
      }

      and.push({ $or: or });
    }

    if (filter === "sent" || filter === "not_sent") {
      const sentIds = await history.distinct("voter_id", { ...smsScope, status: "sent" });
      and.push({ _id: filter === "sent" ? { $in: sentIds } : { $nin: sentIds } });
    }

    if (filter === "pending") {
      const pendingIds = await history.distinct("voter_id", {
        ...smsScope,
        status: "initiated",
        initiated_by: user.id,
      });
      and.push({ _id: { $in: pendingIds } });
    }

    const query = { $and: and };

    const countKey = JSON.stringify({
      filter,
      search,
      district2,
      ...(filter === "pending" ? { user: user.id } : {}),
    });

    const [total, page, sentCount, mySentCount] = await Promise.all([
      getCachedCount(countKey, () => voters.countDocuments(query)),
      voters
        .find(query, {
          projection: {
            _id: 1,
            name: 1,
            contact: 1,
            "residence.address_line1": 1,
            "residence.address_line2": 1,
            "residence.city": 1,
            "residence.state": 1,
            "residence.zip": 1,
            "registration.party_name": 1,
            "registration.party_abbr": 1,
            flags: 1,
          },
        })
        // Must match VOTER_LIST_INDEX so the page is read in index order.
        .sort({ "name.last": 1, "name.first": 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      history.countDocuments({ ...smsScope, status: "sent" }),
      history.countDocuments({ ...smsScope, status: "sent", confirmed_by: user.id }),
    ]);

    const voterIds = page.map((v) => v._id);

    const records = voterIds.length
      ? await history
          .find({ ...smsScope, voter_id: { $in: voterIds } })
          .sort({ initiated_at: -1 })
          .toArray()
      : [];

    const latestByVoter = new Map<string, OutreachHistoryDocument>();
    const lastSentByVoter = new Map<string, OutreachHistoryDocument>();
    const pendingByVoter = new Map<string, OutreachHistoryDocument>();

    for (const record of records) {
      if (!latestByVoter.has(record.voter_id)) {
        latestByVoter.set(record.voter_id, record);
      }
      if (record.status === "sent" && !lastSentByVoter.has(record.voter_id)) {
        lastSentByVoter.set(record.voter_id, record);
      }
      if (record.status === "initiated" && !pendingByVoter.has(record.voter_id)) {
        pendingByVoter.set(record.voter_id, record);
      }
    }

    const result = page.map((voter) => {
      const latest = latestByVoter.get(voter._id);
      const lastSent = lastSentByVoter.get(voter._id);
      const pending = pendingByVoter.get(voter._id);

      return {
        id: voter._id,
        name: {
          first: voter.name?.first || "",
          last: voter.name?.last || "",
          full:
            voter.name?.full ||
            [voter.name?.first, voter.name?.last].filter(Boolean).join(" "),
        },
        phone: getVoterPhone(voter),
        email: voter.contact?.email || "",
        address: [
          voter.residence?.address_line1,
          voter.residence?.address_line2,
          voter.residence?.city,
        ]
          .filter(Boolean)
          .join(", "),
        party: voter.registration?.party_abbr || voter.registration?.party_name || "",
        flags: {
          superVoter: voter.flags?.super_voter === true,
          frequentVoter: voter.flags?.frequent_voter === true,
          district2: voter.flags?.srd2 === true,
        },
        latestSms: latest ? serializeHistory(latest) : null,
        lastSentSms: lastSent ? serializeHistory(lastSent) : null,
        pendingSms: pending ? serializeHistory(pending) : null,
      };
    });

    return NextResponse.json({
      campaignId: CURRENT_CAMPAIGN_ID,
      voters: result,
      total,
      skip,
      limit,
      stats: { sent: sentCount, sentByMe: mySentCount },
    });
  } catch (err: any) {
    console.error("Outreach voters error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load voters" },
      { status: 500 },
    );
  }
}
