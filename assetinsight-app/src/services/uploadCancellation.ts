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
export type UploadOperation = { assertActive(): void; isActive(): boolean };
/** One fence spans preparation, every transport and legacy fallback; never reset it on retry. */
export function createUploadOperation(): UploadOperation {
  const generation = epoch;
  const owner = uploadOwner;
  const isActive = () => generation === epoch && owner === uploadOwner;
  return { isActive, assertActive() { if (!isActive()) throw pausedError(); } };
}
export async function cancellableUploadRequest<T>(operation: UploadOperation, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  operation.assertActive();
  const controller = new AbortController();
  const unregister = registerUploadCancellation(() => controller.abort());
  try {
    const result = await request(controller.signal);
    operation.assertActive();
    return result;
  } catch (error) {
    operation.assertActive();
    throw error;
  } finally { unregister(); }
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
