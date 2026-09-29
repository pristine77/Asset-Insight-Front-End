# Appraiser web CRM

`/crm` brings the existing native CRM workflows into a separate appraiser web workspace.
Only an explicitly enabled `isCrmAgent === true` user sees the navigation or
starts CRM requests. Backend authentication, device checks, current assignment
and update authorship remain authoritative; admin role alone grants no access.

## Workspace and workflows

- **Entry:** `/workspaces` offers Listings and CRM only to currently enabled CRM
  users. Everyone else goes to `/dashboard`. Generic signed-in app/login entry
  uses the chooser; explicit internal deep links bypass it, including queries
  retained through sign-in and device approval. Roles alone do not enable CRM.
- **Separate navigation:** CRM links are Dashboard (`/crm`), Tasks (`/crm/tasks`),
  Transfers (`/crm/transfers`), Outlook Calendar (`/crm/outlook`) and Coverage
  (`/crm/coverage`). Listings retains existing report routes/capability gates.
  Switch workspace returns to the chooser. Support, Settings and Notifications
  share a per-owner sessionStorage navigation hint, never an authorization grant.
  Explicit report/CRM routes override that hint; another account cannot inherit it.
- **Dashboard:** six all-assigned-lead metrics, eight directly labelled stage bars
  and at most five Overdue/Next 7 days rows. A single backend aggregate returns a
  coherent owner-scoped snapshot. Bars show count/total, not decorative lengths.
  Total/Imported/Organic links include closed leads; due lists exclude Won/Lost.
  Due dates are stored instants, with a strict-before-now overdue boundary and an
  inclusive now-to-seven-days upcoming boundary, captured in `asOf`.

- **Tasks:** debounced literal search, stage/source/due filters, 20/50-row server
  pagination, sticky desktop headers, compact mobile rows and last-refresh time.
  Open tasks uses the existing backend scope, not all historic assignments.
  Search, filters and pagination are URL-backed and support Back/Forward.
  Opening a task or another route cancels unfinished search debounce; a pending
  search cannot close the task drawer by replacing its URL.
- **Task details:** direct notification links resolve independently of the list
  page/filter. Contact/company/import facts are read-only. Activity is fetched
  20 entries at a time, including deleted tombstones, newest first.
- **Follow-up:** stage, Lost reason, multiline comment, up to ten attachments
  and one recording (50 MiB each). Every new update records a contact attempt.
  Unchanged status is omitted so comment-only updates do not reset reminders.
  Own historical entries/media can be edited or removed with confirmation;
  history status changes retain existing backend scheduling semantics.
- **Email and voice:** browser recording is local until explicit transcription,
  with a 25 MiB bound and microphone cleanup. Typed text remains available when
  recording is unsupported/denied. Email rewrite is explicit and returned HTML
  is converted to plain editable text. Open email app prepares a mailto draft;
  it never means an email has been sent.
- **Add lead / Coverage:** create an organic lead with a local-time follow-up,
  or edit service address, coverage quadrants and specializations. Existing
  canonical comma-separated coverage is preserved. These are not general
  contact-edit/delete or administrator assignment tools.
  Coverage has its own screen and refreshes the current owner's saved profile
  before opening the existing protected edit drawer. An uncertain save is checked
  against fresh saved values, without treating a failed profile read as logout.
- **Transfers:** choose an enabled agent from task details; incoming requests
  can be accepted/rejected in Transfers. The API returns the latest 100 per status,
  which the UI labels explicitly rather than claiming an unlimited archive.
- **Outlook:** connection/disconnection and explicit single/bulk task-event
  export (at most 100 selected). This is not a calendar event-reader API. Every
  export creates new events; repeats can duplicate them. Validate provider
  receipts, expose actual outcomes and do not infer success for missing results.

## Performance and safety

The backend adds `GET /crm/tasks/dashboard`, `GET /crm/tasks/my?view=summary`, `GET /crm/tasks/:id` and
`GET /crm/tasks/:id/updates`. See the backend `docs/crm-agent-api.md` for precise
contracts. Summary projection excludes embedded history, company notes, imports
and media before API materialization. Legacy native reads/mutation responses
remain compatible; full mutation histories are discarded by the web detail
editor after updating its bounded cache.

Dashboard, task detail, lead/coverage forms, Transfers and Outlook load as separate
dynamic chunks. The dashboard uses DOM/CSS bars, not a chart package. No new UI
dependencies, CRM polling or full-history list loading. Dashboard summaries are
strictly parsed: unavailable/malformed totals never become zero. A failed refresh
retains a labelled last-good snapshot; definitive access errors remove it.
The chooser starts no CRM/report reads. CRM does not mount Listings report search,
Incoming summary polling or report-activity synchronization. Notifications remain
available with owner-scoped cache keys. Unknown identities/shared-mode hydration
do not briefly start protected Listings reads.
Read requests have a 20-second timeout, scoped owner/query keys and shared
cancellation that survives StrictMode and multiple consumers. Abandoned queries
are aborted after the final consumer leaves; late results cannot replace another
owner/filter. Definitive access errors hide cached data. Account changes unmount
the owner's panels. Reconnection refreshes reads, never replays a mutation.

