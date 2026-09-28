import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";

type VoterDocument = {
  _id: string;
  county?: string;
  name?: {
    first?: string;
    middle?: string;
    last?: string;
    full?: string;
  };
  contact?: {
    phone_primary?: string;
    phone_secondary?: string;
    email?: string;
  };
  residence?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  precinct?: {
    id?: string;
    name?: string;
  };
  registration?: {
    party_name?: string;
    party_abbr?: string;
  };
  flags?: {
    super_voter?: boolean;
    frequent_voter?: boolean;
    srd2?: boolean;
  };
};

type AddressInput = {
  address_line1?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

type Body = {
  voterIds?: unknown;
  address?: AddressInput;
};

function cleanOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const voterIds = Array.isArray(body.voterIds)
      ? body.voterIds.filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && id.length <= 100,
        )
      : [];

    if (voterIds.length > 50) {
      return NextResponse.json(
        { error: "Too many voters requested" },
        { status: 400 },
      );
    }

    const addressLine1 = cleanOptionalString(body.address?.address_line1);
    const addressLine2 = cleanOptionalString(body.address?.address_line2);
    const city = cleanOptionalString(body.address?.city) || "San Ramon";
    const state = cleanOptionalString(body.address?.state);
    const zip = cleanOptionalString(body.address?.zip);

    if (voterIds.length === 0 && !addressLine1) {
      return NextResponse.json(
        { error: "No voters or address were provided" },
        { status: 400 },
      );
    }

    const db = await getDb("voter_db_v2");
    const collection = db.collection<VoterDocument>("voters");

    const eligibilityFilter = {
      "residence.city": city,
      $or: [
        { "flags.super_voter": true },
        { "flags.frequent_voter": true },
      ],
    };

    let voters: VoterDocument[] = [];

    /*
     * Preferred fast path: lookup the household members by _id.
     */
    if (voterIds.length > 0) {
      voters = await collection
        .find(
          {
            ...eligibilityFilter,
            _id: { $in: voterIds },
          },
          {
            projection: {
              _id: 1,
              county: 1,
              name: 1,
              contact: 1,
              "residence.address_line1": 1,
              "residence.address_line2": 1,
              "residence.city": 1,
              "residence.state": 1,
              "residence.zip": 1,
              precinct: 1,
              "registration.party_name": 1,
              "registration.party_abbr": 1,
              flags: 1,
            },
          },
        )
        .sort({ "name.last": 1, "name.first": 1 })
        .toArray();
    }

    /*
     * Defensive fallback. If an old/stale viewport response did not contain
     * voterIds, or an ID no longer resolves, use the exact structured address.
     * This keeps the UI working while the optimized ID path remains primary.
     */
    if (voters.length === 0 && addressLine1) {
      const addressFilter: Record<string, any> = {
        ...eligibilityFilter,
        "residence.address_line1": addressLine1,
      };

      if (state) {
        addressFilter["residence.state"] = state;
      }

      if (zip) {
        addressFilter["residence.zip"] = zip;
      }

      if (addressLine2) {
        addressFilter["residence.address_line2"] = addressLine2;
      } else {
        addressFilter["$and"] = [
          {
            $or: [
              { "residence.address_line2": { $exists: false } },
              { "residence.address_line2": null },
              { "residence.address_line2": "" },
            ],
          },
        ];
      }

      voters = await collection
        .find(
          addressFilter,
          {
            projection: {
              _id: 1,
              county: 1,
              name: 1,
              contact: 1,
              "residence.address_line1": 1,
              "residence.address_line2": 1,
              "residence.city": 1,
              "residence.state": 1,
              "residence.zip": 1,
              precinct: 1,
              "registration.party_name": 1,
              "registration.party_abbr": 1,
              flags: 1,
            },
          },
        )
        .sort({ "name.last": 1, "name.first": 1 })
        .toArray();
    }

    if (voters.length === 0) {
      return NextResponse.json(
        { error: "No eligible voters were found at this address" },
        { status: 404 },
      );
    }

    const firstResidence = voters[0]?.residence || {};

    return NextResponse.json({
      voterCount: voters.length,
      address: {
        address_line1: firstResidence.address_line1,
        address_line2: firstResidence.address_line2,
        city: firstResidence.city,
        state: firstResidence.state,
        zip: firstResidence.zip,
      },
      voters,
    });
  } catch (err: any) {
    console.error("Address voters error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to load voters at this address",
      },
      { status: 500 },
    );
  }
}
