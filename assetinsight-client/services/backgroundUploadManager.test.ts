import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resumeStore = vi.hoisted(() => ({
  rememberResumableUpload: vi.fn(async () => {}),
  attachResumableSession: vi.fn(async () => {}),
  recordResumableProgress: vi.fn(async () => {}),
  forgetResumableUpload: vi.fn(async () => {}),
  forgetOwnerResumableUploads: vi.fn(async () => {}),
}));

vi.mock("./uploadResumeStore", () => resumeStore);

import {
  INTERRUPTED_MESSAGE,
  PAUSED_MESSAGE,
  createBackgroundUploadManager,
  describeBackgroundUpload,
  type BackgroundUploadRequest,
} from "./backgroundUploadManager";

type Deferred = {
  promise: Promise<unknown>;
  resolve: (value?: unknown) => void;
  reject: (error: unknown) => void;
  progress?: (fraction: number) => void;
  signal?: AbortSignal;
  started: boolean;
};

function deferredUpload(): Deferred {
  const state: Deferred = {
    started: false,
  } as Deferred;
  state.promise = new Promise((resolve, reject) => {
    state.resolve = resolve as Deferred["resolve"];
    state.reject = reject;
  });
  return state;
}

function request(
  overrides: Partial<BackgroundUploadRequest> & { deferred: Deferred }
): BackgroundUploadRequest {
  const { deferred, ...rest } = overrides;
  return {
    ownerId: "owner-1",
    kind: "asset",
    scopeId: "scope-1",
    endpoint: "/asset",
    title: "CN-1001",
    totalFiles: 4,
    clientSubmissionId: "submission-1",
    details: { contract_no: "CN-1001" },
    files: [{ name: "a1.jpg", size: 10, lastModified: 1700000000000 }],
    upload: (onProgress, signal) => {
      deferred.started = true;
      deferred.progress = onProgress;
      deferred.signal = signal;
      return deferred.promise;
    },
    ...rest,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let manager: ReturnType<typeof createBackgroundUploadManager>;

beforeEach(() => {
  manager = createBackgroundUploadManager();
  manager.setOwner("owner-1");
});

afterEach(() => {
  manager.resetForTests();
  vi.clearAllMocks();
});

describe("the line", () => {
  it("runs one upload at a time and starts the next on acceptance", async () => {
    const first = deferredUpload();
    const second = deferredUpload();
    manager.enqueue(request({ deferred: first, scopeId: "scope-1" }));
    manager.enqueue(request({ deferred: second, scopeId: "scope-2" }));
    await flush();

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(manager.getSnapshot().queued).toHaveLength(1);

    first.resolve({ reportId: "report-1" });
    await flush();

    expect(second.started).toBe(true);
    expect(manager.getSnapshot().queued).toHaveLength(0);
  });

  it("tells listeners an upload was accepted and clears its resume record", async () => {
    const accepted = vi.fn();
    manager.onAccepted(accepted);
    const upload = deferredUpload();
    manager.enqueue(request({ deferred: upload }));
    await flush();

    upload.resolve({ reportId: "report-1" });
    await flush();

    expect(accepted).toHaveBeenCalledWith({
      kind: "asset",
      scopeId: "scope-1",
      result: { reportId: "report-1" },
    });
    expect(resumeStore.forgetResumableUpload).toHaveBeenCalledWith("owner-1", "asset", "scope-1");
    expect(manager.getSnapshot().notices.at(-1)).toMatchObject({ kind: "sent", heading: "Sent" });
  });

  it("records a resume record at hand-off so a closed tab can recover", async () => {
    manager.enqueue(request({ deferred: deferredUpload() }));
    await flush();

    expect(resumeStore.rememberResumableUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        kind: "asset",
        scopeId: "scope-1",
        clientSubmissionId: "submission-1",
        totalFiles: 4,
        uploadedFiles: 0,
      })
    );
  });

  it("does not record a second time when a resume re-enqueues its own job", async () => {
    manager.enqueue(request({ deferred: deferredUpload(), skipPersist: true }));
    await flush();

    expect(resumeStore.rememberResumableUpload).not.toHaveBeenCalled();
  });
});

