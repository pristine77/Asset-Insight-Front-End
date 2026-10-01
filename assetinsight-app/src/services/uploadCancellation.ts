let epoch = 0;
let uploadOwner: string | null = null;
const cancels = new Set<() => void>();
/** Bind with local draft ownership, before starting any account's uploads. */
export function setUploadOwner(ownerId: string | null) {
  if (uploadOwner !== ownerId) pauseActiveUploads();
  uploadOwner = ownerId;
}
function pausedError() {
  const error = new Error('Upload paused. Your draft is saved. Resume this same upload to check whether the server already accepted it.');
  return Object.assign(error, { code: 'ERR_CANCELED', acceptanceUncertain: true });
}
export function uploadGeneration() { return epoch; }
export function assertUploadGeneration(expected: number) {
  if (epoch !== expected) throw pausedError();
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
      if (!isActive()) throw pausedError();
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
export function pauseActiveUploads() {
  epoch++;
  for (const cancel of cancels) { try { cancel(); } catch { /* Every task is fenced by generation too. */ } }
  cancels.clear();
}
