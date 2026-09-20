import API from "@/lib/api";

export type DirectUploadFile = {
  file: File;
  fieldname?: "images" | "videos";
  lotIndex?: number;
  imageIndex?: number;
  captureOrder?: number;
  originalOrder?: number;
  role?: "main" | "extra" | "video";
};

type UploadSession = {
  sessionId: string;
  reportId?: string;
  jobId: string;
  status?: string;
  resumed?: boolean;
  alreadyQueued?: boolean;
  processed?: boolean;
  readyToComplete?: boolean;
  files: Array<{
    fileId: string;
    uploadUrl: string;
    method: "PUT";
    contentType: string;
    headers?: Record<string, string>;
  }>;
};

export const DIRECT_UPLOAD_CONCURRENCY = 4;
const DIRECT_UPLOAD_RETRIES = 2;
const SERVER_FALLBACK_RETRIES = 2;
const COMPLETE_SESSION_RETRIES = 4;
const DIRECT_UPLOAD_CIRCUIT_TTL_MS = 10 * 60 * 1000;
const CLOUDFLARE_R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";
const UPLOAD_SESSION_UNSUPPORTED_CODE = "UPLOAD_SESSION_UNSUPPORTED";

export class UploadSessionUnsupportedError extends Error {
  readonly code = UPLOAD_SESSION_UNSUPPORTED_CODE;
  readonly endpoint: "/asset" | "/lot-listing";
  readonly originalError: unknown;

  constructor(
    endpoint: "/asset" | "/lot-listing",
    originalError: unknown
  ) {
    super(`Upload sessions are unsupported for ${endpoint}.`);
    this.name = "UploadSessionUnsupportedError";
    this.endpoint = endpoint;
    this.originalError = originalError;
  }
}

export function isUploadSessionUnsupportedError(
  error: unknown
): error is UploadSessionUnsupportedError {
  return (
    error instanceof UploadSessionUnsupportedError ||
    (error as { code?: unknown } | null)?.code ===
      UPLOAD_SESSION_UNSUPPORTED_CODE
  );
}

function isInitialUploadSessionCapabilityError(error: unknown): boolean {
  const response = (error as any)?.response;
  const status = Number(response?.status || 0);
  if (status === 405 || status === 501) return true;
  if (status !== 404) return false;

  const data = response?.data;
  const code = String(data?.code || "").trim();
  if (code === UPLOAD_SESSION_UNSUPPORTED_CODE) return true;
  const message = typeof data === "string"
    ? data
    : String(data?.message || "");
  // Express returns an HTML/text "Cannot POST ..." response when an older
  // deployment genuinely has no upload-session route. A structured 404 from
  // report/Auctioneer validation is a business error and must never authorize
  // a second legacy submission.
  return /cannot\s+post\b.*\/upload-session/i.test(message);
}

function abortReason(signal?: AbortSignal) {
  return (
    signal?.reason ||
    new DOMException("The operation was aborted.", "AbortError")
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal);
}

function waitForPromiseOrAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

const sleep = (ms: number, signal?: AbortSignal) => {
  if (!signal) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
};
let serverFallbackQueue: Promise<void> = Promise.resolve();
const directUploadUnavailableUntil = new Map<string, number>();

