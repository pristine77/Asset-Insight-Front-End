# Asset Insight Admin

Offline review activity (2026-09-18): Report Activity displays and filters
`draft_opened` as **Draft opened for review**. It is a device observation of
opening saved local work, not evidence of upload/submission. Counts, receipt
times and server-confirmed submission events retain their existing meanings.
Backend allowlist support must ship before the updated mobile client.

The production administration console for Asset Insight. It is a Next.js App Router application used by verified `admin` and `superadmin` accounts to manage reports, users, devices, CRM workflows, and approvals. Its Support page is a private requester experience: an administrator can contact the Asset Insight Developer team and can read only requests owned by the same account.

## Runtime architecture

### Proposal Valuation average-based buyer premium (2026-10-09, local)

Each lot's Buyer Premium is 15% of its active evaluators' average, capped at
2,000 per lot. Total Expected Gross is that average plus its buyer premium;
Allocated Value matches gross. Blank or unavailable evaluator values do not
dilute the average, explicit zero participates, and an entirely blank row stays
blank. Adding/removing evaluators or editing amounts recalculates immediately.
Low/High estimates and high-based 1% cost formulas remain unchanged. Backend
support must precede rollout so saves and Excel exports use the same basis;
no historical files are rewritten automatically.

### Proposal Valuation monetary column totals (2026-10-09, local)

The desktop footer and mobile all-lot card now include Total Expected Gross,
Allocated Value, Cleaning, Lien Search, Video Cost, Lotting Fee and Advertising.
They sum the same recalculated row amounts across the entire sheet, not only
the current page or selected lot. Buyer-premium percentages remain nonsummed;
the formatted Asset Insight reference column is not parsed as a valuation.
Row formulas, saved inputs, permissions and export layouts are unchanged. Cents
are retained until display, and blank row values remain blank.

Focused regressions: `node --test tests/asset-schedule-totals.test.mjs`.

### Proposal Valuation report owner (2026-10-09, local)

The backend supplies an intrinsic owner evaluator column and its read-only
`ownerColumnId`. Both desktop and mobile schedule layouts label that participant
**Report owner**, with no remove action. The owner does not consume any of the
four additional evaluator slots and cannot be selected twice. Other evaluator
add/remove behavior, existing amounts and legacy text-only columns are unchanged.
Owner identity is never inferred from display names or supplied by the browser.

The supporting backend must be deployed first: it projects the owner on reads
without a migration and preserves the owner column/values if an older admin
client omits it on save. Explicit saves retain existing revision checks. This
does not grant report access or generate files automatically. Focused policy
tests: `node --test tests/proposal-valuation-owner.test.mjs`.

Local verification: all 109 policy tests, lint, typecheck and the production
build pass. Isolated production Chromium checks at 1366px/light and 320px/dark
cover owner locking, the fourth additional evaluator, add/remove saves, and
reopening with owner/legacy amounts intact. Page identity, visible content,
console health and viewport overflow checks pass. These use synthetic accounts
and API fixtures, not customer data or production access. No deployment performed.

### YouTube videos

`/youtube` lets admin and superadmin connect one YouTube channel through Google.
The channel owner reviews the integration/privacy/YouTube terms before connecting,
including access for other authorized administrators to this shared channel. The
OAuth redirect is the exact admin origin plus `/youtube/callback`; this page
removes the authorization query immediately and requires **Finish connecting**.
The one-time code is sent only to the same-origin HttpOnly BFF; Google credentials
and encrypted refresh tokens belong to the backend, never this application.

Finish connecting first checks status through the authenticated BFF so an expired
admin access token can refresh before the single-use Google code is sent. The
completion request allows 45 seconds for the two bounded backend provider calls;
it is never replayed. Known backend failures show a safe error code and correction
steps instead of hiding every failure behind a generic message. Unknown provider
bodies and credentials are not displayed. After an uncertain response, return to
settings and refresh status before starting a new connection. An already-used or
expired callback link cannot be reused. This is an admin-only flow correction;
it does not alter Google verification requirements or existing channel data.
Leaving the callback cancels the pending request; a delayed authentication check
cannot start a new code exchange after navigation. The production failure behind
the former generic message is not established by isolated fixture checks.

