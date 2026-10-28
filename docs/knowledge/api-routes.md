# API routes (`app/api/**/route.ts`)

All are protected by Clerk via `proxy.ts`. "DB" column = Mongo database touched.

## Email

| Route | Method | What it does | Backing |
|---|---|---|---|
| `/api/emails?folder=` | GET | Proxy list of emails | FastAPI `GET /emails` |
| `/api/emails/[id]` | GET, DELETE | Proxy single email / delete | FastAPI `/emails/{id}` |
| `/api/emails/send` | POST | Body `{from_email,to,subject,body,html_body?,template_name?,contacts?}` → FastAPI `/api/send`; if `template_name`+`contacts` set, stamps `last_template_sent(_at)` on `voter_db.voters` by email | FastAPI + voter_db |
| `/api/mass-send` | POST | Body `{from_email,subject,html_template,contacts:[{email,first_name}],template_name?}` (validates every contact) → FastAPI `/api/mass-send`; then stamps `last_template_sent` | FastAPI + voter_db |
| `/api/emails/templates` | GET, POST | List (sorted by `sequence`) / create-or-update (`_id` → update) email templates | voter_db.emails |
| `/api/upload` | POST (multipart `file`) | JPEG/PNG/GIF/WebP ≤5MB → Vercel Blob `email-images/<ts>-<name>`, returns `{url}` | Vercel Blob |

## Texting

| Route | Method | What it does | Backing |
|---|---|---|---|
| `/api/mass-texting` | POST | Body `{message, contacts:[{phone,name?}], imageUrl?}`. Sequential Twilio sends; `{name}` placeholder replaced; >1600 chars rejected; >160 chars or image ⇒ MMS (adds 1×1 PNG if no image). On failure sets `invalid_phone: true` on matching voter. Returns `{success,sent,failed,results}` | Twilio + `<MONGODB_DB>`.voters |
| `/api/texts/templates` | GET, POST | List / create-or-update (`_id`) classic text templates | `<MONGODB_DB>`.text_templates |
| `/api/private-message` | POST | Body `{voterId, phone, message, imageUrl?, forceMMS?, campaignId?}`. Sends via Twilio, appends outbound msg to the voter's **most-recent inbound thread** in `sms_chats` (or `inbound_unmatched`); if `campaignId`, also inserts into `messages` | Twilio + voter_db |

## Inbox

| Route | Method | What it does |
|---|---|---|
| `/api/inbound-messages?skip&limit&search` | GET | Aggregation over `voter_db.voters.sms_chats`: voters with ≥1 inbound (excluding "stop"/"op"), sorted by latest inbound. Returns `{conversations:[{id,name,phone,normalizedPhone,lastMessage,lastMessageTime,unreadCount}], total, skip, limit, search}`. limit default 30, max 100. Search matches name, phone, normalized phone, or inbound text |
| `/api/inbound-messages/[voterId]` | GET | Full thread for a voter: flattens all `sms_chats` threads, normalizes timestamps to UTC ISO, dedupes, sorts ascending. Returns `{voter:{id,name,phone,normalizedPhone}, messages:[{id,text,direction,timestamp,campaign,full_name,phone}]}` |

## Volunteer outreach (`voter_db_v2`, `lib/outreach.ts`)

All require a signed-in user (checked in-handler via `currentUser()`).

| Route | Method | What it does |
|---|---|---|
| `/api/outreach/templates?channel=` | GET | List templates with `active` version + all versions (newest first) |
| `/api/outreach/templates` | POST | `{name, channel, body, subject?}` → new template at v1, id `<channel>_<slug>` |
| `/api/outreach/templates/[id]` | POST | `{body, subject?, activate=true}` → appends v(n+1); retries on concurrent edits |
| `/api/outreach/templates/[id]` | PATCH | `{activeVersion}` → switch/roll back active version |
| `/api/outreach/voters?search&filter&district2&skip&limit` | GET | Eligible San Ramon voters **with a phone**; `filter` = `all` / `not_sent` / `sent` / `pending` (mine, unconfirmed). Each voter has `latestSms`, `lastSentSms`, `pendingSms`. Also `stats {sent, sentByMe}` for the campaign |
| `/api/outreach/history?voterId=` | GET | This campaign's attempts for one voter, newest first |
| `/api/outreach/history` | POST | `{voterId, channel, templateId, templateVersion, body, subject?, confirmDuplicate?}` → creates `initiated`. 409 `{code:"already_sent", previousSent}` if already sent and `confirmDuplicate` not set. Cancels the same user's earlier unconfirmed attempt (`status_note: "superseded"`) |
| `/api/outreach/history/[id]` | PATCH | `{status: sent|cancelled|failed}`; only from `initiated` (409 otherwise). Sets `confirmed_by`, and `sent_at` for `sent` |