describe("pausing and resuming", () => {
  it("aborts the transfer and holds the job as paused", async () => {
    const upload = deferredUpload();
    const id = manager.enqueue(request({ deferred: upload }));
    await flush();

    manager.pause(id);
    expect(upload.signal?.aborted).toBe(true);

    upload.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await flush();

    const held = manager.getSnapshot().held;
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ status: "paused", message: PAUSED_MESSAGE });
    expect(manager.getSnapshot().active).toBeNull();
  });

  it("falls back to the interrupted wording when a failure carries no message", async () => {
    const upload = deferredUpload();
    manager.enqueue(request({ deferred: upload }));
    await flush();

    upload.reject(new Error(""));
    await flush();

    expect(manager.getSnapshot().held[0]).toMatchObject({
      status: "attention",
      message: INTERRUPTED_MESSAGE,
    });
  });

  it("puts a resumed job back in line and gives it a fresh attempt", async () => {
    // Each call to upload() is its own attempt, as the transport behaves.
    const attempts: Deferred[] = [];
    const id = manager.enqueue({
      ...request({ deferred: deferredUpload() }),
      upload: (onProgress, signal) => {
        const attempt = deferredUpload();
        attempt.progress = onProgress;
        attempt.signal = signal;
        attempts.push(attempt);
        return attempt.promise;
      },
    });
    await flush();

    manager.pause(id);
    attempts[0].reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await flush();
    expect(manager.getSnapshot().held).toHaveLength(1);

    manager.resume(id);
    await flush();

    expect(attempts).toHaveLength(2);
    expect(manager.getSnapshot().held).toHaveLength(0);
    expect(manager.getSnapshot().active).toMatchObject({ id, status: "uploading" });
  });

  it("stops offering Pause once the submission is being finalized", async () => {
    const upload = deferredUpload();
    const id = manager.enqueue(request({ deferred: upload }));
    await flush();

    upload.progress?.(0.5);
    expect(manager.getSnapshot().active?.canPause).toBe(true);

    upload.progress?.(0.96);
    expect(manager.getSnapshot().active).toMatchObject({ canPause: false, finalizing: true });

    manager.pause(id);
    expect(upload.signal?.aborted).toBe(false);
  });

  it("keeps a stopped upload out of the line and forgets how to resume it", async () => {
    const upload = deferredUpload();
    const id = manager.enqueue(request({ deferred: upload }));
    await flush();

    manager.stop(id);
    await flush();

    expect(upload.signal?.aborted).toBe(true);
    expect(manager.getSnapshot().active).toBeNull();
    expect(manager.getSnapshot().held).toHaveLength(0);
    expect(resumeStore.forgetResumableUpload).toHaveBeenCalledWith("owner-1", "asset", "scope-1");
  });
});

describe("failure", () => {
  it("holds the job for attention and keeps its message", async () => {
    const upload = deferredUpload();
    manager.enqueue(request({ deferred: upload }));
    await flush();

    upload.reject(new Error("An earlier submission was already accepted."));
    await flush();

    expect(manager.getSnapshot().held[0]).toMatchObject({
      status: "attention",
      message: "An earlier submission was already accepted.",
    });
    expect(manager.getSnapshot().notices.at(-1)).toMatchObject({ kind: "attention" });
    // A failure must not look like a completed submission.
    expect(resumeStore.forgetResumableUpload).not.toHaveBeenCalled();
  });
});

