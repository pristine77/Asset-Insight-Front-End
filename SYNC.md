# Sanitized application synchronization

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
