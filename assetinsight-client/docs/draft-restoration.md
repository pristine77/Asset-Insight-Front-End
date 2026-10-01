# Asset and Lot Listing account draft restoration

## Restore and photo-mapping safeguards (2026-09-29)

- Both account-draft forms keep editing, saving, deletion, submission and activity
  observations locked after a failed restore. Asset no longer marks a failed
  download hydrated. Account restores are cancellable and StrictMode-safe.
- Explicit Retry reads the latest owner-scoped draft before downloading its
  originals; it does not reuse a stale media list or submit the report.
- Shared restoration rejects duplicate identities, orphaned photos, unknown
  slots, empty downloads and size mismatches. Errors identify the saved lot,
  media position and filename. API binary errors use safe, specific guidance.
- Backend media reads can recover a lost confirmation when the owner's saved
  object is readable and its byte size matches. They never mark it confirmed,
  rewrite a draft, replace originals or invent missing files.
- Upload and draft-preview admission reject invalid mappings before creating a
  processing report. Draft-preview creation never silently omits pending media.
  Saved lot order and main/report-only boundaries remain authoritative.

These changes need backend support first, then web. Existing failed reports are
not requeued or repaired automatically. No production repair, deletion or deploy
is included. An actually missing original still requires the original device or
reviewed support recovery; a saved draft row alone cannot prove all files arrived.

Saved drafts contain structured form/lot metadata plus authenticated media
descriptors. Previously, Lot Listing awaited every original download before
setting any form field. A large draft appeared blank for the entire download;
failed transfers left default values visible. A mount before authentication also
consumed the one-shot restore attempt without restoring anything.

The form now waits for the matching owner, hydrates saved metadata immediately,
and downloads media with the existing four-worker bound. A loading panel reports
completed/total media. Saved lot IDs, order, covers, modes, form values and the
submission identity remain unchanged. The page keys resumed forms by draft
identity so distinct drafts cannot share a form instance.

Until restoration succeeds, metadata-only File arrays are placeholders. Field
controls, save, clear/delete and submission are locked, including handler-level
guards. Activity observations remain paused rather than recording photo removal.
An error retains the displayed metadata, leaves the saved record untouched and
offers explicit Retry. Cancellation on account change/unmount and aborted-result
checks prevent late downloads from populating the wrong form. StrictMode replay
starts a fresh cancellable restore rather than consuming a one-shot guard.

`ReportDraftService.restoreLots(record, { signal?, onProgress? })` is backwards
compatible with other callers. A failed original rejects the whole restoration;
it does not silently drop photos. Main, extra and video slots remain separate.

## Upload and failed-save retention (2026-10-01)

Asset/Lot final create/complete responses now require a real report ID and an
explicit acceptance or documented final job/status receipt before clearing form
state. Upload placeholders, malformed receipts and prior accepted report receipts
leave current details/media and saved drafts intact. Existing-report status opens
in another tab rather than invoking the current form's successful-submit handler.
Network/409 messages explain the next step without displaying raw Axios errors,
provider HTML, tokens, signed URLs or stacks. Retry retains the same upload ID;
neither a timeout nor a report ID alone authorizes another submission.

The additive backend `UPLOAD_SESSION_REPORT_UNAVAILABLE` response offers **Save
separate draft** only with `accepted:true`, `reportAvailable:false` and
`canCreateSeparate:true` on an ordinary report. Incoming identities are excluded.
This explicit operation persists a stable fresh ID before saving the current
complete form/media using existing File references. No original draft is deleted,
no report is submitted automatically, and no supersession alias is sent. On
success, the user opens Drafts in another tab to review and submit the new draft.
Uncertain saves reuse that fresh identity; failed saves leave the original form
open. Cloud media may need uploading into the independent new draft; no duplicate
browser-original bytes are made. Local recovery metadata contains IDs/revision
only, not notes or images.

All multi-step draft-save API calls retain one captured account session. The
separate recovery controller aborts on owner/source/unmount and suppresses stale
progress/receipts; a changed session cannot save old form details for a new owner.
Manifest replacement requires authoritative unaccepted/supersedable evidence,
not a placeholder report ID. Supporting backend must be released before web.

Regression coverage includes missing/placeholder/historical acceptance, failed
save/submit retention, safe error shapes, separate-draft receipt/retry identity,
owner changes and cancellation. Final isolated web gate: 108 files / 1,154 tests,
lint, typecheck and production build passed. Isolated fixtures do not certify real 992-photo
network endurance or a particular customer's storage completeness. No production
report/draft repair or submission is part of these source changes.

## Previous verification (2026-09-29)

- Final web gates: 104 files / 1,002 tests, typecheck, lint and production build.
- Six isolated production Chromium flows: Asset and Lot Listing at 320px, 390px
  dark and 1366px light. Each reproduces an original-download failure, checks
  disabled save/submit, explicitly retries a newer saved revision, and verifies
  restored fields and 16 lots / 239 photos. No unexpected requests, writes or
  runtime errors; page identity, nonblank content, no framework overlay, keyboard-
  accessible buttons and no horizontal overflow checked.
- Backend-focused coverage includes lost confirmations, exact streamed bytes,
  retained metadata, wrong-owner denial, missing/size-mismatched originals,
  duplicate/orphan mappings, pre-acceptance rejection and 5,000-photo sessions.
- These are isolated fixture checks, not verification of the specific production
  records or of large real-photo browser memory/network endurance. No live data,
  existing report jobs or storage objects were changed.

## Earlier verification and limits (2026-09-25)

- Full web suite: 101 files / 939 tests; typecheck, lint and production build pass.
- Focused tests cover 85 lots / 693 photos, ordering, empty lots, cover/extra/video
  preservation, four-worker concurrency, progress, authentication timing,
  cancellation, StrictMode, failure/retry and no partial saves/submissions.
- Isolated production Chromium checks at 1366px light and 390px dark verify
  immediate fields during delayed media loading and successful explicit retry.
  Every API/media response is mocked; no customer data or production writes.
- No Browser plugin is available; rendered QA uses regular Playwright.
- Original files are still downloaded before editing. The 693-photo production
  draft contains approximately 4.7 GB; tiny isolated fixtures do not certify that
  transfer's duration, browser memory capacity or live network reliability.
- Web-only rollout; no API/schema change, new package, automatic regeneration,
  production record modification or deployment is part of these source changes.