The bounded BFF exposes `status` (GET), `connect`, `complete`, `disconnect`, `revoke`,
`erase-data` and `acknowledge-revocation` (POST) under `/api/admin/youtube`. Mutations enforce same-origin JSON, exact fields
and body limits. They are not automatically replayed after authentication failure
or ambiguous responses. Disconnect requires the current connection revision and
confirmation; local disconnect does not revoke Google's grant or remove stored
history. **Revoke access & remove stored YouTube data** posts
`{revision,confirm:true}` to `/revoke` only after a fresh unchecked confirmation. It requests
grant revocation and YouTube-data cleanup; those outcomes are displayed separately.
Neither action deletes remote YouTube videos, R2 originals, reports or ZIP media.
Google account access controls and YouTube Studio remain available as explicit
external links. Missing server `canConnect` capability disables new connections.
When automatic revocation cannot be completed and the backend exposes
`canAcknowledgeRevocation`, a separate fresh confirmation can record that an
administrator already removed access in Google Account settings. This posts the
same exact revision/confirm shape to `/acknowledge-revocation`. The resulting
`manually_confirmed` state is explicitly administrator-reported, never presented
as a Google-verified revocation. Ordinary revoke/erase cannot bypass this state.

Future explicitly reviewed Asset/Lot submissions create pending review entries,
not YouTube uploads. **Review video** submits exact title, description, selected
private/unlisted/public visibility, saved `updatedAt` and `policyConsent:true` to
`/videos/:id/review`. No video bytes are sent before this explicit admin review.
The title is at most 100 Unicode code points; the description at most 5,000 UTF-8
bytes. No truncation or trimming occurs; angle brackets, malformed surrogate text
and unsupported controls are rejected. Editing any field clears consent. Both
the modal and server require a current channel/report revision; ambiguous replies
or conflicts close the stale review and require refresh, without replay.
Oversized proposed report text is explicitly marked `metadataOmitted` and both
review fields start blank, with a warning to enter replacement YouTube text.
The original report text is preserved; the proposal is never silently shortened
or uploaded. This keeps one long description from breaking the inventory page.

Public/unlisted visibility follows the existing report release gate. Report file
generation does not wait for YouTube. Confirmed public/unlisted links remain in
the video list. Excel keeps its original column layout without a YouTube column;
video review never regenerates report files automatically. Existing files and
stored video links are not rewritten or recovered by this layout change.
Connecting does not backfill historical reports. Google may restrict an unaudited
API project's uploads to private status; the UI explains this rather than claiming
that a requested public setting proves publication. Backend setup/support must
ship before this page. No additional admin environment secrets are required.

The video status list requests 20 rows per page, without polling. Pending review,
private, uploading, needs-attention, removed, confirmed unlisted and public outcomes
remain separate. Only confirmed public/unlisted rows expose a watch link. An eligible **Retry reviewed request**
posts the exact saved `updatedAt` revision to `/videos/:id/retry-publication`.
It requests metadata publication of an existing released video, never a second
upload. Conflicts and uncertain responses require manual refresh; provider/error
rows remain visible. Ordinary report submission/release remains authoritative.

Review/erasure mutations share same-origin guards and never replay on 401. The
review body has a 32 KiB transport bound to allow JSON escaping of valid 5 KiB text;
connect/privacy bodies remain 1 KiB. Parsers strip tokens, private source URLs and
provider error data. New controls require backend support before this admin build.

Focused policy checks: `node --test tests/youtube.test.mjs`. Rendered QA must use
an isolated backend fixture; do not connect or publish to a real channel as a test.

