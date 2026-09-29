# Lot Listing account draft restoration

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

## Verification and limits

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
