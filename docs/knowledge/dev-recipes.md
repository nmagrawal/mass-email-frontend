# Dev recipes

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000, requires .env.local (see architecture.md)
npx tsc --noEmit   # builds ignore TS errors, so check manually
```
You must sign in through Clerk to reach any page or API route.

## Add a new top-nav page
1. Create `app/<slug>/page.tsx` (add `"use client"` if it uses state/effects — every existing page does).
2. Put substantial UI in `components/<feature>/…` and keep the page thin (see `app/sms-hub/page.tsx`).
3. Add `{ label, href }` to `tabs` in `components/app-bar.tsx`.
4. Route is auto-protected by `proxy.ts` and is **admin-only by default**. To open it to other roles, add the page and every API it calls to the matching lists in `lib/access.ts` (`VOLUNTEER_*`, `DRIVER_*`, `DISPATCHER_*`).

## Add an API route
Follow the newer pattern (e.g. `app/api/voter-interactions/route.ts`):
```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/api/mongo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // validate input explicitly (Number.isFinite, typeof === "string", length caps)
    const db = await getDb("voter_db_v2");   // reuse the cached client — don't new MongoClient()
    // ...
    return NextResponse.json({ ... });
  } catch (err: any) {
    console.error("<name> error:", err);
    return NextResponse.json({ error: err?.message || "..." }, { status: 500 });
  }
}
```
- Need the user? `const { isAuthenticated, userId } = await auth()` from `@clerk/nextjs/server`; `currentUser()` for name/email.
- Dynamic segments: `{ params }: { params: Promise<{ id: string }> }` and `await params`.
- `voter_db_v2` `_id`s are strings; `voter_db` `_id`s are `ObjectId` (validate with `ObjectId.isValid`).
- Escape user text before `$regex` (copy `escapeRegex` from `app/api/inbound-messages/route.ts`).

## Work with the canvass map population
Reuse the eligibility filter:
```ts
{ "residence.city": "San Ramon", $or: [{ "flags.super_voter": true }, { "flags.frequent_voter": true }] }
```
(Better: extract it to `lib/` first — it's copy-pasted in 5 routes.)

## Send an SMS
- One voter, recorded in their thread: `POST /api/private-message` `{voterId, phone, message}`.
- Bulk via Twilio from Next: `POST /api/mass-texting` `{message, contacts:[{phone,name}]}`.
- Bulk via FastAPI campaign (templates, tracked campaigns): `apiFetch("/api/sms/campaign/", …)`.

## Add a shadcn component
`components.json` is configured (aliases `@/components/ui`, `@/lib/utils`). Use the shadcn CLI or copy into `components/ui/`.

## Run admin jobs
Locally only (they write files to the repo root and scan whole collections):
```bash
curl -X POST http://localhost:3000/api/create-indexes
```
`map-opgov-users` / `map-public-speakers` first **wipe** existing mapping flags — double-check before running. Requests need a Clerk session (run from the signed-in browser or temporarily allow the route).

## Keep this knowledge tree current
When you add a route, page, collection, or env var, update the matching file in `docs/knowledge/`, and strike items in `gotchas.md` once fixed.

## Give someone a role
Clerk Dashboard → Users → user → Public metadata: `{ "role": "dispatcher" }` (or `"driver"`, `"admin"`). Takes up to ~60 s (proxy role cache).