Callback verification (2026-09-29): lint/typecheck/production build and all 96
policy tests passed. Thirteen isolated production Chromium flows at 320/390/1366px
covered session refresh, denied access, known/unknown errors, double clicks and
a 31-second response. Tested light/dark success/error states passed WCAG A/AA
checks without horizontal overflow or runtime page errors. Browser plugin was
unavailable; existing Playwright was reused. No live Google authorization,
deployment, Safari or Firefox verification was performed.

Verification (2026-09-28): admin verify and 85 policy tests pass. Isolated
production-build Chromium checks cover 25 flows at 320/390/768/1366px, light/dark,
keyboard consent, role denial, callback query/Flight stripping, one-time completion,
token redaction, disconnect cancellation/conflicts, missing configuration, paginated
videos and publication retry. Axe checks have no WCAG A/AA violations in the tested
states. Browser plugin was unavailable; existing Playwright dependencies were reused.
Real Google consent, YouTube uploads/publication, Safari and Firefox were not tested.

### Report Activity

Background report upload activity (2026-10-08, local; release pending) has Queued,
Paused, Resumed, Interrupted and Needs attention filters. An explicit
`upload_paused` / `user_pause` observation says **Upload paused by user**; Android,
network, sign-in and unknown causes stay separate. These observations are not
server acceptance, report deletion, or capture backup completion. The drawer
shows verified files only with server count authority and a valid session ID.
Closing a form does not cancel its durable transfer. Android force-stop can
prevent reporting until the app is allowed to run or is reopened, so device time
and server receipt time remain distinct. Unknown causes are never guessed.

Transfer UI verification: 106 policy tests, lint/typecheck and an isolated
production build pass. Seven read-only Chromium fixture flows cover filtering,
keyboard drawers, all interruption reasons, server-count authority, forbidden
retry and anonymous redirects at 320/390/768/844/1440px, light and dark. Screenshots
were inspected; no console errors or horizontal overflow were observed. Existing
Playwright was used because the browser plugin was unavailable. These are local
synthetic checks, not production or physical-device verification. Deploy the
matching backend before these labels and the new Android binary.

`/report-activity` provides a searchable Asset/Lot Listing activity table and a
paginated timeline for admin and superadmin. Search by user name/email and
contract, then apply source/type/action/outcome/UTC-date filters. Counts, camera
stamping, upload-logo selections, receipt verification, source/destination,
errors and permitted field comparisons remain separate facts. Missing historical
evidence is labelled Not recorded; older records show a current-state baseline.

Backup activity (2026-10-06, local; release pending) has separate Started, Paused,
Resumed, Interrupted and Completed action filters. The timeline says **Backup
paused by user** only for `backup_paused` with `backupReason: user_pause`.
Network, system, sign-in and unknown interruption reasons stay distinct; an
interruption or a delayed event never identifies a user as its cause. The list
uses the neutral Backup paused label because its summary has no reason evidence.
An explicit local draft deletion is labelled Backup paused after draft deletion;
it does not mean the user selected Pause or that cloud originals were deleted.

Each backup event shows server-verified files/photos against its frozen backup
snapshot, separately from captured counts. The counts require
`backupCountAuthority: server_verified`; a device lifecycle observation is not
itself verification. Completed backups require server authority and confirmation
of every file/photo. Missing evidence stays Not recorded, and impossible counts
fail validation. A complete older snapshot does not prove all current photos are
backed up and never implies report submission. Device time and server receipt
time remain separate; delayed receipts explain offline/stopped-app synchronization
and possible device-clock differences without guessing why work stopped.

Backup UI verification: 103 policy tests, lint/typecheck and an isolated production
build pass. Read-only loopback Chromium fixtures verify action filtering, keyboard
drawer navigation, every backup reason, 50-of-224 versus 300 captured photos,
complete server receipts, forbidden-read/manual-retry behavior, and unauthenticated
redirects at 320/390/768/844/1440px in light/dark layouts. Lifecycle observations
use Recorded badges, reserving Completed for confirmed backup completion. No
console errors or horizontal overflow in tested layouts. This is synthetic admin
UI coverage, not a production backup or physical-device certification.

