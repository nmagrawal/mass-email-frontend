import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";

const MAX_NOTES_LENGTH = 5000;

type VoterDocument = {
  _id: string;
  residence?: {
    city?: string;
  };
  flags?: {
    super_voter?: boolean;
    frequent_voter?: boolean;
  };
};

type AuditUser = {
  clerk_user_id: string;
  name: string;
};

type VoterInteractionDocument = {
  voter_id: string;
  address_key?: string;
  visited: boolean;
  contacted: {
    phone: boolean;
    email: boolean;
  };
  notes: string;
  created_by: AuditUser;
  created_at: Date;
  updated_by: AuditUser;
  updated_at: Date;
};

type Body = {
  voterId?: unknown;
  addressKey?: unknown;
  visited?: unknown;
  contactedPhone?: unknown;
  contactedEmail?: unknown;
  notes?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDisplayName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    return "Unknown user";
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return user.username;
  }

  if (user.primaryEmailAddress?.emailAddress) {
    return user.primaryEmailAddress.emailAddress;
  }

  return "Unknown user";
}

export async function POST(req: NextRequest) {
  try {
    const { isAuthenticated, userId } = await auth();

    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await currentUser();

    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: "Could not load the signed-in user" },
        { status: 401 },
      );
    }

    const body = (await req.json()) as Body;

    const voterId = cleanString(body.voterId);
    const addressKey = cleanString(body.addressKey);
    const visited = body.visited === true;
    const contactedPhone = body.contactedPhone === true;
    const contactedEmail = body.contactedEmail === true;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!voterId || voterId.length > 100) {
      return NextResponse.json(
        { error: "Invalid voter ID" },
        { status: 400 },
      );
    }

    if (addressKey.length > 500) {
      return NextResponse.json(
        { error: "Invalid address key" },
        { status: 400 },
      );
    }

    if (notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json(
        {
          error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer`,
        },
        { status: 400 },
      );
    }

    const db = await getDb("voter_db_v2");

    /*
     * Verify this voter belongs to the Explore Map population before allowing
     * shared interaction data to be written.
     */
    const voter = await db
      .collection<VoterDocument>("voters")
      .findOne(
        {
          _id: voterId,
          "residence.city": "San Ramon",
          $or: [
            { "flags.super_voter": true },
            { "flags.frequent_voter": true },
          ],
        },
        {
          projection: {
            _id: 1,
          },
        },
      );

    if (!voter) {
      return NextResponse.json(
        { error: "Voter was not found" },
        { status: 404 },
      );
    }

    const interactions =
      db.collection<VoterInteractionDocument>("voter_interactions");

    const now = new Date();

    const auditUser: AuditUser = {
      clerk_user_id: userId,
      name: getDisplayName(user),
    };

    /*
     * Shared status: exactly ONE interaction document per voter.
     * Clerk identifies who created/updated the shared record; it does not
     * partition the interaction data.
     */
    await interactions.updateOne(
      {
        voter_id: voterId,
      },
      {
        $set: {
          ...(addressKey ? { address_key: addressKey } : {}),
          visited,
          contacted: {
            phone: contactedPhone,
            email: contactedEmail,
          },
          notes,
          updated_by: auditUser,
          updated_at: now,
        },
        $setOnInsert: {
          created_by: auditUser,
          created_at: now,
        },
      },
      {
        upsert: true,
      },
    );

    const saved = await interactions.findOne(
      {
        voter_id: voterId,
      },
      {
        projection: {
          _id: 0,
          voter_id: 1,
          visited: 1,
          contacted: 1,
          notes: 1,
          created_by: 1,
          created_at: 1,
          updated_by: 1,
          updated_at: 1,
        },
      },
    );

    return NextResponse.json({
      saved: true,
      voterId,
      interaction: {
        visited: saved?.visited ?? visited,
        contacted: {
          phone: saved?.contacted?.phone ?? contactedPhone,
          email: saved?.contacted?.email ?? contactedEmail,
        },
        notes: saved?.notes ?? notes,
        createdBy: saved?.created_by
          ? {
              clerkUserId: saved.created_by.clerk_user_id,
              name: saved.created_by.name,
            }
          : null,
        createdAt: saved?.created_at
          ? saved.created_at.toISOString()
          : null,
        updatedBy: saved?.updated_by
          ? {
              clerkUserId: saved.updated_by.clerk_user_id,
              name: saved.updated_by.name,
            }
          : {
              clerkUserId: auditUser.clerk_user_id,
              name: auditUser.name,
            },
        updatedAt: saved?.updated_at
          ? saved.updated_at.toISOString()
          : now.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Voter interaction save error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to save voter interaction",
      },
      { status: 500 },
    );
  }
}
