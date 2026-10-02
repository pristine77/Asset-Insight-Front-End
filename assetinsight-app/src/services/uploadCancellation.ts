let epoch = 0;
let uploadOwner: string | null = null;
const cancels = new Set<() => void>();
/** Bind with local draft ownership, before starting any account's uploads. */
export function setUploadOwner(ownerId: string | null) {
  if (uploadOwner !== ownerId) pauseActiveUploads();
  uploadOwner = ownerId;
}
/**
 * Why uploads were paused, when no person asked for it. Only the automatic
 * pause on a lost connection gives one; the Pause button, Offline mode and an
 * account change give none. An open report resumes an upload paused for a
 * reason by itself once the signal is back (uploadAutoResume.ts, 2026-10-02).
 */
export type UploadPauseReason = 'connection';
// The reason for each pause, by the generation that pause started. The pause
// that ended generation g is the one that started g + 1.
const pauseReasons = new Map<number, UploadPauseReason>();
const PAUSE_REASONS_KEPT = 64;
function pausedError(generation?: number) {
  const error = new Error('Upload paused. Your draft is saved. Resume this same upload to check whether the server already accepted it.');
  const pauseReason = generation === undefined ? undefined : pauseReasons.get(generation + 1);
  return Object.assign(error, { code: 'ERR_CANCELED', acceptanceUncertain: true }, pauseReason ? { pauseReason } : {});
}
export function uploadGeneration() { return epoch; }
export function assertUploadGeneration(expected: number) {
  if (epoch !== expected) throw pausedError(expected);
}
export type UploadOperation = {
  assertActive(): void;
  isActive(): boolean;
  cancel(error: Error): void;
  onCancel(callback: () => void): () => void;
};
/** One fence spans preparation, every transport and legacy fallback; never reset it on retry. */
export function createUploadOperation(parent?: UploadOperation): UploadOperation {
  const generation = epoch;
  const owner = uploadOwner;
  let failure: Error | undefined;
  const listeners = new Set<() => void>();
  const isActive = () => !failure && generation === epoch && owner === uploadOwner && (!parent || parent.isActive());
  return {
    isActive,
    assertActive() {
      if (failure) throw failure;
      parent?.assertActive();
      if (!isActive()) throw pausedError(generation);
    },
    cancel(error) {
      if (failure) return;
      failure = error;
      for (const callback of listeners) {
        try { callback(); } catch { /* A faulty transport must not keep siblings running. */ }
      }
      listeners.clear();
    },
    onCancel(callback) {
      listeners.add(callback);
      const unregisterGlobal = registerUploadCancellation(callback);
      const unregisterParent = parent?.onCancel(callback);
      return () => { listeners.delete(callback); unregisterGlobal(); unregisterParent?.(); };
    },
  };
}

export const UPLOAD_IDLE_TIMEOUT_MS = 120_000;
export function isUploadStalled(error: any): boolean {
  return ['UPLOAD_STALLED', 'E_UPLOAD_STALLED'].includes(String(error?.code || ''));
}

/** Settle even if a native callback ignores cancel; retain identity for explicit resume. */
export async function cancellableUploadTask<T>(
  operation: UploadOperation,
  request: (controls: { touch(): void; isActive(): boolean }) => Promise<T>,
  cancel: () => void,
  options: { idleTimeoutMs?: number; message?: string } = {}
): Promise<T> {
  operation.assertActive();
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectInterrupted!: (error: unknown) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  const stop = (error: unknown) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    // Reject before native cancellation, which itself may block or never settle.
    rejectInterrupted(error);
    try { cancel(); } catch { /* The operation fence still rejects late callbacks. */ }
  };
  const touch = () => {
    if (finished || !options.idleTimeoutMs) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => stop(Object.assign(new Error(options.message ||
      'The upload stopped making progress. Your draft is saved. Resume the same upload when the connection is stable.'),
    { code: 'UPLOAD_STALLED', isRecoverableUploadError: true, acceptanceUncertain: true })), options.idleTimeoutMs);
  };
  const unregister = operation.onCancel(() => {
    try { operation.assertActive(); } catch (error) { stop(error); }
  });
  try {
    operation.assertActive();
    touch();
    let pending: Promise<T>;
    try { pending = request({ touch, isActive: () => !finished && operation.isActive() }); }
    catch (error) { pending = Promise.reject(error); }
    const result = await Promise.race([pending, interrupted]);
    operation.assertActive();
    return result;
  } finally {
    finished = true;
    if (timer) clearTimeout(timer);
    unregister();
  }
}

export async function cancellableUploadRequest<T>(operation: UploadOperation, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  return cancellableUploadTask(operation, () => request(controller.signal), () => controller.abort());
}
export function registerUploadCancellation(cancel: () => void) {
  cancels.add(cancel);
  return () => { cancels.delete(cancel); };
}
/*
 * Finalizing a submission (POST .../upload-session/:id/complete) is the step in
 * which the server accepts the report. Pausing it cannot stop that acceptance;
 * it only throws away the answer, which left accepted reports marked "paused"
 * and stuck on Resume upload (reported 2026-10-01). The request is bounded
 * (120 s per attempt) and idempotent on the server, so it is allowed to settle.
 *
 * Soft pauses -- the Pause button, Android back on the progress overlay, and the
 * automatic pause on a lost connection -- check isUploadFinalizing() and stand
 * down. pauseActiveUploads() itself is unchanged: an account switch or sign-out
 * still cancels everything, finalizing or not.
 */
let finalizingUploads = 0;
/** Mark a submission as finalizing until the returned function is called (idempotent). */
export function beginUploadFinalization(): () => void {
  finalizingUploads += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    finalizingUploads = Math.max(0, finalizingUploads - 1);
  };
}
export function isUploadFinalizing(): boolean {
  return finalizingUploads > 0;
}
export function pauseActiveUploads(reason?: UploadPauseReason) {
  epoch++;
  if (reason) pauseReasons.set(epoch, reason);
  pauseReasons.delete(epoch - PAUSE_REASONS_KEPT);
  for (const cancel of cancels) { try { cancel(); } catch { /* Every task is fenced by generation too. */ } }
  cancels.clear();
}