The detail drawer also shows **Photos by lot** (10 rows per page), for example
`Lot 5 · 8 images`. Saved lot numbers and order are preserved. Report-only and
known missing counts are separate, and cover/thumbnail images are not counted
again. The BFF `/api/admin/report-activity/:id/lots` uses the new matching backend
endpoint; publish backend support first. Current saved report/draft counts and
last-synchronized device counts are labelled, not presented as historical events.
A deleted report without a complete current breakdown shows unavailable, not zero.

Per-lot UI verification: admin lint/typecheck/build and 77 policy tests pass.
Isolated Chromium checks exercise legacy/current records, 43-lot pagination,
keyboard navigation, retry and unavailable states, and 320/390/1440px light/dark
layouts with axe checks. Screenshot fixtures are local, not production records.

The Captures tab reuses Offline Captures; `/offline-captures` redirects to
`/report-activity?tab=captures`. All reads and removal go through the same-origin
HttpOnly BFF. Operational visibility does not grant preview/field-value access.
Deleted-report values are superadmin-only, and deleted preview links are disabled.
Superadmin removal requires confirmation plus the reviewed revision and removes
only history, not reports/photos. A server tombstone rejects delayed restoration.

Filters are explicitly applied, requests are abort-fenced, previous results are
labelled when a refresh fails, and last-refresh/receipt/device times are distinct.
Deploy the backend ledger before this admin build. See the backend
`docs/report-activity.md` for audit/privacy boundaries and release gates.

Verification: `npm run verify`, `node --test tests/*.test.mjs`; isolated local
Chromium checks cover 320/390/768/1440px, light/dark, timeline expansion, filters,
deleted/baseline/error states, keyboard controls and axe accessibility. No live
reports or production endpoints are needed for these fixtures.

```mermaid
flowchart LR
  Browser["Admin browser"] -->|"HTTPS + HttpOnly session cookies"| Next["Next.js admin app"]
  Next -->|"Bearer access token"| API["Asset Insight backend"]
  API --> Mongo[("MongoDB")]
  API --> R2["Cloudflare R2"]
```

Browser code calls same-origin route handlers under `/api/admin/*`; backend access and refresh tokens remain in HttpOnly cookies. The support workspace uses `/api/admin/support/*` as a strict, method-and-path allow-listed proxy to the ownership-scoped `/api/support/*` customer API. It does not expose the developer inbox, agent search, internal notes, assignments, priorities, activity, or todo APIs. Image and video bodies stream through the authenticated proxy to the backend, which validates and stores them in R2 before returning a renderable attachment.

## Environment

Create `.env.local` for local development or configure the same value in the production process environment:

```env
# Backend origin only; do not append /api.
NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:4000

# Optional provider credentials used by existing image tooling.
HITPAW_API_KEY=
PICSART_API_KEY=
```

Never commit real credentials. The admin application does not need MongoDB or R2 credentials; those remain in the authenticated backend.

## Commands

Use Node.js 22 through 26 with npm 10 or 11. The local compatibility gate is
verified with Node.js 26.7 and npm 11.

```bash
npm ci
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm start
```

The support feature should be checked at desktop, tablet, portrait mobile, and landscape mobile widths. Only the request list and message timeline are intended to scroll; the document and reply composer remain fixed to the viewport.

## Dashboard overview

The superadmin-only `/dashboard` uses the existing same-origin desktop-dashboard
snapshot. Its compact metric band leads into one lazy-loaded Chart.js activity
plot, directly labelled report-type bars, independent current-workflow bars,
recent reports and the existing settings controls. The `/stats` workspace,
navigation, authorization and HttpOnly BFF are unchanged.

Reports/lots/activity/types follow the applied inclusive UTC date range. Registered
users and Pending / Approved counts are all-time; the historical `kpis.released`
wire key counts approved reports, not actual releases. Queue and recent reports
also use all dates. Salvage activity uses grouped generated-file creation dates,
not canonical parent creation or completed throughput. The visible source note
retains this limitation. See backend `docs/architecture/runtime-flows.md` for exact
eligibility, archive and timezone scopes. Deploy its matching Salvage activity
predicate fix with this interface so daily and type/KPI sources agree.

