/**
 * Per-lot Re-Generate in the report previews (owner decision 2026-10-11).
 *
 * The preview's footer "Save" stores exactly what the employee left on screen
 * and rebuilds the files; the AI never runs again on saved work. "Re-Generate"
 * on one lot asks the AI to re-read that lot's photos (for example after more
 * photos were added) and replaces the lot's title, description, condition
 * report, details and value. Lot number, photos, auction settings and the
 * Condition / Completeness / Legal choices stay.
 *
 * The server keeps one `lot_regeneration` record per report while a lot is
 * being read (queued -> processing) and after a failure. While it is pending
 * the server refuses saves, uploads and file generation, and the preview
 * locks its editor and polls until the record clears.
 */

export type LotRegenerationStatus = "queued" | "processing" | "failed";
export type LotRegenerationStage = "reading_photos" | "completing_fields" | "looking_up_specs";

export type LotRegeneration = {
  lot_id: string;
  lot_key: string;
  lot_number?: string;
  status: LotRegenerationStatus;
  stage?: LotRegenerationStage;
  requested_at: string;
  started_at?: string;
  failed_at?: string;
  error?: string;
};

/** How often an open preview checks on a pending Re-Generate. */
export const LOT_REGENERATION_POLL_MS = 4000;

export function isLotRegenerationPending(state: LotRegeneration | null | undefined): boolean {
  return state?.status === "queued" || state?.status === "processing";
}

export function readLotRegeneration(value: unknown): LotRegeneration | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<LotRegeneration>;
  if (!state.lot_id || !["queued", "processing", "failed"].includes(String(state.status))) return null;
  return state as LotRegeneration;
}

export function lotRegenerationLotLabel(
  state: Pick<LotRegeneration, "lot_number"> | null | undefined,
  fallback = "this lot"
): string {
  return state?.lot_number ? `Lot ${state.lot_number}` : fallback;
}

export function lotRegenerationStageText(stage: LotRegenerationStage | undefined): string {
  if (stage === "completing_fields") return "Completing the fields…";
  if (stage === "looking_up_specs") return "Looking up specs…";
  return "The AI is reading its photos…";
}

export function lotRegenerationConfirmMessage(lotLabel: string): string {
  return (
    `Re-Generate ${lotLabel}?\n\n` +
    "The AI will re-read this lot's photos, including any you added, and replace its title, " +
    "description, condition report, details and value. Your edits on this lot will be replaced. " +
    "The lot number and photos stay, and your other edits are saved first."
  );
}

/** The footer Save explains that it never runs the AI. */
export const SAVE_PREVIEW_TITLE =
  "Saves your edits exactly as shown and rebuilds the Excel, PDF and Word files. Nothing is re-read by the AI.";

/** Does this lot (by its key or id) match the pending or failed Re-Generate? */
export function isLotRegenerationFor(
  state: LotRegeneration | null | undefined,
  lot: any,
  lotKey: string
): boolean {
  if (!state) return false;
  const lotId = String(lot?.lot_id || "");
  return Boolean((lotId && lotId === state.lot_id) || lotKey === state.lot_key);
}
