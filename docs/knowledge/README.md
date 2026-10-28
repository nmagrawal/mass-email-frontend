# OpGov Outreach App — Knowledge Tree

Internal outreach console for OpGov: email campaigns, SMS/MMS texting, a two‑way SMS inbox, and map-based canvassing of San Ramon voters. Next.js 16 App Router + MongoDB + Clerk, with an external FastAPI backend for email and SMS-campaign sending.

> Snapshot as of commit `d1ac283` (2026-10-23). Verify file/function names before relying on them.

## Tree

```
OpGov Outreach App
├── 1. Architecture ............................ architecture.md
│   ├── Stack & versions (Next 16, React 19, Tailwind 4, shadcn/ui)
│   ├── Request flow: Browser → Next route handlers → MongoDB / FastAPI / Twilio / Google
│   ├── Auth: Clerk via proxy.ts (Next 16 "middleware")
│   └── Environment variables
├── 2. Data model .............................. data-model.md
│   ├── voter_db       (legacy voters, email templates, sms_chats, messages)
│   ├── voter_db_v2    (geo-enabled voters, voter_interactions,
│   │                   message_templates, outreach_history)
│   ├── paper_distribution (cities, locations, route_templates, audit_events)
│   ├── opgov / MONGODB_DB (text_templates, invalid_phone writes)
│   └── opgov-prod     (users, speakers_history — read-only source for mapping)
├── 3. API routes .............................. api-routes.md
│   ├── Email:   emails, emails/[id], emails/send, emails/templates, mass-send, upload
│   ├── Texting: mass-texting, texts/templates, private-message
│   ├── Inbox:   inbound-messages, inbound-messages/[voterId]
│   ├── Volunteer outreach: outreach/templates(/[id]), outreach/voters,
│   │            outreach/history(/[id])
│   ├── Paper distribution: paper/places/*, paper/cities(/[id]), paper/locations(/[id]),
│   │            paper/route/compute, paper/route-templates(/[id])
│   ├── Voters:  voters (GET/PATCH), voters/remove-invalid-phone, public-speakers
│   ├── Maps:    map-voters, nearest-voters, address-voters, voter-interactions,
│   │            geocode-address, walking-route
│   └── Admin/one-off: create-indexes, map-opgov-users, map-public-speakers
├── 4. Features (page → components → APIs) ..... features.md
│   ├── /                  Emailing (mass campaigns)
│   ├── /mass-texting      Texting (classic Twilio + "modern" FastAPI)
│   ├── /sms-hub           SMS Hub (inbox, chat, campaigns, templates)
│   ├── /volunteer-texting Volunteers text from their own phone (sms: link + confirm)
│   ├── /nearest-voters    Nearest voters + walking route
│   ├── /explore-voters    Clustered map + shared canvass notes
│   ├── /voters            OpGov users matched to voters
│   ├── /public_speakers   Public speakers matched to voters
│   ├── /inbound-messages  Legacy inbound table (broken, see gotchas)
│   └── /paper-distribution Newspaper drop locations + driving route planner (admin)
├── 5. Gotchas, bugs & tech debt ............... gotchas.md
└── 6. Dev recipes (how to add things) ......... dev-recipes.md
```

## 30‑second orientation

| Need to… | Look at |
|---|---|
| Change top nav tabs | `components/app-bar.tsx` (`tabs` array) |
| Mongo connection | `lib/api/mongo.ts` → `getDb(dbName)` (cached global client) |
| Talk to FastAPI from server | inline `fetch(${NEXT_PUBLIC_API_URL}...)` with `x-api-key: FRONTEND_API_KEY` |
| Talk to FastAPI from browser | `lib/apiClient.ts` → `apiFetch()` (uses `NEXT_PUBLIC_API_KEY`) |
| Auth gate | `proxy.ts` (all non-public routes call `auth.protect()`) |
| Map UI | `components/ExploreVotersMap.tsx`, `components/NearestVotersMap.tsx` |
| SMS Hub UI | `components/sms-hub/*` |
| Volunteer outreach | `lib/outreach.ts` (server), `lib/outreach-render.ts` (shared), `components/volunteer-texting/*` |
| Paper distribution | `lib/paper-distribution.ts` (server), `components/paper-distribution/*` |
| UI primitives | `components/ui/*` (shadcn, "new-york" style) |

## Before writing code

- **Read `node_modules/next/dist/docs/`** (per `AGENTS.md`) — Next 16 differs from older versions (e.g. `middleware.ts` → `proxy.ts`, async `params`).
- `next.config.mjs` sets `typescript.ignoreBuildErrors: true` — the build will not catch type errors. Run `npx tsc --noEmit` yourself.
- No test suite exists. Verify in the browser (`npm run dev`, port 3000).