Date edits are staged: Cancel discards them and Apply issues one request. A
superseded request cannot replace a newer snapshot. Refresh, timeout, malformed
payload and network errors retain the last successful data with its time and
range; unavailable fields are not converted to zero. Manual refresh is the update
model, not a live stream. The selected range is page-local and resets on a new
visit. The chart has a keyboard/touch Data view; long ranges use at most 180
contiguous date bins with unchanged totals and explicit missing intervals.
This bounds browser rendering only; the backend still returns daily data across
the requested range. Chart animation is disabled and the two small bar lists
are DOM elements, not additional chart instances.

Workflow counts are not a funnel. Drill-down explains that the sample contains
up to 60 recently updated queue items; filtered Stats remains the full-detail
path. Ready today uses Regina time and the release or last-update date. Recent
reports preserve up to eight records, with a scrollable desktop table and wrapping
mobile rows. An inherited legacy release flag never turns a draft, preview,
processing or pending report into a Released badge.

Settings load on first open, handle independent failures, and cannot save unloaded
defaults. Rebuild the admin application to update its browser bundle.

Verification: `npm run verify` and `node --test tests/*.test.mjs`. Dashboard-focused
data/status/date/payload cases live in `tests/dashboard-data.test.mjs` and
`tests/dashboard-payload.test.mjs`. Use isolated upstream fixtures to check date
Apply/Cancel, stale-response ordering, failures, Chart/Data parity, settings,
and queue focus restoration at desktop/tablet/mobile sizes; do not use
production settings mutations as a visual test.

2026-09-14 acceptance: admin verify and 47 policy/data tests passed; the paired
backend verify passed 1,764 tests plus the report-workflow check. Isolated
production-build Chromium checks covered date Apply/Cancel, Chart/Data totals,
queue focus, lazy settings, failed/forbidden/malformed
responses, delayed-request ordering and 175-bin long-range totals. Responsive
checks covered 320, 390, 480, 768, 844, 1200 and 1536 px widths. Tested light/dark
dashboard and focused dialogs had zero axe violations. The approved desktop and
mobile concepts were compared with final screenshots; real navigation, full
eight-record metadata and accessible touch targets intentionally remain intact.
No production data/settings, new packages, push or deployment were involved;
Safari/Firefox and production-scale response latency remain unverified.

## Report approvals

Both `admin` and `superadmin` can open Pending Approvals. Ordinary `user` accounts remain limited to their permitted reports; the backend authorizes every decision. Pending rows group sibling files by parent report, but review/approve/return actions use the actual row/artifact ID.

Real Estate and Salvage use **Approve & release**: successful approval publishes their complete current files without a second release step. Asset approval/release behavior is unchanged. Older already-approved Real Estate/Salvage reports that still have a pending release retain a **Legacy release** action; the UI never invents download readiness or rewrites existing records.

Processing/incomplete file sets cannot be approved. Approval errors remain visible and retain the row for review/retry. Pending/approve/return requests use the shared HttpOnly-cookie BFF, refreshing only on `401` and preserving genuine `403`/`409` responses. Focused policy tests: `node --test tests/report-approval-ui-policy.test.mjs`.

Canadian Salvage assessment v2 approval loads the current report revision before
showing mandatory evidence-limit acknowledgements and a review note. The BFF
forwards only `{salvageReviewAcknowledgement: {baseRevision, limitationCodes,
note}}`; the backend supplies reviewer identity/time and records the audit against
the approved artifact generation, not as a signature in existing files. A `409`
clears the checked limitations and note and requires a manual reload/re-review;
it never retries approval automatically. Legacy Salvage and other report families
retain their existing decisions. No new role or separate release step is added.

