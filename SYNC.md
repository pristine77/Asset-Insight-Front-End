# Sanitized application synchronization

29 September 2026 content-only synchronization:

| Application | Source revision |
| --- | --- |
| Admin | `045b95d10920f54cb73be347de5c9def9085a3f1` |
| Web | `61c644a03f4fccd53dc5842ed5950af5597216f6` |
| Native | `433c4c41e3f83d3c4c131163f236ab156359186e` |

Includes the latest CRM workspace, draft/preview/media fixes, imported-contract
continuation, lot-number upload, native video capture/transport, and reviewed
YouTube controls/privacy pages. Existing report layouts are retained. Excel
generation belongs to the matching backend and keeps its original columns,
without a YouTube URL column.

OpenAI credits, provider usage logging, usage multipliers and Salvage provider-cost
tracking remain excluded. The existing export-boundaries tests protect these
restrictions. Operational Report Activity remains available.

Source Git history, environment secrets, signing credentials, APK/AAB binaries,
native build caches and private operational records are not exported. The native
directory contains application source, not a newly built mobile release.

Verification commands are in the root README. Deploy the compatible backend
before these applications; this synchronization does not deploy or modify
production reports, databases, videos or Google authorization.

This release copy passed the four export-boundary checks, admin lint/typecheck/
production build and 84 policy tests, web lint/typecheck/production build and
990 tests, and native typecheck plus 603 tests. Checks used isolated configuration
with production environment-file reads and external provider traffic blocked.
No new APK/AAB, physical-device test, live upload or deployment is claimed.
