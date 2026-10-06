# Preview queue reliability — 2026-10-03

## Combined preview save and generation — 2026-10-05 (local)

Asset and Lot Listing editors have one primary action: **Save & Generate** for
initial/declined previews, **Save & Regenerate** for submitted/approved/failed
reports with a saved preview. The assigned Asset approver action explicitly says
**Save, Regenerate & Approve**; its existing endpoint and approval authority are
unchanged. Hidden draft previews still use the atomic promotion-and-submit path.

The button sends the complete current preview in the existing submit/resubmit
request. There is no preceding metadata-only PUT or subsequent client-side CR
refresh. The API validates and saves that snapshot with its durable file-job
handoff. Every artifact is generated from the snapshot, not the older saved
preview. Asset approval/release and Lot Listing automatic release stay unchanged;
this does not send reports to Auctioneer or publish YouTube videos.

The existing immediate mutation lock excludes double clicks and concurrent photo
uploads. An accepted request shows generation in progress; validation/network
failure keeps edits in the editor for deliberate retry. Late responses cannot
close or replace a different report. Description, serial, cover and per-lot photo
order regressions now exercise the combined action.

Verified using isolated backend generation/submission tests, web component tests,
typecheck/lint/build and production-build Chromium flows at 1366px light and 320px
dark. Browser plugin not available; repository Playwright used loopback fixtures
with external requests blocked. No customer report generation, production changes,
push or deployment. Native uses the same combined workflow in a new app binary.

Final local gates: 1,240 web tests in 113 files, 161 focused backend tests,
workflow policy checks, web typecheck/lint/build, and 12 Chromium interaction
flows passed. Fixture tests verify edited snapshots and generated file content;
they do not certify production storage or customer report regeneration.

The queue now reads each report type once using the backend's optional
`view=previews` compact response. Editor reads remain full owner-bound records;
cloud draft hydration still receives its original metadata. Install backend
support before deploying this client. Older full list responses remain readable.

Each report type and the draft list settle independently with a 30-second queue
request timeout. Successful sections update; failed sections retain last-loaded
rows. Errors distinguish server failures, session/access restrictions, throttling,
timeouts and connectivity instead of claiming the internet is down or showing an
empty success. Counts marked `*` are last loaded and may be stale; unknown counts
are `—`. Last complete refresh time is displayed separately.

Initial Lot Listing processing must appear in New even when `files_generating`
is true. Submitted is determined by explicit submission/status/target evidence.
An empty New tab offers direct access to existing Submitted previews. A mutation
invalidates an earlier in-flight poll and schedules one fresh read so the old
response cannot restore the pre-submission list. Account/unmount fences remain;
queue retries never submit reports or change customer data.

Verification: full unit suite, TypeScript, lint and production build; ten isolated
Playwright cases for light/dark, keyboard, five processing reports, submitted
navigation, partial failure/retry and retained rows, including 320px layouts.
Browser plugin was unavailable, so repository Playwright was used with fixture
API responses and nonlocal requests blocked. This does not certify production
network health or a particular user's historical phone failure.

No push or deployment is included. Local QA builds use loopback configuration;
rebuild with production configuration when release is separately authorized.

## Lot Listing optional appraisal fields — 2026-10-03 (local)

Lot Listing previews no longer render the Required selections block or the bulk
Running Condition control. Generate/Regenerate does not require Running Condition,
Completeness, Legal or N/A choices. FMV is optional in the paired backend change,
including admin resubmission and the final file-generation worker. Existing saved
selections/values remain in the payload; report layouts and Asset appraisal
controls are unchanged. Install API/worker support before this web release and
the new native binary. Historical failed reports need explicit regeneration, not
deletion or re-uploading their original media.

Regression coverage includes blank FMV/selections, retained edited descriptions,
old failed-preview regeneration, and unchanged Asset selection controls. The
production-build browser smoke used CUA Chrome with a loopback-only synthetic API
at desktop/light and 320px/dark, including keyboard regeneration and no horizontal
overflow or console errors. No real customer report, email or Auctioneer write was
used. Production deployment and physical-device validation remain separate.
