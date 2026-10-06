# Sanitized application synchronization

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
