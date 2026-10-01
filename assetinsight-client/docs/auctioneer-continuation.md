# Create Lot & Continue

## Incoming contract contacts (2026-10-01)

The Incoming queue and selected-contract details show separate **Customer**,
**Consignor** and **Salesperson** values. The owner-scoped Incoming API supplies
optional `consignorName` and `salespersonName` strings; claim, saved setup and
Continue retain them under `contract`. Missing values display **Not supplied**.
Neither customer nor assigned appraiser is used to infer the other roles.

Deploy the additive backend adapter before the web update. It accepts explicit
Auctioneer contract/task contact metadata and retains the names in work-item
snapshots; existing snapshots are read without backfills or database changes.
No new endpoint, environment variable, dependency or extra browser request is
needed. Form fields, report layouts and delivery permissions are unchanged.
See the backend integration guide for upstream names and compatibility aliases;
live provider field availability is not established by the isolated fixtures.

### Contract description (Pristine refresh, 2026-10-01)

The queue and selected-contract panel also display the office's contract
`description` as plain text, with **Not supplied** for missing values. The
description wraps within the existing responsive table/cards and detail panel;
it is not copied into lot descriptions or used to change report content. This
uses the same additive backend Incoming/setup response and makes no extra
requests. No form, report layout, accounting or Continue behavior changes.
The client adapter preserves complete nonblank string descriptions from root or
saved contract metadata on Incoming, claim, setup and continuation responses.
Verification: 1,098 tests, typecheck, lint and the production build passed.
Isolated production-browser checks at 1366px/light and 320px/dark verified
short, long HTML-like plain text and missing descriptions, keyboard Review,
complete detail text, no page overflow and no console errors. Requests were
limited to fixture authentication and metadata reads; no claim or report was
submitted. Actual Auctioneer field availability still depends on its response.
Missing/malformed values remain unknown; customer and lot text are not fallbacks.

## Submission and continuation

For imported Asset and Lot Listing forms, Continue submits the current capture
through the normal upload workflow. Once the server accepts the upload, the page
requests a successor work item and opens a fresh form without waiting for report
analysis or old-draft cleanup. Close instead opens Previews; it does not finish
the Auctioneer contract.

The successor carries the current form's editable details and settings (including
edited location, dates and currency), but never its lots, media, cover choices,
draft identity or submission identity. A failed handoff retains these details for
Retry; that action retries only continuation, never the accepted upload.

Backend continuation must support both currently assigned Proposal contracts and
currently assigned Operations tasks on the exact contract. Missing/reassigned
authority and changed events remain errors. Deploy this backend support before
the web client. No Auctioneer API changes or historical report changes are needed.

Regression coverage includes both form workflows, successor identity/remount and
retry tests, and production-build browser flows on desktop and mobile viewports.
Browser provider calls are isolated fixtures, not real customer submissions.
# Pristine integration update (2026-09-30)

Reports now separates Outstanding from Completed (Auctioneer delivery state
`sent`). Incoming Open report links carry the contract search and select the
Completed tab when the matching report has been delivered.

Schedule A forms offer Add lot to this line. This creates an independently
editable/removable bundled lot with stable identity and original-line lineage;
it does not reuse the parent's displayed number. Original lines stay locked.
The backend validates and persists the mapping before processing.

Create Lot & Continue remains submit-and-open: after upload acceptance, open
a fresh same-contract form with the retained details, without waiting for file
generation. It is not a synonym for adding a local lot. Existing submission,
approval/release and continuation authority checks are unchanged.
