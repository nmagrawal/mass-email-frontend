import type { Collection, Db, ObjectId } from "mongodb";
import { currentUser } from "@clerk/nextjs/server";

import { getDb } from "@/lib/api/mongo";

/*
 * Volunteer outreach (native-phone SMS / email) data model.
 * See docs/knowledge/data-model.md → message_templates / outreach_history.
 */

export const OUTREACH_DB = "voter_db_v2";

/*
 * Single campaign for now. There is no campaigns collection; every
 * outreach_history record carries this id so we can split later.
 */
export const CURRENT_CAMPAIGN_ID = "campaign_01";

export const OUTREACH_CHANNELS = ["sms", "email"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_STATUSES = [
  "initiated",
  "sent",
  "cancelled",
  "failed",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/* Only these transitions are allowed; terminal states never change. */
export const FINAL_STATUSES: OutreachStatus[] = ["sent", "cancelled", "failed"];

/* Same population as the Explore / Nearest maps. */
export const ELIGIBLE_VOTER_FILTER = {
  "residence.city": "San Ramon",
  $or: [{ "flags.super_voter": true }, { "flags.frequent_voter": true }],
};

export const MAX_BODY_LENGTH = 1600;
export const MAX_SUBJECT_LENGTH = 300;

export type TemplateVersion = {
  version: number;
  subject?: string;
  body: string;
  created_by: string;
  created_by_name?: string;
  created_at: Date;
};

export type MessageTemplateDocument = {
  _id: string;
  name: string;
  channel: OutreachChannel;
  active_version: number;
  versions: TemplateVersion[];
  created_at: Date;
  updated_at: Date;
};

export type OutreachHistoryDocument = {
  _id?: ObjectId;
  campaign_id: string;
  voter_id: string;
  channel: OutreachChannel;
  template_id: string | null;
  template_version: number | null;
  recipient: { phone?: string; email?: string };
  message_snapshot: { subject?: string; body: string };
  status: OutreachStatus;
  status_note?: string; // e.g. "superseded" when the volunteer pressed Send again
  initiated_by: string;
  initiated_by_name: string;
  initiated_at: Date;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  sent_at: Date | null;
  status_updated_at: Date;
};

export type OutreachVoterDocument = {
  _id: string;
  name?: { first?: string; middle?: string; last?: string; full?: string };
  contact?: { phone_primary?: string; phone_secondary?: string; email?: string };
  residence?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  registration?: { party_name?: string; party_abbr?: string };
  flags?: { super_voter?: boolean; frequent_voter?: boolean; srd2?: boolean };
};

declare global {
  // eslint-disable-next-line no-var
  var _outreachIndexesPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var _outreachCountCache: Map<string, { total: number; at: number }> | undefined;
}

/*
 * Counting eligible voters has to read every San Ramon voter (~55k docs,
 * 1.5–3s), while the page itself is ~150ms. Totals barely change between page
 * clicks, so cache them briefly. Any outreach status change clears the cache
 * so the "Not texted" / "Texted" totals stay accurate.
 */
const COUNT_CACHE_TTL_MS = 60_000;

export async function getCachedCount(key: string, count: () => Promise<number>) {
  const cache = (global._outreachCountCache ??= new Map());
  const hit = cache.get(key);

  if (hit && Date.now() - hit.at < COUNT_CACHE_TTL_MS) {
    return hit.total;
  }

  const total = await count();
  cache.set(key, { total, at: Date.now() });

  // Searches create many keys; keep the map small.
  if (cache.size > 500) {
    cache.delete(cache.keys().next().value!);
  }

  return total;
}

export function invalidateOutreachCounts() {
  global._outreachCountCache?.clear();
}

export const VOTER_LIST_INDEX = {
  "residence.city": 1,
  "name.last": 1,
  "name.first": 1,
  _id: 1,
} as const;

async function ensureIndexes(db: Db) {
  await Promise.all([
    // Volunteer voter list: city equality + name sort, so a page is read in
    // index order instead of scanning/sorting the whole (1.7M doc) collection.
    db
      .collection("voters")
      .createIndex(VOTER_LIST_INDEX, { name: "outreach_city_name" }),
    db.collection("message_templates").createIndex({ channel: 1 }),
    db
      .collection("outreach_history")
      .createIndex({ voter_id: 1, campaign_id: 1 }),
    db
      .collection("outreach_history")
      .createIndex({ campaign_id: 1, channel: 1, status: 1 }),
    db
      .collection("outreach_history")
      .createIndex({ initiated_by: 1, initiated_at: -1 }),
    db
      .collection("outreach_history")
      .createIndex({ voter_id: 1, channel: 1, sent_at: -1 }),
  ]);
}

/*
 * createIndex is idempotent; run it once per server process so new
 * environments get the indexes without a manual admin step.
 */
export async function getOutreachDb() {
  const db = await getDb(OUTREACH_DB);

  if (!global._outreachIndexesPromise) {
    global._outreachIndexesPromise = ensureIndexes(db).catch((err) => {
      global._outreachIndexesPromise = undefined;
      console.error("Outreach index creation failed:", err);
    });
  }

  await global._outreachIndexesPromise;

  return db;
}

export async function getTemplatesCollection(): Promise<
  Collection<MessageTemplateDocument>
> {
  const db = await getOutreachDb();
  return db.collection<MessageTemplateDocument>("message_templates");
}

export async function getOutreachHistoryCollection(): Promise<
  Collection<OutreachHistoryDocument>
> {
  const db = await getOutreachDb();
  return db.collection<OutreachHistoryDocument>("outreach_history");
}

export function isOutreachChannel(value: unknown): value is OutreachChannel {
  return OUTREACH_CHANNELS.includes(value as OutreachChannel);
}

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Digits only, US country code dropped: "+1 (925) 555-1234" → "9255551234". */
export function normalizePhone(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

export function getVoterPhone(voter: OutreachVoterDocument) {
  return (
    normalizePhone(voter.contact?.phone_primary) ||
    normalizePhone(voter.contact?.phone_secondary)
  );
}

export type SignedInUser = { id: string; name: string };

/* Returns null when nobody is signed in. */
export async function getSignedInUser(): Promise<SignedInUser | null> {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    "Unknown user";

  return { id: user.id, name };
}

export function serializeTemplate(template: MessageTemplateDocument) {
  const active =
    template.versions.find((v) => v.version === template.active_version) ||
    null;

  return {
    id: template._id,
    name: template.name,
    channel: template.channel,
    activeVersion: template.active_version,
    active: active ? serializeVersion(active) : null,
    versions: [...template.versions]
      .sort((a, b) => b.version - a.version)
      .map(serializeVersion),
    updatedAt: template.updated_at?.toISOString() ?? null,
  };
}

function serializeVersion(version: TemplateVersion) {
  return {
    version: version.version,
    subject: version.subject ?? null,
    body: version.body,
    createdBy: version.created_by,
    createdByName: version.created_by_name ?? null,
    createdAt: version.created_at?.toISOString() ?? null,
  };
}

export function serializeHistory(record: OutreachHistoryDocument) {
  return {
    id: String(record._id),
    campaignId: record.campaign_id,
    voterId: record.voter_id,
    channel: record.channel,
    templateId: record.template_id,
    templateVersion: record.template_version,
    recipient: record.recipient,
    messageSnapshot: record.message_snapshot,
    status: record.status,
    initiatedBy: record.initiated_by,
    initiatedByName: record.initiated_by_name,
    initiatedAt: record.initiated_at?.toISOString() ?? null,
    confirmedBy: record.confirmed_by,
    confirmedByName: record.confirmed_by_name,
    sentAt: record.sent_at ? record.sent_at.toISOString() : null,
    statusUpdatedAt: record.status_updated_at?.toISOString() ?? null,
  };
}

export type SerializedTemplate = ReturnType<typeof serializeTemplate>;
export type SerializedHistory = ReturnType<typeof serializeHistory>;
