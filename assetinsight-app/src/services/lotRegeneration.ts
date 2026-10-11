/**
 * Per-lot Re-Generate (owner decision 2026-10-11).
 *
 * The report preview has two separate actions:
 * - Save keeps exactly what is on screen and rebuilds the Excel, PDF and Word
 *   files. The AI never runs again on saved work.
 * - Re-Generate, on one lot, asks the AI to re-read that lot's photos (for
 *   example after more photos were added) and replaces the lot's AI-written
 *   fields. The server saves the rest of the preview first, queues the
 *   reading, and keeps one `lot_regeneration` record on the report while it
 *   runs (queued -> processing) or after it failed (failed). The record is
 *   null when nothing is pending or failed.
 *
 * While a reading is pending the server refuses saves, uploads and file
 * generation for the report (409 LOT_REGENERATION_PENDING), so the screen
 * locks the same actions and polls the preview until the record clears.
 */

export type LotRegenerationStatus = "queued" | "processing" | "failed";
export type LotRegenerationStage = "reading_photos" | "completing_fields" | "looking_up_specs";

export type LotRegenerationState = {
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

/** How often the preview is re-read while a lot is being re-generated. */
export const LOT_REGENERATION_POLL_MS = 4000;

/** Code the server answers (HTTP 409) while a lot reading is pending. */
export const LOT_REGENERATION_PENDING_CODE = "LOT_REGENERATION_PENDING";

const STATUSES: readonly LotRegenerationStatus[] = ["queued", "processing", "failed"];
const STAGES: readonly LotRegenerationStage[] = ["reading_photos", "completing_fields", "looking_up_specs"];

const optionalText = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
};

/**
 * Reads the `lot_regeneration` record from a server response. Anything that
 * is not a recognisable record (missing, null, unknown status) reads as null,
 * so an older server that never sends it leaves the screen unlocked.
 */
export function readLotRegeneration(value: unknown): LotRegenerationState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const status = record.status as LotRegenerationStatus;
  if (!STATUSES.includes(status)) return null;
  const lotId = String(record.lot_id ?? "").trim();
  const lotKey = String(record.lot_key ?? "").trim() || lotId;
  if (!lotId && !lotKey) return null;
  const stage = STAGES.includes(record.stage as LotRegenerationStage)
    ? (record.stage as LotRegenerationStage)
    : undefined;
  const lotNumber = String(record.lot_number ?? "").trim();
  return {
    lot_id: lotId,
    lot_key: lotKey,
    ...(lotNumber ? { lot_number: lotNumber } : {}),
    status,
    ...(stage ? { stage } : {}),
    requested_at: String(record.requested_at ?? ""),
    ...(optionalText(record.started_at) ? { started_at: optionalText(record.started_at) } : {}),
    ...(optionalText(record.failed_at) ? { failed_at: optionalText(record.failed_at) } : {}),
    ...(optionalText(record.error) ? { error: optionalText(record.error) } : {}),
  };
}

/** True while the AI is still reading the lot (queued or processing). */
export function isLotRegenerationPending(
  state: LotRegenerationState | null | undefined
): state is LotRegenerationState {
  return state?.status === "queued" || state?.status === "processing";
}

/** The step the server reports for a running reading, for the progress banner. */
export function lotRegenerationStageText(stage: LotRegenerationStage | undefined | null): string {
  switch (stage) {
    case "reading_photos":
      return "Reading photos…";
    case "completing_fields":
      return "Completing fields…";
    case "looking_up_specs":
      return "Looking up specs…";
    default:
      return "";
  }
}

/** True for the server's "a lot is being re-generated" refusal. */
export function isLotRegenerationPendingError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)
    ?.response;
  return response?.status === 409 && response?.data?.code === LOT_REGENERATION_PENDING_CODE;
}

/** Whether a preview lot is the one named by the regeneration record. */
export function isLotRegenerationTarget(
  state: LotRegenerationState | null | undefined,
  lot: { lot_id?: unknown } | null | undefined,
  lotKey: string
): boolean {
  if (!state) return false;
  const lotId = String(lot?.lot_id ?? "").trim();
  if (state.lot_id && lotId) return state.lot_id === lotId;
  return Boolean(state.lot_key) && state.lot_key === lotKey;
}
