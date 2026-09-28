import { auth } from "@clerk/nextjs/server";
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

type AuditUser = {
  clerk_user_id: string;
  name: string;
};

type VoterInteractionDocument = {
  voter_id: string;
  address_key?: string;
  visited?: boolean;
  contacted?: {
    phone?: boolean;
    email?: boolean;
  };
  notes?: string;
  created_by?: AuditUser;
  created_at?: Date;
  updated_by?: AuditUser;
  updated_at?: Date;
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
  addressKey?: unknown;
};

function cleanOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const { isAuthenticated } = await auth();

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

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
    const addressKey = cleanOptionalString(body.addressKey);

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
     * Fast path: use the viewport-provided voter IDs so MongoDB can use the
     * built-in _id index.
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
     * Defensive fallback for old/stale viewport payloads without voter IDs.
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

    const resolvedVoterIds = voters.map((voter) => voter._id);

    /*
     * Shared interaction status: do NOT filter by Clerk user.
     */
    const interactions = await db
      .collection<VoterInteractionDocument>("voter_interactions")
      .find({
        voter_id: {
          $in: resolvedVoterIds,
        },
      })
      .toArray();

    const interactionByVoterId = new Map<string, VoterInteractionDocument>(
      interactions.map(
        (interaction): [string, VoterInteractionDocument] => [
          interaction.voter_id,
          interaction,
        ],
      ),
    );

    const votersWithInteractions = voters.map((voter) => {
      const interaction = interactionByVoterId.get(voter._id);

      return {
        ...voter,
        interaction: {
          visited: interaction?.visited ?? false,
          contacted: {
            phone: interaction?.contacted?.phone ?? false,
            email: interaction?.contacted?.email ?? false,
          },
          notes: interaction?.notes ?? "",
          createdBy: interaction?.created_by
            ? {
                clerkUserId: interaction.created_by.clerk_user_id,
                name: interaction.created_by.name,
              }
            : null,
          createdAt: interaction?.created_at
            ? interaction.created_at.toISOString()
            : null,
          updatedBy: interaction?.updated_by
            ? {
                clerkUserId: interaction.updated_by.clerk_user_id,
                name: interaction.updated_by.name,
              }
            : null,
          updatedAt: interaction?.updated_at
            ? interaction.updated_at.toISOString()
            : null,
        },
      };
    });

    const firstResidence = voters[0]?.residence || {};

    return NextResponse.json({
      addressKey,
      voterCount: voters.length,
      address: {
        address_line1: firstResidence.address_line1,
        address_line2: firstResidence.address_line2,
        city: firstResidence.city,
        state: firstResidence.state,
        zip: firstResidence.zip,
      },
      voters: votersWithInteractions,
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