Salvage report data uses optional backend-built `report_enrichment` v1 for a read-only, localized executive summary, assignment/condition context, repair provenance, comparable verification, calculations, evidence/photo index, review checklist, revision history and references. Responsive tables display saved strings only. Generic nested assessment/context duplicates are omitted when this projection is present; the complete snapshot remains available in Raw JSON. The existing HttpOnly BFF, current-revision acknowledgement and approval controls remain unchanged.

## Saved Asset/Lot preview recovery

Preview Reports provides **Resubmit preview** for eligible saved Asset and Lot
Listing previews. The backend supplies eligibility, an explanation when blocked,
and an opaque revision bound to the loaded data. Confirming rebuilds files from
that saved preview on the same report, without new analysis. Asset approval and
release rules remain unchanged; Lot Listings approve/release only after successful
file publication. Draft Preview drawers remain read-only.

The browser sends only `{baseRevision}` through the dedicated same-origin,
HttpOnly-cookie BFF. The request is limited to 2 KiB even for chunked bodies;
caller-supplied report data and actor fields are never forwarded. Backend role,
revision, workflow and media checks remain authoritative. Duplicate clicks are
blocked, acceptance closes the drawer and refreshes the queue, and a `409` or
uncertain response requires **Reload and review**, never automatic resubmission.
Older backend responses without eligibility/revision disable this action; deploy
backend support first. This feature does not repair missing uploads or duplicate
stored files. Focused checks: `node --test tests/preview-resubmit-request.test.mjs`.

Reassignment also supports submitted Asset/Lot previews whose file generation
failed, when the backend reports `transferEligible`. `transferRequiresReview`
adds an explicit warning: ownership moves on the same report with saved data and
the failure diagnostic retained; no files are queued. The receiving user reviews
and explicitly resubmits from Previews. Ready/unsubmitted previews are never
automatically submitted. Active generation and successful reports remain blocked.
Transfer confirmation closes stale owner/revision details and refreshes the list;
conflicts, timeouts and uncertain responses require manual reload/review without
automatic replay. The existing superadmin Preview Reports boundary is unchanged.

## Reviewed preview-owner notifications

Preview Reports provides **Notify** from each list row/card and the detail drawer.
Both open one email-style composer. A side-effect-free reminder GET loads the
current owner, report correction details, affected lots, suggested steps and
subject/body from the backend. The recipient is read-only; administrators review
and edit the plain-text subject/message before explicitly sending email plus an
in-app notification. Opening the composer does not send anything or alter reports.
Notify remains available when a new send is blocked: the current draft explains
the reason and disables Send, while an existing delivery can still be checked.

POST forwards only `subject`, `message`, `baseRevision` and a stable UUID
`requestId` through the HttpOnly BFF. Same-origin, JSON and streamed 64 KiB limits
protect this mutation. The backend validates current ownership/state; a 409
requires reload/review. Pending or uncertain delivery freezes its original
recipient/text/revision/request ID, including after reopening. **Check delivery**
reuses that request without asking the email provider to send again. No automatic
email retries or fresh IDs are created after an uncertain response. Confirmed
delivery and accepted processing refresh the list with accurate status feedback.
The existing superadmin boundary is unchanged; deploy backend support first.
Policy checks: `node --test tests/preview-reminder-request.test.mjs`.

## Offline capture inventory

`/offline-captures` is available to **admin and superadmin**. It displays only
the device metadata last synchronized to the backend: creator, contract, report
type, device status, lot/photo counts and device-clock capture/save times.
Filters are applied explicitly; user lookup, list rows and per-lot details are
bounded and paginated. **Last synchronized** date filters use inclusive UTC days
against the server receipt time, not the untrusted device clock.

Device counts are not proof of an uploaded photo or a cloud backup. Offline
devices may have newer changes; captures never synchronized cannot appear here.
The detail dialog separates device-reported inventory from server-confirmed
upload counts, acceptance, preview submission, processing and file generation.
Unknown uploaded counts remain **Not confirmed**, distinct from zero. **Files
generated** does not grant approval, release or download access. Existing Preview
Reports permissions remain unchanged; a linked report ID is informational only.
There are no photo URLs, device paths, private form notes or media previews.

