import type { OfflineReportDraft } from './autoSaveService';
import { pauseActiveUploads } from './uploadCancellation';

// Closes the gap between tapping Offline and the next durable draft transaction.
const held = new Set<string>();
/** Durable user intent survives process death; restoring it never starts transport. */
export function needsExplicitUploadResume(state: unknown): boolean {
  return state === 'ready' || state === 'uploading' || state === 'paused';
}
export function setDraftCaptureMode(id: string, mode: 'online' | 'offline') {
  if (mode === 'offline') { held.add(id); pauseActiveUploads(); }
}
export function allowsCloudDraft(draft: OfflineReportDraft) {
  return !held.has(draft.id) && !draft.manualSubmissionRequired && !draft.formData.manualSubmissionRequired && draft.captureMode !== 'offline' && draft.formData.captureMode !== 'offline';
}
