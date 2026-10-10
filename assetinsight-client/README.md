This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

### Proposal Valuation monetary column totals (2026-10-09, local)

The Lots footer and mobile totals card now include Total Expected Gross,
Allocated Value, Cleaning, Lien Search, Video Cost, Lotting Fee and Advertising.
The previous footer left those cells empty even though the rows
and Excel export calculated them. Totals cover the entire sheet, including rows
hidden by search or pagination, and update from the current edits. Existing row
buyer-premium caps remain unchanged. Following the average-basis correction
below, gross now uses the entered evaluator average plus its premium. Blanks
contribute zero, percentages and the formatted Asset Insight reference are not summed, and cents are preserved
until display. No backend schema change or customer-data repair is required.

Local verification: 1,265 web tests across 114 files, typecheck, lint and
production build pass. Isolated Chromium desktop/light and 320px/dark checks
cover whole-sheet totals across pages/search (including no matches), zero/blank/
decimal edits, footer/body alignment and synthetic save/reopen. The matching
admin flow and existing backend formula/XLSX tests also pass. No production
access, customer changes, push or deployment; the QA build targets loopback and
must not be deployed without a production rebuild.

### Proposal Valuation average-based Buyer Premium (2026-10-09, local)

Buyer Premium is 15% of the unrounded average of entered active evaluator values,
capped at 2,000 per lot. Total Expected Gross and Allocated Value equal that
average plus premium. Empty evaluator values are excluded, explicit zero counts,
and an all-blank row keeps its premium/gross blank. Removed evaluator entries
cannot affect the average. The live row and saved recalculation share one helper
so desktop/mobile rows and all-lot totals use the same formula.

Low/high estimates, existing 1%-of-high cost formulas, the separately labelled
Potential Get high-estimate scenario and row display rounding are unchanged.
Backend calculation/export support must deploy first, followed by web/admin.
Existing downloaded files are not rewritten; export again or explicitly update
report files after deployment. No automatic customer-data rewrite is performed.

Verification: 1,273 tests across 114 files, typecheck, lint and production build
pass. Four isolated production Chromium flows cover web/admin at 1366px/light
and 320px/dark, using the built backend normalizer with synthetic accounts and
data. They verify average-based examples, blank/zero/cap boundaries, all-lot
totals through pagination/search, decimal edits and save/reopen. No live account
or physical-device test; no push/deployment. QA builds target loopback only.

### Proposal Valuation report owner (2026-10-09, local)

The server-provided report owner now has a fixed **Report owner** participant
chip and valuation column. The web client matches the owner's participant ID to
the supplied column's `user_id`; it never invents a column ID or relabels a
legacy evaluator as the owner. The owner cannot be removed or selected again,
does not consume any of the four additional evaluator slots, and is omitted
from add/remove assignment payloads. Existing legacy columns and saved values
remain intact. Owner/evaluator editing and file-generation permissions still
come from the existing server permission fields.

Deploy the supporting backend owner-column behavior before this client update.
Focused rendered tests cover the fourth additional assignment, owner exclusion
from removal payloads/options, preserved owner values/legacy columns, and an
invited evaluator's unchanged column restrictions. No customer data migration,
automatic report generation, production access, push or deployment is performed.

Local verification: all 1,264 tests across 114 files, typecheck, lint and the
production build pass. Isolated production Chromium checks at 1366px/light and
320px/dark cover the owner chip, fourth additional evaluator, removal payloads
and reopening with unchanged owner/legacy amounts. No runtime console errors,
framework overlays or viewport overflow were observed in those flows. Browser
plugin was unavailable; the installed Playwright was used with synthetic API
fixtures and non-loopback requests blocked. Native apps and live accounts were
not exercised. Team Reports is not part of this owner-column implementation:
its management relationship still requires clarification.

### Appraiser CRM

Explicitly enabled CRM agents enter through `/workspaces` to choose **Listings**
or **CRM**, each with separate navigation. Other users go straight to Listings.
`/crm` provides assigned-lead metrics and follow-ups; Tasks, Transfers, Outlook
Calendar and Coverage have separate pages. Direct report/notification links remain
supported. Deploy the additive backend dashboard/summary/detail/history reads
first. See [CRM workflow, performance and verification notes](docs/crm.md).

### Asset/Lot activity metadata

Both forms queue owner-scoped operational observations in IndexedDB: imports,
lot/photo removal and ordering, cover changes, logo choices and explicit draft
saves. Draft restoration establishes a baseline, not a new import or deletion.
No photo bytes or unfinished field values are added to this queue, and ordinary
text changes do not generate keystroke events. Server-side preview/report
transitions provide the confirmed saved-change history.

