# Data model (MongoDB)

There is no schema layer — shapes below are inferred from queries. Four databases are in play.

## `voter_db` (main cluster, `MONGODB_URI`) — legacy voter file

### `voters`
Messy, multi-source schema. Fields seen in code:

```ts
{
  _id: ObjectId,
  full_name?: string, first_name?: string, last_name?: string,   // root-level (used by /api/voters search)
  email?: string,
  phone?: string,
  demographics: {
    name_first, name_last, full_name?, city, type, street, house_number, state, zip,
    ResidenceCity?, MailCity?,                                      // alternate city fields
    phone?, PhoneNumber?, PhoneNumberNormalized?, phone_1?,         // phone can be in any of these
    email?
  },
  // set by app
  invalid_phone?: true,                  // excluded from /api/voters
  opgovUser?: true, opgovUserId?: ObjectId,           // by /api/map-opgov-users
  public_speaker?: true, public_speaker_id?: any,     // by /api/map-public-speakers
  last_template_sent?: string, last_template_sent_at?: Date,   // by email sends
  sms_chats?: {                          // keyed by thread/campaign name
    [threadName: string]: Array<{
      text?: string, message?: string,
      direction: "inbound" | "outbound",
      timestamp: string | Date | {$date},  // often Python ISO w/ microseconds, no TZ → treat as UTC
      campaign?: string,
      // outbound rows written by /api/private-message also have:
      imageUrl?, campaignId?, twilioSid?, twilioStatus?, replyToInboundTimestamp?, replyToInboundText?
    }>
    // special key "inbound_unmatched" for inbound with no campaign
  },
  last_sms_sent_at?: Date, last_sms_thread?: string
}
```
Indexes (via `POST /api/create-indexes`): `demographics.city`, `email`.

Inbound texts equal to `"stop"` or `"op"` (case-insensitive) are hidden in inbox views.

### `emails` — email templates (not emails!)
`{ _id, name, subject, body (HTML), sequence: number }` — sorted by `sequence`; new ones get `max+1`. Index on `sequence`.

### `messages`
Written by `/api/private-message` only when `campaignId` is passed: `{ voterId, campaignId, phone, message, imageUrl, direction:"outbound", timestamp, smsChatThread, twilioSid, twilioStatus, relatedInboundText, relatedInboundTimestamp }`.

## `voter_db_v2` (main cluster) — clean, geo-enabled voter file

### `voters`
Note: **`_id` is a string** (e.g. `contra_costa:1544888`), not an ObjectId. ~1.7M docs; ~55k in San Ramon, ~21.5k eligible with a phone.
Indexes: `_id`, `{county, flags.super_voter}`, `{county, flags.frequent_voter}`, `{county, flags.srd2}`, `residence.location` 2dsphere, `outreach_city_name` (see below). **No plain `residence.city` index existed** — any new query filtering by city should lead with `residence.city` to use `outreach_city_name`.
```ts
{
  _id: string,
  county?: string,
  name: { first, middle, last, full },
  contact: { phone_primary, phone_secondary, email },
  residence: {
    address_line1, address_line2, city, state, zip,
    location: { type: "Point", coordinates: [lng, lat] }   // needs 2dsphere index for $geoNear/$geoWithin
  },
  precinct: { id, name },
  registration: { party_name, party_abbr },
  flags: { super_voter?: bool, frequent_voter?: bool, srd2?: bool }   // srd2 = San Ramon District 2
}
```
**Eligibility filter** used by every map route (hard-coded):
`residence.city == "San Ramon" AND (flags.super_voter OR flags.frequent_voter)`.

**Household grouping key** (`addressKey`): `lower(trim(address_line1))|lower(trim(address_line2))|lower(trim(city))|lower(trim(state))|zip`.

### `voter_interactions`
One shared doc per voter (not per user) — canvass status.
```ts
{
  voter_id: string,             // = voters._id
  address_key?: string,
  visited: boolean,
  contacted: { phone: boolean, email: boolean },
  notes: string,                // ≤ 5000 chars
  created_by: { clerk_user_id, name }, created_at: Date,
  updated_by: { clerk_user_id, name }, updated_at: Date
}
```
Upserted by `/api/voter-interactions`; read by `/api/address-voters`. Should have an index on `voter_id` (not created by code).

### `message_templates` (volunteer outreach)
One doc per logical template; versions are append-only (never edit a used version).
```ts
{
  _id: string,                     // readable, e.g. "sms_initial_voter_outreach"
  name: string,
  channel: "sms" | "email",
  active_version: number,          // the version the app uses
  versions: [{ version, subject? (email), body, created_by (clerk id), created_by_name, created_at }],
  created_at, updated_at
}
```
Placeholders: `{{first_name}}`, `{{last_name}}`, `{{full_name}}` (see `lib/outreach-render.ts`; missing first name → "there").

### `outreach_history` (volunteer outreach)
**One doc per send attempt** — never an array on the voter.
```ts
{
  campaign_id: "campaign_01",      // CURRENT_CAMPAIGN_ID in lib/outreach.ts; no campaigns collection yet
  voter_id: string,                // voters._id
  channel: "sms" | "email",
  template_id, template_version,
  recipient: { phone } | { email },        // read from the voter doc server-side
  message_snapshot: { subject?, body },    // exactly what was sent (after personalization/edits)
  status: "initiated" | "sent" | "cancelled" | "failed",
  status_note?: "superseded",              // volunteer pressed Send again before confirming
  initiated_by, initiated_by_name, initiated_at,
  confirmed_by, confirmed_by_name,         // who resolved it (sent/cancelled/failed)
  sent_at: Date | null,
  status_updated_at
}
```
State machine: `initiated → sent | cancelled | failed`; final states never change. A follow-up message is a new doc.
Indexes (auto-created once per process by `getOutreachDb()`): `voters{residence.city,name.last,name.first,_id}` (name `outreach_city_name` — the volunteer list depends on it; without it every page was a 1.7M-doc COLLSCAN, ~20s), `message_templates{channel}`, `outreach_history{voter_id,campaign_id}`, `{campaign_id,channel,status}`, `{initiated_by,initiated_at:-1}`, `{voter_id,channel,sent_at:-1}`.

## `MONGODB_DB` (default `"opgov"`)

### `text_templates`
`{ _id, name, body }` — used by classic texting (`/api/texts/templates`). Typed in `lib/api/mongo.ts` as `TextTemplateDoc`.

Also: `mass-texting` and `voters/remove-invalid-phone` operate on `<MONGODB_DB>.voters`. See gotchas — this is likely a different DB than `voter_db`.

## `opgov-prod` (separate cluster, `MONGODB_URI_1`) — read-only source

- `users`: `{ _id, firstName, lastName, ... }` — matched to voters by lowercase `first|last` name.
- `speakers_history`: `{ _id (often the speaker name string), speaker_name?, organizations: string[] }` — matched to voters when an org string contains the voter's city and the voter's full name contains the speaker name.

## SMS templates (FastAPI-owned)
Not in this repo's DB access. Shape from UI: `{ id | _id, name, body, media_url?, created_at? }`.

## Local data files (gitignored, large)
`opgov-voter-mapping-log.json` (~95MB), `public-speaker-mapping-log*.json` — outputs of the mapping routes. `sample_voter.json` — example voter docs.