Browser requests stay on the HttpOnly BFF:

- `GET /api/admin/capture-inventory/users?search=&limit=`
- `GET /api/admin/capture-inventory?userId=&search=&reportType=&localStatus=&receivedFrom=&receivedTo=&page=&limit=`
- `GET /api/admin/capture-inventory/:id?lotsPage=&lotsLimit=`
- `DELETE /api/admin/capture-inventory/:id` with the exact loaded `{revision}`.

Capture ledger `:id` is the backend's 64-character SHA-256 identity. It is distinct
from the device capture UUID and the 24-character Mongo user/report IDs; user
filters keep their existing Mongo ID validation.

The final action is offered **only for discarded device history**, after explicit
confirmation. It tombstones metadata; it never deletes device photos, uploaded
objects, drafts or reports. The proxy enforces same-origin JSON, a streamed 1 KiB
body bound and revision-only input; the backend freshly verifies role, state and
revision. A conflict or uncertain response requires reload and review, never an
automatic replay. Reads are no-store and abort-fenced. A failed refresh retains
the last valid snapshot with a warning, rather than turning invalid data into
zero counts. Deploy backend inventory support before enabling this admin build.

Focused policies: `node --test tests/capture-inventory.test.mjs`.

Verification (2026-09-17): admin verification/build and 70 policy tests passed.
An isolated mock backend and the production Next build passed Chromium checks
with actual backend-style owner/UUID SHA-256 capture identities
at 1440px in light/dark, 768px, 390px and 320px, including list/lot pagination,
staged filters, failed/malformed refreshes, roles, BFF origin/size/allowlist gates,
out-of-order reads, revision conflicts and uncertain removal. Page/detail axe
checks found no remaining violations, and no browser bearer headers, external
requests or production runtime console errors were observed. Browser plugin was
unavailable, so the existing sibling Playwright installation was used. Safari,
Firefox, real-device interaction and production latency remain unverified. MUI
7.3.11 emits an internal Autocomplete key warning only in development; no package
changes were introduced. No production data, files or deployments were touched.

## Production deployment

Production runs as the `assetinsight-admin` PM2 application from `ecosystem.config.cjs`, normally as two cluster workers on port `3001` behind Nginx.

```bash
npm run deploy
```

The deploy command fast-forwards `main`, installs the lockfile exactly, builds Next.js, reloads only `assetinsight-admin`, and saves PM2 state. Run it from the production admin checkout after the intended commit is available on `origin/main`.

Post-deploy checks:

```bash
pm2 status assetinsight-admin
curl --fail --head http://127.0.0.1:3001/login
curl --fail --head https://admin.assetinsightvaluator.com/login
```

Then verify that the signed-in administrator sees only their own requests, can create a request, can retry a reply without duplication, and can upload and render one image and one video. Confirm that developer-only support routes remain unavailable through the admin proxy. Do not expose port `3001` publicly; Nginx is the public TLS boundary.

For support media, install the location in `ops/nginx/support-upload-location.conf` inside the admin HTTPS server block. It disables request buffering only for the authenticated raw-upload route and aligns the proxy timeout with the 15-minute application limit. Always run `nginx -t` before a graceful reload.

## Support workflow invariants

- Every support read or mutation is authorized by the backend's ownership-scoped customer support middleware and the authenticated User ID.
- A known conversation ID owned by another account must still return `404`.
- Internal developer notes are never returned by the customer message API.
- A stable `clientMessageId` is reused only while retrying the same logical reply.
- Attachments are not rendered or claimable until the backend verifies them as `ready`.
- Uploads use the server-mediated streaming endpoint; browser R2 credentials and bucket CORS are not required.
- New-request media is attached only after the initial request creates a conversation ID. A partial media failure must keep that request selected instead of creating a duplicate.
- Developer queue access is a separate backend capability and is not implied by `admin` or `superadmin` role membership.
- Public media URLs are bearer-like references and must not be written to application logs.