While signed in, foregrounded and in the Listings workspace, reconnect/periodic sync sends at most 100 events
and 256 KiB to `/api/report-activity/events`, with stable event IDs and an explicit
owner fence. Only acknowledged IDs are removed. This never uploads media or starts
report submission. Account changes abort sync and preserve the old owner's queue.
The optional `activity_id` links normal/Smart Upload submissions to local history;
existing submission/session retry identities and report limits are unchanged.
Backend support must be deployed first. No new package is required.

### Incoming contracts: generate and start a new lot

Asset and Lot Listing forms opened from Incoming include **Generate files & new
lot** alongside their ordinary create action. It submits the current media through
the existing analysis pipeline; it does not skip preview, approval or release.
After the upload is accepted, the client sends the accepted report ID to
`POST /auctioneer/work-items/:id/continue` and opens a fresh form of the same type.
Imported contract, customer, event and location details come from the server;
photos, videos, annotations, source-lot mappings and submission/draft identity
are not reused. The original Schedule A form remains locked to its assigned lots;
the continuation is a new unknown lot, not another copy of the Schedule A.

If opening the next form fails, the accepted report remains accepted. **Retry open
new form** repeats only the idempotent continuation request. If another tab has
already used that successor, the UI offers Reports rather than an empty form
under an old submission ID. Ordinary create actions still open Previews. Saving
a new imported draft preserves its work-item reference, and reopening validates
the current setup and exact saved submission identity before enabling editing.
An upload placeholder marked `report_created` can resume only when the backend
explicitly advertises `canResumeUpload: true`; accepted reports cannot. Legacy ordinary drafts keep
their existing behavior.

Backend continuation/setup support must be deployed first. Focused coverage is
in `services/auctioneer.test.ts`, `components/forms/auctioneerContinuation.test.ts`,
`components/forms/ReportFormPage.test.tsx` and both Asset/Lot Listing workflow
suites. Tests use synthetic fixtures, with no live Auctioneer delivery or report
generation required.

### Auctioneer: closing your part of a contract (2026-10-02)

Several people can be assigned to one Auctioneer contract. Each closes **their
own part**; Auctioneer completes the contract once every assigned person has
closed theirs. Delivery summaries name the scope (`contractCompletionScope`:
`"user"` for assigned work, `"contract"` for older unassigned work).

- **Send to Auctioneer** offers assigned users "I've finished this contract —
  close my part", unticked by default. Ticked, the server closes the user's part
  after every lot of that delivery has landed. A retry keeps the original choice
  (locked, like the destination). Unassigned work keeps the older "Mark the
  contract task complete" wording.
- **My Reports → Completed** offers "Close my part of this contract" on a
  delivered, assigned report whose part is still open, for a person with
  nothing left to send. It asks for confirmation, calls
  `POST /auctioneer/contracts/:contractId/close-my-part` (the server takes the
  user from the session), and every report row on that contract then reads
  "Sent · your part closed", or "Sent · contract complete" once Auctioneer
  reports every assigned person has closed theirs. A refusal (another delivery
  for the contract still unfinished, no work of yours on the contract) is shown
  as the server's message and the action stays available.
- A part is the person's, not one report's: once it is closed — by a
  delivery's box or by the action — none of that person's reports on the
  contract offers the action again.

The action sits on My Reports because Incoming drops a contract's rows once they
are sent. Deploy the backend first. Coverage: `services/auctioneer.test.ts`,
`components/reports/AuctioneerDeliveryDialog.test.tsx` and
`app/(main)/reports/page.test.tsx`.

Local integration hardening (2026-10-03): closing requires a complete matching
server receipt, never an empty200 or an invented timestamp. The action is
single-flight, does not automatically replay after401, and is fenced to the
session that loaded its delivery plus the current owner. Pre-close refreshes
cannot replace the confirmed result. Revoked assignments display "assignment
removed", not a successful close; mobile cards retain the same delivery status
as the desktop table. Only synthetic local contracts are used in verification.

### Failed Asset and Lot Listing preview recovery

The preview queue and report deep links keep Preview available after generation
failure when the API advertises `preview_available` (with legacy data fallback).
Opening does not retry work. The editor retains a failure warning and saves edits
on the same report; its final action uses resubmit for error states. All stored
lots/media remain available for review. Reports without saved preview data link
to Drafts instead of offering an empty preview or an unusable file-generation
retry. Generation/download readiness is not inferred from preview availability.

### Asset preview required selections

Asset previews support Running Condition, Completeness and Legal choices for
selected lots, the current 20-lot page, or every lot. Selection persists across
pagination; each Apply changes only its named group, not other choices, lot
numbers, descriptions or media. Each lot retains compact individual overrides,
including N/A. Running/Working Condition specs update alongside the selected
condition and are suppressed for N/A. The existing saved
`condition_report_selections` contract is unchanged.

