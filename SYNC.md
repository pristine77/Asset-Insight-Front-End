# Sanitized application synchronization

1 October 2026 follow-up content-only synchronization, retaining the existing
Pristine77 history through `7092671`. Source Git history is not imported.

| Application | Source revision |
| --- | --- |
| Admin | `a3bb1151739674e06b8b0fee4561962edca5ee53` |
| Web | `7f51fc78a343ed9d2c40c2e212c58178aaa351ba` |
| Native | `2f6a839` plus reviewed local authentication, camera handoff, upload-recovery and acceptance-receipt changes |

The latest follow-up preserves Pristine77's Incoming description and preview bulk
selection updates. It adds actionable transfer errors, revision-aware draft saves,
authoritative upload acceptance checks and explicit separate-report recovery.
Replayed acceptance does not erase newer local edits. Admin is already current
and its application files are unchanged by this follow-up.

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

This follow-up release copy passed all five export-boundary checks, unchanged
admin's 89 policy tests, web's 1,154 tests across 108 files plus lint, typecheck and
production build, and native's 867 tests across 82 suites plus typecheck.
Secret/configuration-path scans and whitespace checks passed. Dependency lockfiles
are unchanged. Verification used fresh staging checkouts without production
environment files or provider credentials.
No new APK/AAB, physical-device test, live upload, customer draft recovery or
deployment is implied by this synchronization. In particular, this source sync
does not claim to resolve an unverified customer camera session or increase the
existing 200-photo per-lot limit.
