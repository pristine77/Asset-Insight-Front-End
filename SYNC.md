# Sanitized application synchronization

1 October 2026 content-only synchronization, retaining the existing Pristine77
history through `1efb91f06b92c980e4d25f07db0c4c7929a31f25`:

| Application | Source revision |
| --- | --- |
| Admin | `a3bb1151739674e06b8b0fee4561962edca5ee53` |
| Web | `dee79834331ff9bae5a61da57fa392e142bb71d2` |
| Native | `2f6a839` plus the reviewed local authentication, camera handoff and upload-recovery changes |

Includes Incoming consignor/salesperson names, authentication recovery, draft
restoration safeguards, report queue and Schedule A updates, corrected
submit-and-open-new-form continuation, YouTube callback handling, and native
camera handoff/upload stall recovery. Existing report layouts are retained. Excel
generation belongs to the matching backend and keeps its original columns,
without a YouTube URL column.

The CRM Coverage page and authenticated admin artifact-download proxy are also
retained. Earlier broad `coverage/` and `artifacts/` ignore patterns omitted these
runtime routes; output exclusions are now scoped to application build folders,
with a regression check for both routes.

OpenAI credits, provider usage logging, usage multipliers and Salvage provider-cost
tracking remain excluded. The existing export-boundaries tests protect these
restrictions. Operational Report Activity remains available.

Source Git history, environment secrets, signing credentials, APK/AAB binaries,
native build caches and private operational records are not exported. The native
directory contains application source, not a newly built mobile release.

Verification commands are in the root README. Deploy the compatible backend
before these applications; this synchronization does not deploy or modify
production reports, databases, videos or Google authorization.

This sanitized release copy passed all five export-boundary checks; admin's 89
policy tests, lint, typecheck and production build; web's 1,081 tests across 106
files, lint, typecheck and production build; and native's 778 tests across 79
suites plus typecheck. Both restored runtime routes appear in the compiled web
and admin route manifests. Secret/configuration-path scans and whitespace checks
passed. Dependency lockfiles are unchanged. Provider calls and production
environment access were excluded from verification.
No new APK/AAB, physical-device test, live upload, customer draft recovery or
deployment is implied by this synchronization. In particular, this source sync
does not claim to resolve an unverified customer camera session or increase the
existing 200-photo per-lot limit.
