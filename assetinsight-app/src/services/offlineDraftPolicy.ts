import type { OfflineReportDraft } from './autoSaveService';
import { isUploadFinalizing, pauseActiveUploads } from './uploadCancellation';

// Closes the gap between tapping Offline and the next durable draft transaction.
const held = new Set<string>();
/** Durable user intent survives process death; restoring it never starts transport. */
export function needsExplicitUploadResume(state: unknown): boolean {
  return state === 'ready' || state === 'uploading' || state === 'paused';
}
/*
 * Offline stops whatever is uploading at once. Since 2026-10-02 another
 * report may be uploading in the background (backgroundUploadManager.ts),
 * which tries again by itself. A submission being finalized is left to settle,
 * like the other soft pauses (beginUploadFinalization in uploadCancellation.ts):
 * stopping it then would throw away the server's acceptance and show that
 * report as "Earlier upload accepted". A cloud save of this draft still stops
 * at its next step, because allowsCloudDraft() refuses a held draft.
 */
export function setDraftCaptureMode(id: string, mode: 'online' | 'offline') {
  if (mode === 'offline') {
    held.add(id);
    if (!isUploadFinalizing()) pauseActiveUploads();
  }
}
export function allowsCloudDraft(draft: OfflineReportDraft) {
  return !held.has(draft.id) && !draft.manualSubmissionRequired && !draft.formData.manualSubmissionRequired && draft.captureMode !== 'offline' && draft.formData.captureMode !== 'offline';
}