Mutations use immediate single-flight locks and disable Axios automatic 401 replay.
There is no new server idempotency protocol for legacy CRM actions. An uncertain
response keeps entered text and instructs the operator to check the saved activity,
task list or calendar before trying again. Calendar attempts clear their selection.
Dirty detail/history/email navigation asks before discarding. Coverage rereads saved
profile values before a new edit attempt and preserves the protected drawer.

Sign-out clears the local session immediately and completes after a bounded,
best-effort server revocation. Session revisions fence late account, device and
token-refresh responses; login failures keep their original error and are not
replayed as refresh requests. Background identity reads cannot supersede an
in-flight login or device exchange. Cookie/storage keys and report lifecycle
semantics are unchanged. Complete cross-tab account reconciliation is a
pre-existing limitation: reload other open tabs after switching accounts in
another tab. Response fencing does not imply live React identity synchronization
between tabs.

CRM notifications resolve to `/crm/tasks?task=<24-hex-id>`, `/crm/transfers` or
`/crm`. Legacy `/crm?task=...` and `?view=transfers|outlook` normalize to separate
pages before the dashboard mounts. Existing report reminder/incoming behavior is preserved. All external
media/contact links require safe protocols; provider HTML is never rendered.

## Initial task/detail design and QA

The accepted desktop concept establishes the compact blue-accent heading/actions,
flat tabbed surface, five data columns, outlined filters and bottom pagination.
The mobile concept establishes contact hierarchy, inline actions, Activity/Details,
bordered follow-up form and timeline. Actual implementation preserves the existing
logo, sidebar, safe-area drawer and theme tokens. Intentional differences: only
real Imported/Organic sources, real API totals, no invented sortable column,
Outlook/recording controls, reminder/uncertainty guidance and bounded history pages.

Browser verification uses synthetic API interception and blocks external requests;
no customer records, email deliveries, calendar events or paid provider calls are
created. The local in-app browser confirms the real authentication boundary;
Playwright supplies isolated request fixtures, viewport changes and automated axe
checks not available through the interactive browser surface. Test coverage lives
in `e2e/crm.spec.ts`, `components/crm/*.test.tsx`, `services/crm.test.ts` and the
notification/navigation suites. Desktop concept size is 1586×992; additional
coverage includes 320px, 390px, 1024px, 1366px, 1535px and 844×390 landscape.

### Visual fidelity review

The final production build was captured using Playwright viewport screenshots,
then inspected with `view_image` alongside both accepted concepts. The desktop
comparison used the concept's native 1586×992 viewport. The mobile detail concept
was also checked against 320px and 390px narrow-screen renders in light/dark themes.
The review covered:

| Comparison | Concept and rendered evidence | Resolution |
| --- | --- | --- |
| Structure | CRM heading/actions, Tasks/Transfers/Outlook, filters, five data columns and pager | Preserved; no dashboard cards or invented metrics. |
| Copy | CRM, Leads/follow-ups/appointments, Coverage, Add lead, tab and form labels | Above-the-fold copy diff retains workflow wording; actual API source labels and refresh times replace illustrative values. |
| Typography | Strong contact names, muted company lines, explicit compact control sizing | Uses existing Geist/control tokens; denser than the illustrative font scale to satisfy the requested compact workspace. |
| Palette | White/cool-neutral surfaces and blue actions, without decorative effects | Existing light/dark theme tokens retained throughout. |
| Branding/icons | Outline navigation/action icons and existing application shell | Existing Asset Insight logo, authorized navigation and Lucide icons intentionally replace the generated shell mockup. |
| Table geometry | Contact column remains readable with or without selection | Fixed an oversized Outlook checkbox column; browser assertions now require a narrow selection column and usable contact width. |
| Mobile detail | Contact hierarchy, Call/Email/Transfer, Activity/Details, follow-up form and timeline | Existing safe-area drawer replaces the mockup's custom header; controls wrap and content scrolls without horizontal overflow. |
| Required extras | Outlook export, recording attachment, uncertain-response and reminder guidance | Intentional native-workflow additions; pagination replaces the illustrative unlimited history control. |

The implementation is faithfully verified against the accepted design with these
explicit compatibility/density differences; no material unresolved visual mismatch
remains. The core checked path is search/page → open task → edit/save follow-up →
inspect history, plus lead/coverage saves, transfer acceptance, dirty-edit protection
and explicit Outlook/email actions. Production components contain no fixture data.