## Paper distribution (`paper_distribution`, `lib/paper-distribution.ts`) — admin/dispatcher (drivers: my-runs + own runs)

| Route | Method | What it does |
|---|---|---|
| `/api/paper/places/autocomplete` | POST | `{input, sessionToken, bias?, citiesOnly?}` → Google Places (New) suggestions (US). Uses `GOOGLE_MAPS_API_KEY` (has Places API New enabled) |
| `/api/paper/places/details` | POST | `{placeId, sessionToken, cityId?}` → `{place, duplicates}`; ends the Google billing session |
| `/api/paper/cities` | GET, POST | List (with non-inactive location counts) / create from a locality `placeId` (idempotent by slug) |
| `/api/paper/cities/[id]` | PATCH | `{depot}` set/clear the default route start |
| `/api/paper/locations?cityId&status&search` | GET | `status`: current (default: active+paused) / active / paused / inactive / all. Triggers background coordinate refresh |
| `/api/paper/locations` | POST | `{cityId, place, label, area, defaultQuantity, instructions, contact, availability, status, confirmDuplicate?}`; 409 `code:"duplicate"` for same Place ID |
| `/api/paper/locations/[id]` | PATCH | Partial edit incl. `status`; returns `usedInRoutes` (active saved routes still containing it) when paused/deactivated |
| `/api/paper/route/compute` | POST | `{cityId, start, finish:{returnToStart, point}, stops:[locationId] ≤25, optimize, departureTime?}` → Google Routes **DRIVE** (`GOOGLE_ROUTES_API_KEY`). 422 `code:"unroutable"` lists stops that are missing/inactive/other city/no coords. Traffic-aware only for future departures. Returns `orderedLocationIds, path, distanceMeters, driveSeconds, legs (stops+1), trafficAware` |
| `/api/paper/route-templates?cityId&includeArchived` | GET | Saved routes |
| `/api/paper/route-templates` | POST | Create `{cityId, name, stops, start, finish, optimize, defaultStopMinutes, lastSummary?}` or duplicate `{duplicateOf, name?}` |
| `/api/paper/route-templates/[id]` | PATCH | Rename / edit / `status: archived|active` |
| `/api/paper/editions?cityId` | GET | Editions (newest first) with run/copy summary — dispatcher |
| `/api/paper/editions` | POST | `{cityId, name, publishDate, copiesAvailable, notes?}` |
| `/api/paper/editions/[id]` | GET, PATCH | Detail: runs + totals, all stop records, edition totals (available/allocated/unallocated/loaded/dropped/picked up/returned/damaged/unaccounted), `duplicates` (location in >1 live run). PATCH name/date/copies/status/notes |
| `/api/paper/runs` | POST | `{editionId, routeTemplateId, name?, driverId?, confirmDuplicates?}` → snapshot + pending stop records; non-active locations `excluded`; 409 `code:"duplicates"` — dispatcher |
| `/api/paper/runs/[id]` | GET, PATCH | Own run (driver) or any (dispatcher). PATCH `{action}`: dispatcher `assign`, `set_quantities`, `remove_stop`, `cancel`, `rename`, `notes`; driver/dispatcher `load`, `start`, `interrupt`, `finish`. 409 includes the current run |
| `/api/paper/runs/[id]/stops/[locationId]` | PATCH | Driver: `{status, deliveredQuantity, pickedUpQuantity, reason, notes, clientUpdateId, recordedAt}` (idempotent, ignores older). Dispatcher: `{correction:true, reason, status, deliveredQuantity, pickedUpQuantity, stopReason}` |
| `/api/paper/my-runs` | GET | Signed-in user's open runs + completed in last 3 days |
| `/api/paper/drivers` | GET | Clerk users with role driver/dispatcher/admin (cached 60 s) — dispatcher |
| `/api/paper/locations/[id]/history?limit` | GET | Week-by-week drops/pickups for one location + summary (leftover rate) |
| `/api/paper/reports?cityId&from&to` | GET | `byEdition`, `byLocation` (dropped, picked up, leftover %), `problems` (skipped/partial), `notPlanned`, `runStatus` of latest edition |