function directUploadHost(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function canUseDirectBrowserUpload(url: string) {
  try {
    // Cloudflare's standard R2 endpoint rejects browser PUT preflights unless
    // the bucket has an explicit CORS policy. Keep uploads working through the
    // authenticated API. This safety rule intentionally wins over a stale
    // NEXT_PUBLIC_DIRECT_R2_UPLOAD build flag: production must not strand a
    // whole selection in repeated, browser-blocked preflights.
    if (
      new URL(url).hostname
        .toLowerCase()
        .endsWith(CLOUDFLARE_R2_HOST_SUFFIX)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const configured = process.env.NEXT_PUBLIC_DIRECT_R2_UPLOAD;
  if (configured === "false") return false;
  return true;
}

function directUploadIsUnavailable(url: string) {
  const host = directUploadHost(url);
  const unavailableUntil = directUploadUnavailableUntil.get(host) || 0;
  if (unavailableUntil > Date.now()) return true;
  directUploadUnavailableUntil.delete(host);
  return false;
}

function markDirectUploadUnavailable(url: string) {
  directUploadUnavailableUntil.set(
    directUploadHost(url),
    Date.now() + DIRECT_UPLOAD_CIRCUIT_TTL_MS
  );
}

export function resetDirectUploadCircuitBreakerForTests() {
  directUploadUnavailableUntil.clear();
}

async function withServerFallbackSlot<T>(
  task: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const previous = serverFallbackQueue;
  let release!: () => void;
  serverFallbackQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired = false;
  try {
    await waitForPromiseOrAbort(previous, signal);
    acquired = true;
    throwIfAborted(signal);
    return await task();
  } finally {
    if (acquired) {
      release();
    } else {
      void previous.then(release, release);
    }
  }
}

function postWithSignal<T>(
  url: string,
  data: unknown,
  signal?: AbortSignal
) {
  return signal
    ? API.post<T>(url, data, { signal })
    : API.post<T>(url, data);
}

const uploadErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as any)?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage.trim();
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const isRetryableServerUploadError = (error: unknown) => {
  const status = Number((error as any)?.response?.status || 0);
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
};

async function completeUploadSessionWithRetry(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  signal?: AbortSignal
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= COMPLETE_SESSION_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await postWithSignal<any>(
        `${endpoint}/upload-session/${sessionId}/complete`,
        {},
        signal
      );
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw abortReason(signal);
      if (!isRetryableServerUploadError(error) || attempt === COMPLETE_SESSION_RETRIES) {
        throw error;
      }
      // Completion is idempotent. Retrying this exact session is safer than
      // resubmitting its files and prevents transient 503s creating duplicates.
      await sleep(Math.min(6000, 750 * 2 ** (attempt - 1)), signal);
    }
  }
  throw lastError;
}

export function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void,
  headers?: Record<string, string>,
  signal?: AbortSignal
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      try {
        xhr.abort();
      } finally {
        rejectOnce(abortReason(signal));
      }
    };
    xhr.open("PUT", url);
    let hasSignedContentType = false;
    for (const [name, value] of Object.entries(headers || {})) {
      if (name.toLowerCase() === "content-type") {
        hasSignedContentType = true;
      }
      xhr.setRequestHeader(name, value);
    }
    if (!hasSignedContentType) {
      xhr.setRequestHeader(
        "Content-Type",
        contentType || file.type || "application/octet-stream"
      );
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const delta = Math.max(0, event.loaded - lastLoaded);
      lastLoaded = event.loaded;
      onDelta?.(delta);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const delta = Math.max(0, file.size - lastLoaded);
        if (delta) onDelta?.(delta);
        resolveOnce();
      } else {
        const detail = xhr.responseText?.trim().replace(/\s+/g, " ").slice(0, 180);
        rejectOnce(new Error(`R2 upload failed for ${file.name} (${xhr.status})${detail ? `: ${detail}` : ""}`));
      }
    };
    xhr.onerror = () =>
      rejectOnce(
        signal?.aborted
          ? abortReason(signal)
          : new Error(`R2 upload failed for ${file.name}`)
      );
    xhr.onabort = () =>
      rejectOnce(
        signal?.aborted
          ? abortReason(signal)
          : new Error(`R2 upload was interrupted for ${file.name}`)
      );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(file);
  });
}

export async function uploadFileThroughServerFallback(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  fileId: string,
  file: File,
  signal?: AbortSignal
) {
  await withServerFallbackSlot(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SERVER_FALLBACK_RETRIES; attempt += 1) {
      throwIfAborted(signal);
      const formData = new FormData();
      formData.append("file", file, file.name);
      try {
        await API.post(
          `${endpoint}/upload-session/${sessionId}/files/${encodeURIComponent(fileId)}`,
          formData,
          {
            // Let the browser/Axios add the multipart boundary. Setting
            // Content-Type manually can produce an incomplete form body behind
            // some proxies.
            timeout: 300000,
            ...(signal ? { signal } : {}),
          }
        );
        return;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw abortReason(signal);
        if (
          attempt >= SERVER_FALLBACK_RETRIES ||
          !isRetryableServerUploadError(error)
        ) {
          throw error;
        }
        await sleep(750 * (attempt + 1), signal);
      }
    }
    throw lastError;
  }, signal);
}

