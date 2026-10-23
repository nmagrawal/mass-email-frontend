import { NextRequest, NextResponse } from "next/server";

import {
  CURRENT_CAMPAIGN_ID,
  ELIGIBLE_VOTER_FILTER,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  cleanString,
  getOutreachDb,
  getSignedInUser,
  invalidateOutreachCounts,
  getVoterPhone,
  isOutreachChannel,
  serializeHistory,
  type MessageTemplateDocument,
  type OutreachHistoryDocument,
  type OutreachVoterDocument,
} from "@/lib/outreach";

export const runtime = "nodejs";

// GET /api/outreach/history?voterId=  → this campaign's attempts for one voter, newest first
export async function GET(req: NextRequest) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const voterId = cleanString(req.nextUrl.searchParams.get("voterId"));

    if (!voterId || voterId.length > 100) {
      return NextResponse.json({ error: "Invalid voter ID" }, { status: 400 });
    }

    const db = await getOutreachDb();
    const records = await db
      .collection<OutreachHistoryDocument>("outreach_history")
      .find({ campaign_id: CURRENT_CAMPAIGN_ID, voter_id: voterId })
      .sort({ initiated_at: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ history: records.map(serializeHistory) });
  } catch (err: any) {
    console.error("Outreach history list error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load history" },
      { status: 500 },
    );
  }
}

/*
 * POST /api/outreach/history
 * { voterId, channel, templateId, templateVersion, body, subject?, confirmDuplicate? }
 *
 * Creates one attempt with status "initiated". The volunteer then sends from
 * their own phone and confirms via PATCH /api/outreach/history/:id.
 * Recipient is read from the voter record, never from the client.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSignedInUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const voterId = cleanString(body.voterId);
    const channel = body.channel;
    const templateId = cleanString(body.templateId);
    const templateVersion = Number(body.templateVersion);
    const text = cleanString(body.body);
    const subject = cleanString(body.subject);
    const confirmDuplicate = body.confirmDuplicate === true;

    if (!voterId || voterId.length > 100) {
      return NextResponse.json({ error: "Invalid voter ID" }, { status: 400 });
    }

    if (!isOutreachChannel(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!templateId || !Number.isInteger(templateVersion)) {
      return NextResponse.json({ error: "Select a template" }, { status: 400 });
    }

    if (!text || text.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: `Message is required (max ${MAX_BODY_LENGTH} characters)` },
        { status: 400 },
      );
    }

    if (channel === "email" && (!subject || subject.length > MAX_SUBJECT_LENGTH)) {
      return NextResponse.json({ error: "Email needs a subject" }, { status: 400 });
    }

    const db = await getOutreachDb();
    const history = db.collection<OutreachHistoryDocument>("outreach_history");

    const [voter, template] = await Promise.all([
      db
        .collection<OutreachVoterDocument>("voters")
        .findOne(
          { _id: voterId, ...ELIGIBLE_VOTER_FILTER },
          { projection: { _id: 1, contact: 1 } },
        ),
      db
        .collection<MessageTemplateDocument>("message_templates")
        .findOne(
          { _id: templateId, channel, "versions.version": templateVersion },
          { projection: { _id: 1 } },
        ),
    ]);

    if (!voter) {
      return NextResponse.json({ error: "Voter was not found" }, { status: 404 });
    }

    if (!template) {
      return NextResponse.json(
        { error: "Template version was not found" },
        { status: 404 },
      );
    }

    const recipient =
      channel === "sms"
        ? { phone: getVoterPhone(voter) }
        : { email: (voter.contact?.email || "").trim() };

    if (!recipient.phone && !recipient.email) {
      return NextResponse.json(
        { error: `Voter has no ${channel === "sms" ? "phone number" : "email"}` },
        { status: 400 },
      );
    }

    const scope = {
      campaign_id: CURRENT_CAMPAIGN_ID,
      voter_id: voterId,
      channel,
    };

    // Resending is allowed, but only when the volunteer explicitly says so.
    const previousSent = await history.findOne(
      { ...scope, status: "sent" },
      { sort: { sent_at: -1 } },
    );

    if (previousSent && !confirmDuplicate) {
      return NextResponse.json(
        {
          error: "Already sent to this voter",
          code: "already_sent",
          previousSent: serializeHistory(previousSent),
        },
        { status: 409 },
      );
    }

    const now = new Date();

    // Pressing Send again replaces this volunteer's own unconfirmed attempt.
    await history.updateMany(
      { ...scope, status: "initiated", initiated_by: user.id },
      {
        $set: {
          status: "cancelled",
          status_note: "superseded",
          confirmed_by: user.id,
          confirmed_by_name: user.name,
          status_updated_at: now,
        },
      },
    );

    const record: OutreachHistoryDocument = {
      ...scope,
      template_id: templateId,
      template_version: templateVersion,
      recipient,
      message_snapshot: channel === "email" ? { subject, body: text } : { body: text },
      status: "initiated",
      initiated_by: user.id,
      initiated_by_name: user.name,
      initiated_at: now,
      confirmed_by: null,
      confirmed_by_name: null,
      sent_at: null,
      status_updated_at: now,
    };

    const result = await history.insertOne(record);
    invalidateOutreachCounts();

    return NextResponse.json({
      record: serializeHistory({ ...record, _id: result.insertedId }),
    });
  } catch (err: any) {
    console.error("Outreach history create error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to start outreach" },
      { status: 500 },
    );
  }
}