describe("conflicts only the form can resolve", () => {
  const conflict = () =>
    Object.assign(new Error("Another report is already active."), { code: "ACTIVE_REPORT_EXISTS" });

  it("marks the draft foreground so its next Submit runs inline", async () => {
    const upload = deferredUpload();
    manager.enqueue({
      ...request({ deferred: upload }),
      needsFormDecision: (error) => (error as { code?: string })?.code === "ACTIVE_REPORT_EXISTS",
    });
    await flush();

    expect(manager.isForegroundRequired("asset", "scope-1")).toBe(false);
    upload.reject(conflict());
    await flush();

    expect(manager.isForegroundRequired("asset", "scope-1")).toBe(true);
    expect(manager.getSnapshot().held[0]).toMatchObject({ needsForm: true });
    expect(manager.getSnapshot().held[0].message).toContain("Open the report from Drafts");
  });

  it("refuses to retry such a job from the bar", async () => {
    const attempts: Deferred[] = [];
    const id = manager.enqueue({
      ...request({ deferred: deferredUpload() }),
      needsFormDecision: () => true,
      upload: () => {
        const attempt = deferredUpload();
        attempts.push(attempt);
        return attempt.promise;
      },
    });
    await flush();
    attempts[0].reject(conflict());
    await flush();

    manager.resume(id);
    await flush();

    expect(attempts).toHaveLength(1);
    expect(manager.getSnapshot().held).toHaveLength(1);
  });

  it("leaves an ordinary failure retryable from the bar", async () => {
    const attempts: Deferred[] = [];
    const id = manager.enqueue({
      ...request({ deferred: deferredUpload() }),
      needsFormDecision: () => false,
      upload: () => {
        const attempt = deferredUpload();
        attempts.push(attempt);
        return attempt.promise;
      },
    });
    await flush();
    attempts[0].reject(new Error("network lost"));
    await flush();

    manager.resume(id);
    await flush();

    expect(attempts).toHaveLength(2);
    expect(manager.isForegroundRequired("asset", "scope-1")).toBe(false);
  });

  it("releases the requirement once the draft is accepted", async () => {
    const attempts: Deferred[] = [];
    manager.enqueue({
      ...request({ deferred: deferredUpload() }),
      needsFormDecision: () => true,
      upload: () => {
        const attempt = deferredUpload();
        attempts.push(attempt);
        return attempt.promise;
      },
    });
    await flush();
    attempts[0].reject(conflict());
    await flush();
    expect(manager.isForegroundRequired("asset", "scope-1")).toBe(true);

    // The form took the decision, resolved it, and submitted inline.
    manager.clearForegroundRequirement("asset", "scope-1");
    expect(manager.isForegroundRequired("asset", "scope-1")).toBe(false);
  });
});

describe("account changes", () => {
  it("empties the line without writing for the previous account", async () => {
    const upload = deferredUpload();
    manager.enqueue(request({ deferred: upload }));
    await flush();

    manager.setOwner("owner-2");
    upload.resolve({ reportId: "report-1" });
    await flush();

    expect(upload.signal?.aborted).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ active: null, queued: [], held: [] });
    expect(resumeStore.forgetOwnerResumableUploads).toHaveBeenCalledWith("owner-1");
    // Acceptance arriving after the switch must not clear the new owner's state.
    expect(resumeStore.forgetResumableUpload).not.toHaveBeenCalled();
  });
});

describe("draft guards", () => {
  it("reports a draft as busy only while it is queued or uploading", async () => {
    const upload = deferredUpload();
    const id = manager.enqueue(request({ deferred: upload }));
    await flush();
    expect(manager.isDraftBusy("asset", "scope-1")).toBe(true);

    manager.pause(id);
    upload.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await flush();

    expect(manager.isDraftBusy("asset", "scope-1")).toBe(false);
    expect(manager.entryForDraft("asset", "scope-1")).toMatchObject({ status: "paused" });
    expect(manager.entryForDraft("asset", "other")).toBeNull();
  });
});

describe("leaving the page", () => {
  it("warns while work is outstanding and stops warning once the line empties", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const upload = deferredUpload();
    manager.enqueue(request({ deferred: upload }));
    await flush();

    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    upload.resolve({ reportId: "report-1" });
    await flush();

    expect(remove).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });
});

describe("describeBackgroundUpload", () => {
  it("names each state the appraiser can see", () => {
    const base = {
      id: "upload-1",
      ownerId: "owner-1",
      kind: "asset" as const,
      title: "CN-1001",
      percent: 63,
      totalFiles: 5,
      pausing: false,
      canPause: true,
      finalizing: false,
      needsForm: false,
    };

    expect(describeBackgroundUpload({ ...base, status: "queued" })).toBe("Waiting in line");
    expect(describeBackgroundUpload({ ...base, status: "paused" })).toBe("Paused");
    expect(describeBackgroundUpload({ ...base, status: "attention" })).toBe("Needs attention");
    expect(describeBackgroundUpload({ ...base, status: "uploading", pausing: true })).toBe("Pausing");
    expect(describeBackgroundUpload({ ...base, status: "uploading", finalizing: true })).toBe("Finalizing");
    expect(describeBackgroundUpload({ ...base, status: "uploading" })).toBe("Uploading 63%");
  });
});