export async function verifyUploadSessionFile(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  fileId: string,
  signal?: AbortSignal
) {
  const { data } = await postWithSignal<any>(
    `${endpoint}/upload-session/${sessionId}/files/${encodeURIComponent(fileId)}/verify`,
    {},
    signal
  );
  return data?.data?.verified === true;
}

export async function uploadFileToReportSession(args: {
  endpoint: "/asset" | "/lot-listing";
  sessionId: string;
  fileId: string;
  uploadUrl: string;
  file: File;
  contentType: string;
  headers?: Record<string, string>;
  onDelta?: (delta: number) => void;
  signal?: AbortSignal;
}) {
  throwIfAborted(args.signal);
  if (
    !canUseDirectBrowserUpload(args.uploadUrl) ||
    directUploadIsUnavailable(args.uploadUrl)
  ) {
    await uploadFileThroughServerFallback(
      args.endpoint,
      args.sessionId,
      args.fileId,
      args.file,
      args.signal
    );
    return { transport: "server" as const };
  }

  try {
    await putFileWithRetry(
      args.uploadUrl,
      args.file,
      args.contentType,
      args.onDelta,
      args.headers,
      args.signal
    );
    return { transport: "direct" as const };
  } catch (directUploadError) {
    if (args.signal?.aborted) {
      throw abortReason(args.signal);
    }
    // R2 may accept the PUT but hide the response from the browser when its
    // CORS policy is absent or stale. A small authenticated HEAD check avoids
    // uploading the same multi-megabyte photo through the API unnecessarily.
    try {
      const verified = await verifyUploadSessionFile(
        args.endpoint,
        args.sessionId,
        args.fileId,
        args.signal
      );
      if (verified) return { transport: "direct-verified" as const };
    } catch {
      if (args.signal?.aborted) {
        throw abortReason(args.signal);
      }
      // A missing object or an older API without the verification endpoint
      // should continue to the compatible server upload path.
    }

    // A failed PUT followed by a failed object verification normally means the
    // storage host is unavailable to this browser (most often a missing R2
    // CORS rule). Remember that briefly so a large report does not repeat the
    // same doomed retries for every remaining photo.
    markDirectUploadUnavailable(args.uploadUrl);
    throwIfAborted(args.signal);

    try {
      // Preserve the original session and R2 object key. This is a transport
      // fallback only and cannot create a duplicate report or reorder files.
      await uploadFileThroughServerFallback(
        args.endpoint,
        args.sessionId,
        args.fileId,
        args.file,
        args.signal
      );
      return { transport: "server" as const };
    } catch (fallbackError) {
      if (args.signal?.aborted) {
        throw abortReason(args.signal);
      }
      const directMessage = uploadErrorMessage(
        directUploadError,
        "Direct R2 upload failed"
      );
      const fallbackMessage = uploadErrorMessage(
        fallbackError,
        "Server fallback upload failed"
      );
      throw new Error(`${directMessage}. ${fallbackMessage}`);
    }
  }
}

export async function putFileWithRetry(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void,
  headers?: Record<string, string>,
  signal?: AbortSignal
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DIRECT_UPLOAD_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    try {
      await putFileWithProgress(
        url,
        file,
        contentType,
        onDelta,
        headers,
        signal
      );
      return;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw abortReason(signal);
      if (attempt < DIRECT_UPLOAD_RETRIES) {
        await sleep(500 * (attempt + 1), signal);
      }
    }
  }
  throw lastError;
}

export async function mapWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = DIRECT_UPLOAD_CONCURRENCY,
  signal?: AbortSignal
) {
  throwIfAborted(signal);
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let nextIndex = 0;
  let firstError: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (!failed) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) break;
        try {
          throwIfAborted(signal);
          await worker(items[index], index);
        } catch (error) {
          if (!failed) firstError = error;
          failed = true;
        }
      }
    })
  );
  if (failed) throw firstError;
}

