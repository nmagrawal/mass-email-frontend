# Features (page → components → APIs)

Nav order comes from `components/app-bar.tsx`. Every page is a client component.

---

## `/` — Emailing
`app/page.tsx` → `components/email/email-client.tsx`

```
EmailClient
├── Sidebar (email/sidebar.tsx)        only "Mass Campaigns" folder enabled; inbox/sent commented out
├── MassCampaign (email/mass-campaign.tsx, ~900 lines)
│   ├── from email/name, subject, HTML template with {first_name}-style personalization
│   ├── contacts list + bulk paste/file import; persisted to localStorage (mass_fromEmail, mass_fromName, …)
│   ├── template load/save  → /api/emails/templates
│   ├── ImagePicker (email/image-picker.tsx) → /api/upload
│   └── send → onSend → POST /api/mass-send
├── VoterListPanel (email/voter-list-panel.tsx)   right column, xl screens only
│   ├── GET /api/voters?skip&limit=300&city  (default city "Mangalam")
│   └── search → /api/voters?search&limit=2000; "add to list" pushes {email, first_name}
├── EmailList / EmailDetail / ComposeModal       inbox-style UI (via useEmails SWR → /api/emails) — currently unreachable
└── EmailTemplateManager (email/email-template-manager.tsx)
```

## `/mass-texting` — Texting
`app/mass-texting/page.tsx` → `components/sms/SmsTextingPanel.tsx`, with `MassTextingSidebar` switching:

- **Modern** (FastAPI, via `apiFetch`):
  - `SmsTemplateManager` → `/api/sms/templates/` CRUD, image via `/api/upload`
  - `CampaignLauncher` → `/api/sms/campaign/` (contacts or `{city}`)
  - `VoterInbox` → `/api/sms/voters`, `/api/sms/chats?voter_id=`
- **Classic** (Twilio directly from Next):
  - `text/mass-text-campaign.tsx` — compose with `{name}`, char/segment counter, MMS image upload, templates via `/api/texts/templates`, send via `/api/mass-texting`; contacts persisted in `localStorage.massTextContacts`; "import city" pulls `/api/voters?city&limit=2000` and extracts phone from `demographics.phone|PhoneNumber|phone_1|phone`
  - `text/voter-list-panel-sms.tsx` — voter picker, dedupes by phone

## `/sms-hub` — SMS Hub (newest SMS UI)
`app/sms-hub/page.tsx` → `components/sms-hub/sms-client.tsx` (dark slate gradient theme). Tabs `inbox | campaigns | templates`.

| Component | Does | APIs |
|---|---|---|
| `sms-sidebar.tsx` | tab nav | — |
| `sms-inbox-list.tsx` | conversations, 500ms debounced search, infinite paging (20 / 50 when searching) | `GET /api/inbound-messages` |
| `sms-chat-detail.tsx` | thread view with date separators & read-more; reply as **normal** (`POST /api/private-message`) or **template** (single-contact campaign `POST {API}/api/sms/campaign/`) ; optimistic append then refetch after 1s | `/api/inbound-messages/[voterId]`, `/api/private-message`, FastAPI templates/campaign |
| `sms-campaign-composer.tsx` | name + template + audience (uploaded contacts w/ bulk import & dedupe, or city) | FastAPI templates/campaign, `/api/voters?distinct=city` |
| `sms-templates-list.tsx` | template CRUD, duplicate, search/filter/sort, segment counter | FastAPI `/api/sms/templates/` |

`components/sms-hub/README.md` documents this module but lists some endpoints that don't match reality (it describes the inbox as FastAPI `/api/sms/voters`; actual inbox uses local `/api/inbound-messages`).

## `/volunteer-texting` — Volunteer texting (native phone SMS)
`app/volunteer-texting/page.tsx` → `components/volunteer-texting/volunteer-texting-client.tsx`. Mobile-first: list ↔ detail on phones, two columns on desktop.

```
VolunteerTextingClient   tabs "Text voters" | "Templates", campaign stats (sent / by you)
├── VoterList            search (name/phone, 400ms debounce), filters Not texted · My unconfirmed · Texted · All, District 2 toggle, 20 per page with prev/next + jump-to-page
├── VoterOutreachPanel   voter info → template select (remembered in localStorage) → editable personalized preview
│                        [Send SMS] is a real <a href="sms:+1…?&body=…">: the tap opens Messages, and onClick
│                          records the attempt in parallel (POST /api/outreach/history, keepalive) → initiated.
│                          Never navigate to sms: from code after an await — browsers can block it silently,
│                          leaving the PREVIOUS voter's draft open in Messages (happened in testing).
│                          If recording fails / 409 already_sent → "Try again" / "Record anyway" / "I didn't send it".
│                        [Confirm Sent] → PATCH status=sent   (also "Didn't send" → cancelled, "Failed")
│                        "SMS already sent … by X" warning → button becomes "Send again" (confirmDuplicate)
│                        contact history list (message snapshots)
└── TemplateManager      create template, "Edit" = new version (auto-active), version history, "Make active"
```
The app cannot know if the text was actually sent — that is why Send only marks `initiated` and the volunteer must confirm.

## `/nearest-voters` — Nearest voters & walking route
`app/nearest-voters/page.tsx` (~700 lines) + `components/NearestVotersMap.tsx`

- Location input: browser geolocation (one-shot or **live tracking** via `watchPosition`; refetches when moved > `REFRESH_DISTANCE_METERS` = 40m) or typed address → `/api/geocode-address`.
- `POST /api/nearest-voters` → 10 nearest eligible households, shown in list + map.
- "Create walking route" → `POST /api/walking-route` with each household's `representativeVoterId` (max `MAX_ROUTE_STOPS` = 10) → polyline + ordered stops, miles/duration.

## `/explore-voters` — Explore map + canvass notes
`app/explore-voters/page.tsx` (stats cards) + `components/ExploreVotersMap.tsx` (~1000 lines, imperative Google Maps code)

- On map `idle`: abort previous request, `POST /api/map-voters` with bounds → household markers in a `MarkerClusterer` (cluster count = voters).
- Click a household → InfoWindow; `POST /api/address-voters` (household cache, TTL 15s since data is shared) → per-voter cards with **Visited / Contacted phone / Contacted email / Notes**.
- Save → `POST /api/voter-interactions`; shows "updated by X at T". InfoWindow content is built as DOM strings/elements, not React.
- Centered on `SAN_RAMON_CENTER`.

## `/voters` — OpGov users
`app/voters/page.tsx` — table of voters that have `opgovUserId` (`/api/voters?mapped=true&city&search`). City list comes from a default `/api/voters` call.

## `/public_speakers` — Public speakers
`app/public_speakers/page.tsx` — paginated (50) `/api/public-speakers`, city filter + name search.

## `/inbound-messages` — Legacy inbound table
`components/inbound-messages-client.tsx` — simple paginated table. **Currently broken** (reads `data.messages`, API returns `conversations`). Superseded by SMS Hub inbox.

## Auth pages
`app/sign-in/[[...sign-in]]`, `app/sign-up/[[...sign-up]]` — Clerk `<SignIn/>` / `<SignUp/>`.
