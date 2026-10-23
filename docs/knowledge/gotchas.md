# Gotchas, bugs & tech debt

Found while mapping the codebase at `d1ac283`. Ordered roughly by impact.

## Likely bugs

1. **`/inbound-messages` page shows nothing.** `components/inbound-messages-client.tsx` reads `data.messages` and `msg.text/full_name/timestamp`, but `GET /api/inbound-messages` returns `{conversations: [{name, lastMessage, lastMessageTime, ...}]}`.
2. **`invalid_phone` may be written to a different DB than it's read from.** `/api/mass-texting` and `/api/voters/remove-invalid-phone` use `getDb(MONGODB_DB || "opgov")`, but `/api/voters` filters `invalid_phone` in `voter_db`. Unless `MONGODB_DB=voter_db` in env, failed numbers are never excluded. Same split applies to `text_templates` (lives in `MONGODB_DB`).
3. **Classic texting "import city" only returns voters that have an email.** It calls `/api/voters`, whose default branch adds `email: {$exists:true, $ne:""}`. Phone-only voters are silently dropped.
4. **`?distinct=city` isn't implemented.** `CampaignLauncher`, `mass-text-campaign`, `sms-campaign-composer` call `/api/voters?distinct=city`; the route ignores it and returns a page of 100 voters + `cities`. Works by accident, wastes a query.
5. **Search field mismatch.** `/api/voters` search uses root `full_name/first_name/last_name`; many legacy voter docs only have names under `demographics.*` (which `/api/public-speakers` searches). Search may miss voters.
6. **`/api/texts/templates` update path**: `findOneAndUpdate` in driver v6+ returns the document directly (not `{value}`) by default, so `result.value` is undefined → updates return 404 even when they succeed.
7. **`mass-texting` marks `invalid_phone` on any Twilio error**, including transient/auth/rate-limit errors.
8. **`components/sms-hub/SmsTextingPanel.tsx` and `SmsTemplateManager.tsx` are dead copies** of `components/sms/*`; the sms-hub copy imports `./CampaignLauncher`, `./VoterInbox`, `./MassTextingSidebar` which don't exist there. Not imported anywhere — safe to delete.

## Security

- `NEXT_PUBLIC_API_KEY` is shipped to the browser and used for FastAPI SMS calls — anyone with the bundle can call the FastAPI SMS endpoints. Prefer proxying through Next routes with the server-only `FRONTEND_API_KEY`.
- ~~No authorization beyond "signed in"~~ — fixed: non-admins are limited to the volunteer pages/APIs (`lib/access.ts`). Admin-only routes (incl. destructive `map-opgov-users`, `map-public-speakers`, `voters/remove-invalid-phone`, `create-indexes`) are still callable by **any admin**.
- User-supplied `search` is passed unescaped to `$regex` in `/api/voters` and `/api/public-speakers` (ReDoS / unexpected matches). `/api/inbound-messages` shows the right pattern (`escapeRegex`).
- `/api/emails` interpolates `folder` into the upstream URL without encoding.

## Performance / reliability

- `emails/send`, `mass-send`, `map-*`, `public-speakers` open a **new `MongoClient` per request** instead of `getDb()`; map routes never close theirs.
- Email/text sends are sequential loops (`for … await`) with per-contact `updateOne` — slow for large lists, may hit Vercel function timeouts. Use `bulkWrite` / batching.
- Map routes depend on a `2dsphere` index on `voter_db_v2.voters.residence.location` and ideally an index on `voter_interactions.voter_id`; neither is created by code.
- `/api/outreach/voters` caches its total count for 60s per filter/search (`getCachedCount` in `lib/outreach.ts`), per server instance; outreach status changes clear it.
- `/api/map-voters` has no result cap — zoomed out over a large area returns every household.

## Hard-coded values

- **"San Ramon"** + super/frequent voter eligibility is hard-coded in `map-voters`, `nearest-voters`, `address-voters` (default), `walking-route`, `voter-interactions`, and UI copy. Extract to a shared constant/module before adding cities.
- Default city **"Mangalam"** in `email/voter-list-panel.tsx`.
- Layout metadata still says "Mail - Email Client / powered by FastAPI".

## Code-health notes

- `typescript.ignoreBuildErrors: true` — type errors don't fail builds.
- Lots of `any`; duplicated helpers across files (`normalizePhone`, `isValidPhone`, `getSmsSegments`, `getErrorMessage`, `normalizeTimestamp/normalizeDate`, household `addressKey` pipeline, `getOpgovProdDb`). Candidates for `lib/`.
- Three parallel SMS UIs (`/mass-texting` classic, `/mass-texting` modern, `/sms-hub`). SMS Hub is the newest — confirm with the team before investing in the others.
- `lib/api/client.ts` is mostly unused (only types are relevant); `styles/globals.css` duplicates `app/globals.css`.
- `app/api/voters/route.ts` declares `PATCH` above its imports and `dbName` constant (works due to module evaluation order, but confusing).
- Both npm and pnpm lockfiles are committed.