export async function uploadReportFilesDirectToR2(args: {
  endpoint: "/asset" | "/lot-listing";
  details: Record<string, any>;
  files: DirectUploadFile[];
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}) {
  throwIfAborted(args.signal);
  const totalBytes = args.files.reduce((sum, item) => sum + (item.file.size || 1), 0) || 1;
  let uploadedBytes = 0;
  const manifest = args.files.map((item, index) => ({
    // Keep file ids deterministic so create/complete can be retried safely.
    fileId: `${item.fieldname || "images"}-${index}`,
    name: item.file.name || `${item.fieldname || "image"}-${index + 1}`,
    type: item.file.type || "application/octet-stream",
    size: item.file.size,
    lastModified: Number.isFinite(item.file.lastModified)
      ? Math.max(0, Math.trunc(item.file.lastModified))
      : undefined,
    fieldname: item.fieldname || "images",
    lotIndex: item.lotIndex,
    imageIndex: item.imageIndex ?? index,
    captureOrder: item.captureOrder ?? item.originalOrder ?? index,
    originalOrder: item.originalOrder ?? item.captureOrder ?? index,
    role: item.role || (item.fieldname === "videos" ? "video" : "main"),
  }));

  let sessionEnvelope: { data: UploadSession };
  try {
    const response = await postWithSignal<{ data: UploadSession }>(
      `${args.endpoint}/upload-session`,
      {
        details: args.details,
        files: manifest,
      },
      args.signal
    );
    sessionEnvelope = response.data;
  } catch (error) {
    if (args.signal?.aborted) throw abortReason(args.signal);
    if (isInitialUploadSessionCapabilityError(error)) {
      throw new UploadSessionUnsupportedError(args.endpoint, error);
    }
    throw error;
  }
  const session = sessionEnvelope.data;
  if (session.alreadyQueued && session.reportId) {
    args.onUploadProgress?.(1);
    return {
      message: "Submission already accepted and is being processed.",
      jobId: session.jobId,
      reportId: session.reportId,
      status: session.status || "processing",
      phase: session.processed || session.status === "processed" ? "done" : "processing",
      resumed: true,
    };
  }
  throwIfAborted(args.signal);
  const targetById = new Map(session.files.map((file) => [file.fileId, file]));

  if (!session.readyToComplete) {
    const uploadController = new AbortController();
    let terminalUploadError: unknown;
    const forwardCallerAbort = () =>
      uploadController.abort(abortReason(args.signal));
    args.signal?.addEventListener("abort", forwardCallerAbort, { once: true });
    try {
      throwIfAborted(args.signal);
      await mapWithConcurrency(args.files, async (item, index) => {
        const target = targetById.get(manifest[index].fileId);
        if (!target) {
          const error = new Error(`Missing upload target for ${item.file.name}`);
          terminalUploadError = error;
          uploadController.abort(error);
          throw error;
        }
        let fileLoaded = 0;
        try {
          await uploadFileToReportSession({
            endpoint: args.endpoint,
            sessionId: session.sessionId,
            fileId: manifest[index].fileId,
            uploadUrl: target.uploadUrl,
            file: item.file,
            contentType: target.contentType,
            headers: target.headers,
            signal: uploadController.signal,
            onDelta: (delta) => {
              const nextLoaded = Math.min(item.file.size, fileLoaded + delta);
              uploadedBytes += Math.max(0, nextLoaded - fileLoaded);
              fileLoaded = nextLoaded;
              args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
            },
          });
        } catch (error) {
          if (!uploadController.signal.aborted) {
            terminalUploadError = error;
            uploadController.abort(error);
          }
          throw error;
        }
        // Direct progress events may be unavailable, and server fallback has no
        // browser upload progress. Count the file as complete exactly once.
        if (fileLoaded < item.file.size) {
          uploadedBytes += item.file.size - fileLoaded;
          fileLoaded = item.file.size;
          args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
        }
      }, DIRECT_UPLOAD_CONCURRENCY, uploadController.signal).catch((error) => {
        // An aborted sibling can settle before the worker that discovered the
        // actual failure. Preserve that first terminal cause for useful retry
        // guidance instead of surfacing an internal AbortError.
        throw terminalUploadError || error;
      });
    } finally {
      args.signal?.removeEventListener("abort", forwardCallerAbort);
    }
  }

  throwIfAborted(args.signal);
  args.onUploadProgress?.(0.95);
  const { data } = await completeUploadSessionWithRetry(
    args.endpoint,
    session.sessionId,
    args.signal
  );
  args.onUploadProgress?.(1);
  return data;
}