## Voters (legacy `voter_db`)

| Route | Method | What it does |
|---|---|---|
| `/api/voters` | GET | Default: paginated (`skip`, `limit`=100) voters **with email**, excluding `invalid_phone`, optional `city` and `search` (root `full_name/first_name/last_name` regex). Returns `{voters, cities, total}`; `cities` = `distinct(demographics.city)` cached 5 min in a global. `mapped=true`: all voters with `opgovUserId`, flattened `{voterId,opgovUserId,first_name,last_name,city,address}` |
| `/api/voters` | PATCH | Body `{voterId, invalid_phone}` → sets flag |
| `/api/voters/remove-invalid-phone` | POST | Unsets `invalid_phone` everywhere in `<MONGODB_DB>`.voters |
| `/api/public-speakers?city&search&skip&limit` | GET | Voters with `public_speaker: true`, search on `demographics.*` names. Returns `{voters,total}` |

## Maps / canvassing (`voter_db_v2`, San Ramon only)

| Route | Method | What it does |
|---|---|---|
| `/api/map-voters` | POST | Body `{north,south,east,west,zoom}` → `$geoWithin` box, group by household `addressKey`. Returns `{addresses:[{addressKey,address,location,voterIds,voterCount,superVoterCount,frequentVoterCount,district2Count}], addressCount, voterCount, zoom}`. Handles antimeridian by widening to ±180 |
| `/api/nearest-voters` | POST | Body `{lat,lng}` → `$geoNear` on `residence.location`, group by household, top **10** households with embedded voters. Returns `{searchLocation, addresses:[{addressKey,representativeVoterId,address,location,distanceMeters,voterCount,voters}]}` |
| `/api/address-voters` | POST | Explicit `auth()`. Body `{voterIds≤50, address?, addressKey?}`. Fast path by `_id $in`, fallback by exact address match. Joins `voter_interactions`. Returns `{addressKey, voterCount, address, voters:[...voter, interaction]}` |
| `/api/voter-interactions` | POST | Explicit `auth()` + `currentUser()`. Body `{voterId, addressKey?, visited, contactedPhone, contactedEmail, notes}`. Verifies voter is eligible, upserts one shared doc per voter with audit user. Returns `{saved, voterId, interaction}` |
| `/api/geocode-address` | POST | Body `{address}` → Google Geocoding (`region=us`) → `{lat,lng,formattedAddress}` |
| `/api/walking-route` | POST | Body `{origin:{lat,lng}, voterIds:1..10}` (one representative voter per stop). Google Routes v2 `WALK`, round trip, `optimizeWaypointOrder`. Returns `{orderedVoterIds, routePath:[{lat,lng}], distanceMeters, durationSeconds, legs, warnings, returnLeg}` |

## Admin / one-off (run manually with curl)

| Route | Method | What it does |
|---|---|---|
| `/api/create-indexes` | POST | Creates `voter_db` indexes (city, email, emails.sequence). Does **not** create 2dsphere on v2 |
| `/api/map-opgov-users` | POST | **Destructive**: unsets `opgovUser(Id)` on all voters, then name-matches against `opgov-prod.users`; writes `./opgov-voter-mapping-log.json` |
| `/api/map-public-speakers` | POST | **Destructive**: unsets `public_speaker(_id)` on all voters, then matches against `opgov-prod.speakers_history`; writes `./public-speaker-mapping-log-new.json` |

These scan the entire voter collection one doc at a time and write to the local filesystem — they only work when run locally (`npm run dev`), not on Vercel.

## Conventions observed

- Handlers return `NextResponse.json(...)` (older ones build `new Response(JSON.stringify(...))`).
- Errors: `{ error: string }` with 400/401/404/500.
- Newer routes (maps) declare `export const runtime = "nodejs"`, validate numeric input with `Number.isFinite`, and type Mongo docs locally.
- Dynamic params are `Promise`s in Next 16: `{ params }: { params: Promise<{ id: string }> }` → `await params`.
