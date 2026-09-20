export const ACTIVITY_LABELS: Record<string, string> = {
  history_started: "History recording started", photo_captured: "Photo taken", photos_imported: "Photos imported", lot_added: "Lot added", next_lot: "Next lot", photos_removed: "Photos removed", lot_removed: "Lot removed", photos_reordered: "Photo order changed", lots_reordered: "Lot order changed", cover_changed: "Cover changed", logo_changed: "Upload logo changed", draft_opened: "Draft opened for review", draft_saved: "Draft saved", preview_saved: "Preview saved", upload_started: "Upload started", upload_progress: "Upload progress", upload_accepted: "Upload accepted", submission_requested: "Submit requested", preview_submitted: "Preview submitted", retry_requested: "Retry requested", cancelled: "Stopped", preview_ready: "Preview ready", generation_started: "Processing accepted", generation_completed: "Files generated", generation_failed: "Processing failed", reassigned: "Reassigned", approved: "Approved", declined: "Declined", released: "Released", auction_delivery: "Auction delivery", report_deleted: "Report deleted", draft_deleted: "Draft deleted", preview_deleted: "Preview deleted", fields_changed: "Details changed", capture_mode_changed: "Capture mode changed",
};
export type ActivityPerson = { id: string; name: string; email: string };
export type ActivityCounts = { lots: number; photos: number; mainPhotos: number; extraPhotos: number };
export type ActivityRow = { id: string; activityId: string; owner: ActivityPerson; reportType: "asset" | "lotListing"; contract: string; source: string; latestAction?: string; latestOutcome?: string; latestCounts: ActivityCounts | null; lastReceivedAt: string; lastConfirmedAt?: string; revision: number; deleted: boolean; reportId: string | null };
export type ActivityDetail = ActivityRow & { canViewValues: boolean; canOpenPreview: boolean; canRemove: boolean; reportExists: boolean; previewPath?: string | null };
export type ActivityField = string | { field: string; before?: unknown; after?: unknown };
export type ActivityLot = { id: string; lotNumber?: string; beforePosition?: number | null; afterPosition?: number | null; beforeCover?: number | null; afterCover?: number | null; before: { mainPhotos: number; extraPhotos: number; cover?: number | null } | null; after: { mainPhotos: number; extraPhotos: number; cover?: number | null } | null; photos?: { id: string; before: number | null; after: number | null; slot?: string }[] };
export type ActivityEvent = { id: string; action: string; outcome: string; source: string; authority: "device" | "server"; actor: ActivityPerson | null; actorRole: string; observedAt: string | null; receivedAt: string; sequence: number | null; appVersion: string | null; data: { baseline?: boolean; error?: string | null; verifiedLogoReceipts?: number | null; deliveryStatus?: string | null; beforeCounts: ActivityCounts | null; afterCounts: ActivityCounts | null; fields?: ActivityField[]; lots?: ActivityLot[]; uploadLogo?: boolean | null; previousUploadLogo?: boolean | null; cameraStamp?: string; captureMode?: string; destination?: string | null; status?: string; part?: number; parts?: number } };
export type ActivityPage<T> = { items: T[]; total: number; page: number; limit: number };
export type ActivityLotCount = { id: string; lotNumber: string; position: number; mainPhotos: number; extraPhotos: number; photos: number; missingPhotos: number | null };
export type ActivityLotPage = ActivityPage<ActivityLotCount> & { source: "report" | "draft" | "capture" | "unavailable"; asOf: string | null };
export function parseActivityLotPage(value: unknown): ActivityLotPage {
  const data = (value as { data?: ActivityLotPage })?.data;
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  if (!data || !Array.isArray(data.items) || !count(data.total) || !count(data.page) || data.page < 1 ||
      !count(data.limit) || data.limit < 1 || data.limit > 100 || data.items.length > data.limit || data.items.length > data.total ||
      !["report", "draft", "capture", "unavailable"].includes(data.source) ||
      (data.asOf !== null && (typeof data.asOf !== "string" || !Number.isFinite(Date.parse(data.asOf)))) ||
      (data.source === "unavailable" && (data.total !== 0 || data.items.length !== 0)) ||
      data.items.some(lot => !lot || !activityIdValid(lot.id) || typeof lot.lotNumber !== "string" ||
        ![lot.position, lot.mainPhotos, lot.extraPhotos, lot.photos].every(count) || lot.photos !== lot.mainPhotos + lot.extraPhotos ||
        (lot.missingPhotos !== null && (!count(lot.missingPhotos) || lot.missingPhotos > lot.photos)))) {
    throw new Error("Per-lot counts could not be verified. Refresh to try again.");
  }
  return data;
}
export const activityIdValid = (id: string) => /^[a-f\d]{64}$/.test(id);
export function activityQuery(params: URLSearchParams, mode: "list" | "events" | "users" = "list") {
  const result = new URLSearchParams();
  const allowed = mode === "users" ? ["search", "limit"] : mode === "events" ? ["page", "limit"] : ["userId", "search", "reportType", "source", "action", "outcome", "from", "to", "page", "limit"];
  for (const key of allowed) {
    if (params.getAll(key).length > 1) throw new Error("Repeated filters are not supported.");
    const value = params.get(key)?.trim(); if (!value) continue;
    if (value.length > 100) throw new Error("Search must be 100 characters or fewer.");
    if (key === "userId" && !/^[a-f\d]{24}$/i.test(value)) throw new Error("Select a valid user.");
    if ((key === "page" || key === "limit") && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (key === "limit" ? 100 : 100000))) throw new Error("Invalid page.");
    const choices: Record<string, string[]> = { reportType: ["asset", "lotListing"], source: ["web", "android", "ios", "admin", "unknown"], outcome: ["requested", "accepted", "completed", "failed"], action: Object.keys(ACTIVITY_LABELS) };
    if (choices[key] && !choices[key].includes(value)) throw new Error("Invalid activity filter.");
    if (["from", "to"].includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("Enter a valid date.");
    result.set(key, value);
  }
  if (result.get("from") && result.get("to") && result.get("from")! > result.get("to")!) throw new Error("The start date must be before the end date.");
  return result.toString();
}
export function activityRemoval(value: Record<string, unknown>) {
  if (Object.keys(value).length !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) throw new Error("Reload the history before removing it.");
  return { revision: value.revision as number };
}
export const logoLabel = (value?: boolean | null) => value === true ? "On" : value === false ? "Off" : "Not recorded";
export const activityTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "Not recorded";
export function parseActivityPage<T>(value: unknown): ActivityPage<T> {
  const data = (value as { data?: ActivityPage<T> })?.data;
  if (!data || !Array.isArray(data.items) || data.items.length > 100 || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.page) || data.page < 1 || !Number.isSafeInteger(data.limit) || data.limit < 1 || data.items.some(item => !item || typeof item !== "object" || !("id" in item) || !activityIdValid(String(item.id)))) throw new Error("Activity information could not be verified. Refresh to try again.");
  for (const item of data.items) validateActivityItem(item);
  return data;
}
function validateActivityItem(item: unknown) {
  const fail = () => { throw new Error("Activity information could not be verified. Refresh to try again."); };
  const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
  const counts = (value: unknown) => {
    if (value == null) return;
    const row = value as ActivityCounts;
    if (![row.lots, row.photos, row.mainPhotos, row.extraPhotos].every(count) || row.photos !== row.mainPhotos + row.extraPhotos) fail();
  };
  const row = item as ActivityRow | ActivityEvent;
  if (typeof row.source !== "string") fail();
  if ("latestCounts" in row) {
    counts(row.latestCounts);
    if (!["asset", "lotListing"].includes(row.reportType) || typeof row.contract !== "string" || !row.owner || typeof row.owner.name !== "string" || typeof row.owner.email !== "string" || !count(row.revision)) fail();
  } else {
    if (!["device", "server"].includes(row.authority) || typeof row.action !== "string" || typeof row.outcome !== "string" || !row.data) fail();
    counts(row.data.beforeCounts); counts(row.data.afterCounts);
    if (row.data.fields && (!Array.isArray(row.data.fields) || row.data.fields.some(field => typeof field !== "string" && (!field || typeof field.field !== "string")))) fail();
    if (row.data.lots && (!Array.isArray(row.data.lots) || row.data.lots.length > 100 || row.data.lots.some(lot => !lot || typeof lot.id !== "string" || [lot.before, lot.after].some(value => value != null && (!count(value.mainPhotos) || !count(value.extraPhotos))) || (lot.photos && (!Array.isArray(lot.photos) || lot.photos.some(photo => typeof photo.id !== "string")))))) fail();
  }
}
export function parseActivityDetail(value: unknown): ActivityDetail {
  const row = (value as { data?: ActivityDetail })?.data;
  if (!row || !activityIdValid(row.id) || ![row.canViewValues, row.canOpenPreview, row.canRemove, row.reportExists].every(flag => typeof flag === "boolean") ||
      (row.previewPath != null && row.previewPath !== "/preview-reports" && !/^\/reports\/[a-f\d]{24}\/data$/.test(row.previewPath))) throw new Error("Activity details could not be verified.");
  validateActivityItem(row); return row;
}
