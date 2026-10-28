# Architecture

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js `^16.3.1` App Router, React 19.2, TypeScript 5.7 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), `tw-animate-css`, shadcn/ui (`components.json`, style "new-york", icons lucide) |
| Auth | Clerk (`@clerk/nextjs` 7, `@clerk/ui` shadcn theme) |
| DB | MongoDB driver 7 (`mongodb`) — no ORM |
| Messaging | Twilio SDK 6 (direct sends), external FastAPI (email + SMS campaigns) |
| Maps | Google Maps JS (`@googlemaps/js-api-loader`, `@googlemaps/markerclusterer`), Geocoding API, Routes API v2 |
| Files | Vercel Blob (`/api/upload`, public images for emails/MMS) |
| Data fetching | Mostly plain `fetch` + `useState/useEffect`; SWR only in `hooks/use-emails.ts` |
| Hosting | Vercel (repo linked to a v0 project; merges to `main` auto-deploy) |

Package managers: both `package-lock.json` and `pnpm-lock.yaml` are committed. Scripts: `dev`, `build`, `start`, `lint`.

## Request flow

```
Browser (client components, "use client")
   │
   ├── fetch("/api/...")  ──► Next route handlers (app/api/**/route.ts, Node runtime)
   │                              ├── MongoDB  (lib/api/mongo.ts getDb, or ad-hoc MongoClient)
   │                              ├── FastAPI  (NEXT_PUBLIC_API_URL, header x-api-key=FRONTEND_API_KEY)
   │                              ├── Twilio   (messages.create)
   │                              ├── Google   (Geocoding, Routes)
   │                              └── Vercel Blob (put)
   │
   ├── apiFetch("/api/sms/...") ──► FastAPI directly from the browser
   │                                 (header x-api-key=NEXT_PUBLIC_API_KEY — exposed to client)
   │
   └── Google Maps JS SDK (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_GOOGLE_MAP_ID)
```

### FastAPI backend (not in this repo)
Endpoints the app relies on:
- Server-side: `GET /emails?folder=`, `GET|DELETE /emails/{id}`, `POST /api/send`, `POST /api/mass-send`
- Browser-side via `apiFetch`: `GET|POST /api/sms/templates/`, `PUT|DELETE /api/sms/templates/{id}`, `POST /api/sms/campaign/`, `GET /api/sms/voters`, `GET /api/sms/chats?voter_id=`
- `POST /api/webhook/twilio` (Twilio inbound webhook — presumably writes `voters.sms_chats` in `voter_db`)

`POST /api/sms/campaign/` payload: `{ campaign_name, template_id, audience: { contacts: [{phone, name?}] } | { city } }`.

## Auth

- `proxy.ts` = Next 16's renamed middleware. `clerkMiddleware` protects everything except `/sign-in(.*)`, `/sign-up(.*)`, `/__clerk/*`. Matcher includes `/(api|trpc)(.*)`, so **API routes are protected too**.
- **Roles** (`lib/access.ts`, enforced in `proxy.ts`), from Clerk `publicMetadata.role`:
  | Role | Can open |
  |---|---|
  | `admin` | everything |
  | `dispatcher` | volunteer pages + `/paper-distribution`, `/driver`, all `/api/paper/*` |
  | `driver` | volunteer pages + `/driver`, `/api/paper/my-runs`, `/api/paper/runs/*` (handlers further limit drivers to **their own** runs) |
  | anything else | `/volunteer-texting`, `/nearest-voters`, `/explore-voters` + their APIs |
  Blocked pages redirect to `homeFor(role)` (`/driver` for drivers, else `/volunteer-texting`); blocked APIs → 403. Paper APIs re-check with `requireUser()` → `{clerk_user_id, name, role}` and `canDispatch()` / `canAccessRun()`; store `auditUser(me)` (no role) on documents.
  - Role source: `sessionClaims.metadata` if the Clerk session token is customized with `{"metadata": "{{user.public_metadata}}"}` (Dashboard → Sessions → Customize session token); otherwise `clerkClient().users.getUser()` cached 60s per user in the proxy. Role changes take up to ~60s to apply.
  - `components/app-bar.tsx` hides tabs using the same `canAccess()` — UI only, not security.
  - **When a volunteer page starts calling a new API, add it to `VOLUNTEER_APIS`**, or volunteers get 403.
- `address-voters`, `voter-interactions` and `/api/outreach/*` additionally check the user inside the handler; `voter-interactions` and outreach stamp `created_by` / `initiated_by` etc.
- `app/layout.tsx` wraps everything in `<ClerkProvider appearance={{ theme: shadcn }}>`; `AppBar` shows `SignInButton`/`UserButton` via `<Show when=...>`.

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `MONGODB_URI` | `lib/api/mongo.ts`, `emails/send`, `mass-send` | Main cluster (voter_db, voter_db_v2, opgov) |
| `MONGODB_DB` | `getTextTemplatesCollection`, `mass-texting`, `voters/remove-invalid-phone` | Defaults to `"opgov"` — see gotchas |
| `MONGODB_URI_1` | `map-opgov-users`, `map-public-speakers`, (`public-speakers` defines but doesn't use) | Prod OpGov cluster, db `opgov-prod` |
| `NEXT_PUBLIC_API_URL` | FastAPI base (server + client) | default `http://localhost:8000` on server |
| `FRONTEND_API_KEY` | server → FastAPI `x-api-key` | |
| `NEXT_PUBLIC_API_KEY` | browser → FastAPI `x-api-key` | ships in client bundle |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | `mass-texting`, `private-message` | |
| `GOOGLE_MAPS_API_KEY` | `geocode-address` (server) | |
| `GOOGLE_ROUTES_API_KEY` | `walking-route` (server) | |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` | map components | Map ID defaults to `DEMO_MAP_ID` |
| `BLOB_READ_WRITE_TOKEN` | `@vercel/blob` (implicit) | |
| Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) | Clerk (implicit) | |

Local env lives in `.env*.local` (gitignored).

## Directory layout

```
app/
  layout.tsx              Root: ClerkProvider + AppBar + Vercel Analytics (prod only)
  page.tsx                "/" → EmailClient
  <feature>/page.tsx      one folder per nav tab (see features.md)
  sign-in/, sign-up/      Clerk catch-all pages
  api/**/route.ts         route handlers (see api-routes.md)
components/
  app-bar.tsx             top nav (tabs array)
  email/                  Emailing feature
  sms/                    /mass-texting shell + "modern" FastAPI widgets
  text/                   "classic" Twilio mass texting + voter picker
  sms-hub/                SMS Hub (has its own README.md, partly outdated)
  ExploreVotersMap.tsx    /explore-voters map
  NearestVotersMap.tsx    /nearest-voters map
  inbound-messages-client.tsx
  ui/                     shadcn primitives — don't hand-edit unless needed
hooks/                    use-emails (SWR), use-mobile, use-toast
lib/
  api/mongo.ts            getDb + text_templates collection helper
  api/client.ts           FastAPI client helpers (mostly unused)
  apiClient.ts            apiFetch for browser → FastAPI
  types/email.ts          Email / MassCampaign types
  utils.ts                cn()
proxy.ts                  Clerk middleware
remove_invalid_phone.js   CLI script (node) — same as /api/voters/remove-invalid-phone
styles/globals.css        unused duplicate; app/globals.css is the real one
```
