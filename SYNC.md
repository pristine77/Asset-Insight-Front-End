# Sanitized application synchronization

## 10 October 2026 follow-up

Content-only update on Pristine77 `474a712`, from web `ddcc11e` and admin
`9623890`. Adds the missing all-lot monetary column totals and changes each
lot's Buyer Premium to 15% of the entered evaluator average, capped at 2,000.
Total Expected Gross and Allocated Value use average plus premium. Blank/zero
handling, full precision, low/high estimates and existing high-based costs are
preserved. The matching backend calculation contract is
`asset-pv-v2-average-premium`.

Native source `dc73c68` and both exported mobile copies are unchanged.
Pristine's web upload changes, Bank/logo policy and camera behavior remain
untouched. No dependencies or lockfiles changed. Provider usage/accounting,
credit-cost calculations and multipliers remain excluded; no source Git history,
secrets, generated binaries or private operational records are exported.

Deploy the matching backend before web/admin. This synchronization does not
deploy, publish a mobile release or rewrite customer data or existing files.
Downloaded valuation spreadsheets need a fresh export after deployment.

## 9 October 2026 follow-up

Content-only update retaining Pristine77 history through `9d4bc4b`, including
both newer web background-upload commits without replacing their files.

| Application | Source revision |
| --- | --- |
| Admin | `fb51fcd` |
| Web | `222cb0b` |
| Native | `dc73c68` |

Adds explicit durable Android Asset/Lot submission, queued Incoming Create Lot
& Continue, interruption/acceptance activity, reviewed CR specification
preservation across regeneration, and the automatic Proposal Valuation owner
evaluator in web/admin. Existing owner values and four additional evaluator
slots remain intact. Team Reports is not implemented; its management assignment
is still to be clarified. Nothing grants broader access by inference.

Preserves Pristine's Bank/logo policy, native CameraX/September controls,
fixed-lot locks, asynchronous journal snapshots, 3000px photo policy and
720p/30fps video. Capture backup remains disabled. The separate Mobile-APK
repository receives the same application changes; its standalone README remains
repository-specific. Report layouts and source media are not rewritten.

OpenAI/provider usage accounting, credit/cost calculations, multipliers and
Salvage provider-cost tracking remain excluded. Only application content is
exported: no source Git history, environment secrets, signing credentials,
generated binaries or private operational records are included.

Merged checks pass: 1,304 web tests across 117 files, 102 admin policy tests,
five root boundary tests, lint/typechecks and production builds. Both native
copies pass 1,430 tests across 115 suites and TypeScript; Android/iOS Hermes
exports and Android transfer/camera/app main/instrumentation Kotlin compile
pass. Two native 100-lot cases timed out during concurrent compilation, then
passed unchanged in focused and both full runs; no test timeout was relaxed.

Twelve isolated production Chromium flows at 1366px/light and 320px/dark cover
owner locking and additional evaluator assignments, plus Asset/Lot first and
repeat generation with reviewed fields/blanks/deletions preserved after reopen.
Actual exported backend normalization was used for preview fixtures. Page,
content, console, overlay, screenshot and interaction checks pass. Browser
plugin unavailable; installed Playwright reused. The temporary build dependency
symlink was replaced with a local dependency copy for Turbopack; no app config
was changed to make builds pass.

Deploy the matching backend before web/admin and a new native binary. This push
does not deploy, sign/release an APK, submit to Play, regenerate historical
reports, or modify customer data. Physical-device, real storage/mail/provider
behavior and large-original concurrency remain normal release-validation gates.

## 7 October 2026 follow-up

Content-only update on Pristine77 `ed75dbb`:

| Application | Source revision |
| --- | --- |
| Admin | `0da9a8d8cf770a5b7286b1cf77d02804a79de2db` |
| Web | `790f23ebbfabe95385419b2324f644adba045297` (already current) |
| Native | `c43c079c17594f71bed8ff03ab69411f1ec9bdef` |

Adds native same-contract Continue, non-destructive draft restore/sync, original
Android CameraX routing and fixed-lot locks, September landscape controls with a
visible scrollbar, Play permission/first-login corrections, and backup activity
support. Background capture backup stays disabled in production build profiles.
Video remains 720p/30fps and the existing 3000px photo policy is unchanged.

Pristine's logo defaults, Bank policy, bounded photo decoder and ordered
off-main journal writes are retained. Queued journal snapshots also capture
fixed-lot metadata so a later form cannot change an earlier session's authority.
The paired standalone mobile repository receives the same application content.

The provider-accounting exclusions below remain enforced. No credentials, source
Git history, production deployment, signing or Play submission is included.

Verification: 96 admin policy tests, lint/typecheck/build, five root export
boundary tests, and 1,338 native tests across 111 suites in each mobile copy pass.
Native typechecks, Android/iOS Hermes exports, Android camera compilation/resource
processing and app instrumentation Kotlin compilation pass. The asynchronous
snapshot regression is compiled for Android; no new device run is claimed.
Web source is unchanged in this follow-up. Final source parity, secret/accounting
and whitespace audits pass. Build artifacts use isolated endpoints and are not
release artifacts.

6 October 2026 content-only synchronization, retaining Pristine77 history through
`551205d`. Source Git history is not imported.

| Application | Source revision |
| --- | --- |
| Admin | `3e73e2d` |
| Web | `790f23e` |
| Native | `0be47f1` |

Includes combined Asset/Lot preview Save & Generate / Save & Regenerate,
optional Lot Listing appraisal fields, resilient preview loading and app-version
Report Activity, account-deletion links, and upload/contract-close safeguards.
Interrupted uploads require explicit Resume. Existing Pristine camera,
landscape, device approval and add-logo-where-missing changes are retained.
Standard photo sizing remains 3000 px; high resolution remains 6000 px, with
existing encoding targets. This source export does not produce a new APK/AAB.

Incoming contact metadata, authentication recovery, media/order/serial integrity,
same-contract continuation, Schedule A lineage, CRM Coverage and authenticated
admin artifact downloads remain available. Existing report layouts are preserved;
Excel generation belongs to the matching backend and retains its original columns.

OpenAI credits, provider usage logging, usage multipliers/calculations and Salvage
provider-cost tracking remain excluded. Operational Report Activity is retained.
The root export-boundaries tests protect these restrictions.

Environment secrets, signing credentials, generated binaries/build caches,
private operational records and source Git history are not exported. Deploy the
compatible backend before the applications. Repository synchronization does not
deploy, repair customer reports, mutate databases or authorize provider actions.

Verification uses staging checkouts without production environment files and
loopback fixtures. The current merged verification results are recorded below.

Current merged checks passed: five export-boundary tests, 90 admin policy tests,
1,240 web tests across 113 files, and 1,079 native tests across 99 suites.
Web/admin lint, typechecks and production builds passed; native typecheck and
Android/iOS Hermes exports passed. Build dependencies were staged outside source
control. Path/credential scans and whitespace checks passed. Real provider calls,
physical devices and production generation are not exercised by these checks.