Selection clears after save/reload, photo round trips, or adding/deleting lots,
so index-based targets cannot accidentally refer to changed rows. Applying a
choice reports inline status without stacking mobile notifications. Save and
submit remain explicit; bulk editing never queues files. Lot Listing controls
are unchanged. Focused tests: `components/reports/PreviewModal.test.tsx` and
`lib/assetConditionSelections.test.ts`; browser coverage is in
`e2e/clearvalue.smoke.spec.ts`.

### Salvage review workflow

Saved previews optionally include backend-built `report_enrichment` v1: localized executive summary, assignment/condition, repair provenance, comparable verification, calculations, evidence/photo review, checklist, revision history and references. Web displays its supplied paragraphs and tables without recomputing values or promoting research notes into facts. The optional preview-only `report_context` editor collects explicitly appraiser-supplied narrative context. Saves use the existing `baseRevision`; omitted context keys retain prior notes and blank/null clears a note. The serializer allowlists context fields and never sends enrichment, evidence or original media as edits. Context saves do not trigger a new research run. Focused coverage: `components/reports/SalvageReportEnrichment.test.tsx` and `e2e/salvage-enrichment.spec.ts`.

Accepted Salvage uploads close the capture drawer and open `/salvage/status/[id]`, a durable processing workspace showing saved workflow steps. Completion stays on that page: the owner must click **Open preview** to visit `/salvage/preview/[id]`. Accepted Submit/Resubmit and explicit Research again close the editor and return to progress. Reports and Previews link active/stopped work to the same tracker; reloading or reconnecting reads the persisted report and never starts another request automatically.

**Stop processing** uses `POST /salvage/:id/cancel` with the displayed `baseRevision` and `jobId`, not merely the report ID. The backend's `can_cancel`, `preview_available` and `workflow_steps` are authoritative. Cancelled runs preserve saved media/edits and cannot publish new files; already-dispatched processing may still incur charges. A completed preview can be reopened, edited and submitted. If the initial preview never completed, Resume processing reuses saved originals/checkpoints with the current revision rather than inventing a preview or requiring another upload. Cancellation/generation conflicts require refreshing the current run. No local abort is presented as a successful server cancellation.

Legacy reports retain their existing condition, damage, facility and cash/reserve editors. V2 Canadian assessments instead use typed `assessment_inputs`: subject/market/date, parts/labour/charges, seller deductions, supplied evidence and reasoned appraiser overrides. Conclusions are saved server calculations, not live browser estimates. Unknown amounts remain unavailable, and material subject edits mark the research stale. The legacy financial editor is hidden for v2 so two competing values cannot be submitted.

New Salvage intake supports 50 ordered photos and CAD by default. The capture form collects claim, province/market and loss context, not vehicle identity or engine specifications. Upload clear VIN/serial, engine, badge and dashboard photos; the backend provides optional versioned `assessment.vehicleDetails`, using the Excel catalogue for field definitions only. Preview shows readable photo values, explicit “Cannot find from image” states and conflicts, with source-photo inspection. Appraiser changes are sent only through `assessment_inputs.vehicleOverrides`; null explicitly clears a value. The backend preserves evidence and synchronizes identity fields. Changing vehicle category updates the workbook field list on save. Legacy assessments without photo-derived details retain their clearly labelled unverified identity editor.

**Research again** is a separately confirmed action with the saved revision and a session-persisted request ID. Unknown network outcomes reuse that ID. Saves, file submissions and refreshes never request a new research run. Backend support must precede this client; new chart/report-body visual rollout and real-vehicle acceptance remain pending. The backend's authorized synthetic OCR/live-search smoke test passed on 2026-09-08; this does not establish valuation accuracy or complete export parity.

Downloads use authenticated PdfReport IDs returned by the backend and remain disabled until the required generation, approval and release are complete. Concurrent edits produce a revision conflict rather than overwriting another device's changes. Unsaved changes remain on screen until explicitly discarded or saved.

Focused verification: `npm test -- services/salvage.test.ts components/forms/SalvageForm.workflow.test.tsx components/reports/SalvagePreviewWorkspace.test.tsx components/reports/SalvageProgressWorkspace.test.tsx components/reports/SalvageVehicleDetails.test.tsx components/reports/SalvageAssessmentEditor.test.tsx` and `npm run test:e2e -- e2e/salvage-preview.spec.ts e2e/salvage-assessment.spec.ts e2e/salvage-progress.spec.ts`. The browser tests use isolated API/storage fixtures and do not call production providers.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
