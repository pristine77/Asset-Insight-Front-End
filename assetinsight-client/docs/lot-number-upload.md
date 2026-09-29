# Lot Number Upload

Asset and Lot Listing web forms offer two separate ordered-upload methods:

- **Smart Upload** keeps the existing black-divider behaviour: separator images
  are excluded from the report.
- **Lot Number Upload** uses a numbered sign as the first image of each lot.
  Every uploaded image, including every sign, remains in the reviewed groups.

Both methods retain the 5,000-image / 20 GiB total / 50 MiB per-image limits and
the existing 200-photo lot limit. Upload transport, stable submission/session
identity, explicit preview acceptance and later report workflows are unchanged.

## Review

The numbered method displays the detected lot numbers, not sequential UI labels.
Appraisers can save a corrected number, split before a photo or join the previous
lot. Splitting and joining preserve the original photo sequence. There is no
numbered-mode divider/exclusion control. A new split without readable evidence
requires a manually supplied lot number. Backend validation rejects invalid or
duplicate numbers. Missing or unreadable originals are not silently removed.
Duplicate-number warnings also block the client confirmation action.

Before **Create preview**, the appraiser explicitly confirms every lot number
and boundary, including uncertain recognitions. The acknowledgement is tied to
the current grouping revision and becomes unchecked after a saved change.
Ordinary lot edits never acknowledge unresolved evidence. An unsaved number
prevents submission and switching lots; failed saves retain the entered value.

All reviews remain paginated: six lot cards and twelve selected-lot images.
The numbered method does not mount the black-divider thumbnail sequence. This
bounds rendered thumbnails independently of the 5,000-file manifest size.

## Additive backend contract and resume

`POST /asset/upload-session` and `/lot-listing/upload-session` accept top-level
`groupingMethod: "lot_number" | "black_divider"`. Omission preserves legacy
black-divider behaviour. Numbered creation requires the response to confirm
`groupingMethod: "lot_number"` before photo transport; an older server cannot
silently process the request as black-divider mode.

Grouping reads return `groupingMethod`, `groups[].lotNumber`, `lotStartFileIds`
and `unresolvedLotNumberFileIds`. Review PATCHes retain the existing revision
fence and send groups as `{fileIds, lotNumber}` with no excluded dividers. Only
explicit final confirmation sends `acknowledgeLotNumberReview: true`.

Browser recovery stores the method as metadata in
`details.smart_upload_grouping_method`. Existing draft storage needs no schema
upgrade or additional image copy. A restored local method wins over a newly
clicked entry button; server-only recovery obtains the authoritative method from
the saved session. Completion retries reuse the exact original upload session.

Once every photo is confirmed and the server acknowledges a classification job,
numbered uploads may **Close and keep processing**. Only browser polling stops;
the durable worker continues. Reopen the saved upload from Drafts to review it.
Closing never submits a preview. Before that receipt, transport must remain open.
Unknown server method values fail closed; omitted values retain legacy behaviour.

Deploy backend support before the web client. Native currently has no Smart
Upload interface; this change does not introduce a native upload workflow or
require a mobile release. Existing reports are not regrouped automatically.

## Verification

Focused tests cover both form entry methods, normalized protocol fields,
unsupported-server blocking, black-divider compatibility, 5,000-photo bounded
reviews, manual numbers, explicit acknowledgement, uncertain/unreadable images,
split/join/undo photo conservation, local/server-only resume and failed saves.
Isolated Chromium checks cover desktop/narrow screens, light/dark presentation,
number corrections, join/undo and explicit ordered-photo acceptance. A separate
authorized backend smoke test read the supplied numbered card as 2500; real
5,000-original transfers, broad recognition accuracy and customer report repair
are not claimed by those tests.

Final local gates (2026-09-27): 965 web tests, typecheck, lint and production
build passed. Five isolated production Chromium flows passed at 320/390/1366px
in light/dark themes, with no application console errors, missing rendered
thumbnails, horizontal overflow or unexpected network requests. Browser plugin
not available; the installed Playwright runtime was used for these checks.