### Initial task/detail verification result (2026-09-23, before workspace split)

- Web: production build, TypeScript, lint and all 741 unit tests passed.
- Browser: 45 isolated production-build scenarios passed across five viewport
  projects, including light/dark axe checks, 320px checks, mutations, failures,
  access gates and explicit email/calendar handoffs.
- Backend: all 26 new CRM route integration cases, typecheck and build passed.
  The full suite returned 2,000 passes and one unrelated existing failure at
  `tests/admin-preview-resubmit.integration.test.ts:128`. Its whole-document
  equality assertion rejects existing activity-ledger metadata added during a
  missing-FMV rejection; the failure also reproduces in isolation. No report
  generation or recovery behavior was changed as part of CRM.

Deploy backend read support **before** this web client. No native/admin changes,
new packages or migrations were made, and nothing was pushed or deployed.
Real Microsoft consent/delivery, live transcription, physical mobile browsers and
deployment-scale database latency remain separate acceptance checks.

## Workspace split design and acceptance (2026-09-23)

The new chooser and CRM dashboard use generated desktop references at native
1536×1024, plus a mobile dashboard reference. They are design-time references only;
no generated bitmap or fixture data ships in the UI. The prior Tasks/detail design
remains the reference for those screens, with the old workspace tabs removed.

The browser flow is signed-in entry → chooser → CRM dashboard → metric drill-down
→ task/detail edit → switch workspace → Listings. Additional checks cover legacy
links, denied/revoked access, shared notifications, coverage, transfers, Outlook,
failed saves, last-good dashboard refreshes and dirty-edit protection. The local
in-app browser first confirms signed-out entry. Isolated Playwright interception
is used for authenticated fixture/permission tests because the interactive browser
surface does not provide request interception/auth fixture setup. All non-loopback
requests are blocked; no live provider operations or customer records are used.

| Visual comparison | Implementation and intentional differences |
| --- | --- |
| Chooser structure | Neutral slim header, centered choice heading, two equal desktop panels; stacked narrow-screen choices with no sidebar or report queries. |
| Dashboard structure | Six metrics, 40/60 desktop pipeline/follow-up panels, 2×3 mobile metrics and follow-ups before the pipeline. |
| Navigation | Existing logo/theme/profile/collapse controls retained; one functional workspace switch replaces the concept's duplicate switch labels. Each workspace has its own links. |
| Typography/density | Existing Geist and compact 13–14px app controls intentionally replace oversized illustrative type. No unnecessary decoration. |
| Copy | Chooser/dashboard titles and descriptions preserved. Actual saved values, source labels and full snapshot time replace illustrative data. Existing safe drawer wording remains authoritative. |
| Chart truthfulness | All eight tracks share columns/baselines and exact counts. Count/total fill intentionally replaces the concept's arbitrary bar lengths; zero stays zero. |
| Controls/branding | Existing blue primary buttons and Asset Insight mark replace mock wordmark/plain links. Touch targets, visible focus and long text wrapping retained. |
| Accessibility | Light/dark, 320px and landscape checks include keyboard tabs and axe; overdue-date contrast is checked on hover as well as resting state. |

The final production screenshots were directly inspected alongside the generated
references. Structure, copy, typography, palette, branding, chart geometry and
responsive controls are faithfully verified with the intentional differences
listed above. No unresolved material visual mismatch remains.

### Final workspace verification

- Web: 98 test files / 906 tests, TypeScript, lint and the production build pass.
- Browser: all 75 isolated production-build cases pass across five viewport
  projects, plus explicit 320px and 1536×1024 reference-size checks. URL/title,
  meaningful rendered content, absent framework overlays, app console health,
  screenshots, light/dark axe and actual interactions were verified. Failed-login
  validation also confirms the original error and no refresh attempt. The fixture
  locator is scoped to the visible login error, excluding Next's route announcer.
  Commands: `npm run start -- -p 3011` and `npx playwright test e2e/crm.spec.ts`
  with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011`, external requests blocked, and
  screenshots/traces outside the repository. Temporary servers/tabs were closed.
- Backend: full `npm run verify` passes (149 test files / 2,019 tests, typecheck,
  centralized-client guard and build); `npm run check:report-workflow` also passes.
  The earlier task-only gate's unrelated assertion failure was not reproduced in
  this final run; this change does not claim to repair report recovery.
- Independent auth review and all 40 focused session cases pass, including
  rejected login credentials, same-session refresh coalescing, logout, delayed
  requests, device restrictions and background identity-read ordering.

No native/admin updates, packages, migration, push or deployment are included.
Backend dashboard support must be released before the web build. Real database
latency, Microsoft consent/delivery, physical mobile browsers and Safari/Firefox
remain separate acceptance checks, not claims from local Chromium fixtures.
