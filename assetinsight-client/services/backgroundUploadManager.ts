import type { FormDraftKind } from "@/components/forms/drafts/storage";
import type { SubmissionFileDescriptor } from "./uploadJobFiles";
import {
  attachResumableSession,
  forgetOwnerResumableUploads,
  forgetResumableUpload,
  recordResumableProgress,
  rememberResumableUpload,
} from "./uploadResumeStore";

/**
 * The browser's background upload line.
 *
 * Submit hands one frozen report to this module and closes its form, so the
 * appraiser can start the next report instead of watching a progress bar. One
 * upload runs at a time; the rest wait in line. Navigating inside the
 * application does not interrupt anything, because the line lives here rather
 * than in a form component.
 *
 * Closing the tab does end the transfer — a browser cannot keep a fetch alive
 * past unload. What survives is the *identity*: `uploadResumeStore` holds the
 * session and submission ids, the drafts database still holds the photographs,
 * and the already-uploaded objects are still in R2. Recovery replays the same
 * session rather than submitting again.
 *
 * Nothing here resumes by itself after an interruption. Resume is always an
 * explicit action, so a report is never re-sent on the strength of a guess
 * about what the server did with the attempt that was cut off.
 */

const MAX_NOTICES = 10;

export type BackgroundUploadStatus = "queued" | "uploading" | "paused" | "attention";

export type BackgroundUploadRequest = {
  ownerId: string;
  kind: FormDraftKind;
  /** Draft scope owning the media; the key for resume and the drafts guard. */
  scopeId?: string;
  endpoint: "/asset" | "/lot-listing";
  /** Contract number or client name, shown on the bar. */
  title: string;
  totalFiles: number;
  /** Stable submission identity. An exact retry coalesces onto it server-side. */
  clientSubmissionId: string;
  /** Frozen payload, replayed verbatim by a resume. */
  details: Record<string, unknown>;
  /** Frozen media identities, in submission order, for the resume guard. */
  files: SubmissionFileDescriptor[];
  /** Runs one attempt. The manager owns the signal and the progress callback. */
  upload: (
    onProgress: (fraction: number) => void,
    signal: AbortSignal
  ) => Promise<unknown>;
  /** Already persisted by a resume; a fresh hand-off records its own. */
  skipPersist?: boolean;
  /**
   * Whether this failure needs a decision only the form can offer — an active
   * report conflict, a changed manifest, a separate-draft recovery. The form
   * owns those semantics, so it supplies the test. A true answer marks the
   * draft as foreground: its next Submit runs inline, where the dialog lives.
   */
  needsFormDecision?: (error: unknown) => boolean;
  /**
   * Cleanup the form would have run inline on acceptance — clearing its saved
   * draft, chiefly. It runs after the line has released the job, and only for
   * the account that queued it. The draft must survive until this point:
   * recovery rebuilds a resumed upload from exactly that saved media.
   */
  onAccepted?: (result: unknown) => void | Promise<void>;
};

export type BackgroundUploadEntry = {
  id: string;
  ownerId: string;
  kind: FormDraftKind;
  scopeId?: string;
  title: string;
  status: BackgroundUploadStatus;
  percent: number;
  totalFiles: number;
  /** Pause was pressed and the transfer is stopping. */
  pausing: boolean;
  /** False once the submission is being finalized and can no longer be stopped. */
  canPause: boolean;
  finalizing: boolean;
  /** Blocked on a decision only the form can offer; the bar must not retry it. */
  needsForm: boolean;
  message?: string;
};

export type BackgroundUploadNotice = {
  id: string;
  kind: "sent" | "attention";
  jobId: string;
  draftKey: string;
  title: string;
  heading: string;
  message: string;
  /** An ordinary "Sent" clears itself; anything needing a decision does not. */
  autoDismiss: boolean;
};

export type BackgroundUploadSnapshot = {
  active: BackgroundUploadEntry | null;
  queued: BackgroundUploadEntry[];
  /** Paused and needs-attention uploads, oldest first. */
  held: BackgroundUploadEntry[];
  notices: BackgroundUploadNotice[];
};

export type BackgroundUploadAccepted = {
  kind: FormDraftKind;
  scopeId?: string;
  result: unknown;
};

export const SENT_MESSAGE =
  "Processing continues on the server. You will receive an email when the files are ready.";
export const PAUSED_MESSAGE =
  "Upload paused. Your draft and photos are saved. Resume to continue this same upload.";
export const STOPPED_MESSAGE =
  "Upload stopped. Your draft and photos are saved and nothing was submitted.";
export const BUSY_DRAFT_MESSAGE =
  "This report is uploading in the background. Open it again once the upload finishes or after pausing it.";
export const INTERRUPTED_MESSAGE =
  "The upload was interrupted. Your draft and photos are saved. Resume to continue where it stopped.";
export const NEEDS_FORM_MESSAGE =
  "This upload needs a decision before it can continue. Open the report from Drafts to review it.";

type Job = BackgroundUploadRequest & {
  id: string;
  status: BackgroundUploadStatus;
  percent: number;
  pauseRequested: boolean;
  finalizing: boolean;
  message?: string;
  controller?: AbortController;
};

const EMPTY: BackgroundUploadSnapshot = { active: null, queued: [], held: [], notices: [] };

export function draftKeyFor(kind: FormDraftKind, scopeId?: string) {
  return `${kind}:${scopeId || "default"}`;
}

const errorMessage = (error: unknown): string | undefined => {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : undefined;
};

/** Short status for a Drafts card: "Uploading 63%", "Waiting in line", … */
export function describeBackgroundUpload(entry: BackgroundUploadEntry): string {
  if (entry.status === "queued") return "Waiting in line";
  if (entry.status === "paused") return "Paused";
  if (entry.status === "attention") return "Needs attention";
  if (entry.pausing) return "Pausing";
  if (entry.finalizing) return "Finalizing";
  return `Uploading ${Math.round(entry.percent)}%`;
}

export function createBackgroundUploadManager() {
  // Bumped when the line is emptied. Work started before that never writes,
  // notifies, or touches durable storage again.
  let generation = 0;
  let sequence = 0;
  let ownerId: string | null = null;
  let active: Job | null = null;
  let queue: Job[] = [];
  let held: Job[] = [];
  let notices: BackgroundUploadNotice[] = [];
  let snapshot: BackgroundUploadSnapshot = EMPTY;
  // Drafts whose next Submit must run in the form, where its prompts can appear.
  const foreground = new Set<string>();
  const listeners = new Set<() => void>();
  const acceptedListeners = new Set<(event: BackgroundUploadAccepted) => void>();
  let unloadGuardInstalled = false;

  const canPause = (job: Job) =>
    job.status === "queued" ||
    (job.status === "uploading" && !job.pauseRequested && !job.finalizing);

  const toEntry = (job: Job): BackgroundUploadEntry => ({
    id: job.id,
    ownerId: job.ownerId,
    kind: job.kind,
    scopeId: job.scopeId,
    title: job.title,
    status: job.status,
    percent: job.percent,
    totalFiles: job.totalFiles,
    pausing: job.status === "uploading" && job.pauseRequested,
    canPause: canPause(job),
    finalizing: job.finalizing,
    needsForm: foreground.has(draftKeyFor(job.kind, job.scopeId)),
    message: job.message,
  });

  /**
   * A transfer in flight cannot survive unload, so warn before one is lost.
   * This replaces the per-form listener: once Submit closes its form, the form's
   * own effect is gone and only the line knows work is outstanding.
   */
  function syncUnloadGuard() {
    if (typeof window === "undefined") return;
    const busy = Boolean(active) || queue.length > 0;
    if (busy && !unloadGuardInstalled) {
      window.addEventListener("beforeunload", warnBeforeUnload);
      unloadGuardInstalled = true;
    } else if (!busy && unloadGuardInstalled) {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      unloadGuardInstalled = false;
    }
  }

  function warnBeforeUnload(event: BeforeUnloadEvent) {
    // Browsers show their own wording and ignore any text set here; the call is
    // only what makes the confirmation appear at all.
    event.preventDefault();
    event.returnValue = "";
  }

  function notify() {
    snapshot = {
      active: active ? toEntry(active) : null,
      queued: queue.map(toEntry),
      held: held.map(toEntry),
      notices: notices.slice(),
    };
    syncUnloadGuard();
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* A faulty view must not stop the line. */
      }
    }
  }

  function addNotice(
    job: Job,
    kind: BackgroundUploadNotice["kind"],
    heading: string,
    message: string,
    autoDismiss = false
  ) {
    const draftKey = draftKeyFor(job.kind, job.scopeId);
    const notice: BackgroundUploadNotice = {
      id: `notice-${(sequence += 1)}`,
      kind,
      jobId: job.id,
      draftKey,
      title: job.title,
      heading,
      message,
      autoDismiss,
    };
    // One attention notice per draft: the newest replaces any older one.
    notices = [
      ...notices.filter((item) => !(item.kind === "attention" && item.draftKey === draftKey)),
      notice,
    ].slice(-MAX_NOTICES);
  }

  function startNext() {
    if (!active) {
      const next = queue.shift();
      if (next) {
        active = next;
        void runAttempt(next);
        return;
      }
    }
    notify();
  }

  /** Takes a job out of the running slot or the line and holds it. */
  function hold(job: Job, status: "paused" | "attention", message?: string) {
    job.controller?.abort();
    Object.assign(job, {
      status,
      message,
      pauseRequested: false,
      finalizing: false,
      controller: undefined,
    });
    if (active === job) active = null;
    queue = queue.filter((item) => item !== job);
    held = [...held.filter((item) => item !== job), job];
    startNext();
  }

  /** Forgets a job without writing anything; its account is no longer signed in. */
  function drop(job: Job) {
    job.controller?.abort();
    if (active === job) active = null;
    queue = queue.filter((item) => item !== job);
    held = held.filter((item) => item !== job);
  }

  async function runAttempt(job: Job): Promise<void> {
    const attemptGeneration = generation;
    const current = () => generation === attemptGeneration && active === job;

    // Drop only for a *different* signed-in account. An unbound line adopts the
    // job's owner at enqueue, so work is never silently discarded because the
    // shell's owner effect had not run yet.
    if (ownerId !== null && ownerId !== job.ownerId) {
      drop(job);
      startNext();
      return;
    }
    if (job.pauseRequested) {
      hold(job, "paused", PAUSED_MESSAGE);
      return;
    }

    const controller = new AbortController();
    Object.assign(job, {
      status: "uploading" as const,
      controller,
      percent: 0,
      finalizing: false,
      message: undefined,
    });
    notify();

    try {
      const result = await job.upload((fraction) => {
        if (!current()) return;
        const percent = Math.max(0, Math.min(100, fraction * 100));
        // The transport reports 0.95 once every file is stored and only the
        // completion call remains. Past that point the submission can no longer
        // be safely abandoned, so Pause stops being offered.
        const finalizing = fraction >= 0.95;
        if (job.percent === percent && job.finalizing === finalizing) return;
        Object.assign(job, { percent, finalizing });
        if (job.totalFiles > 0) {
          void recordResumableProgress(
            job.ownerId,
            job.kind,
            job.scopeId,
            Math.round((percent / 100) * job.totalFiles)
          );
        }
        notify();
      }, controller.signal);

      if (!current()) return;
      await forgetResumableUpload(job.ownerId, job.kind, job.scopeId);
      finishSent(job, result);
    } catch (error) {
      if (!current()) return;
      if (controller.signal.aborted) {
        // Pause is the only abort that leaves the job in the line: stop() and
        // setOwner() drop it first, so current() is already false for those.
        // A paused upload must not read as a failure to interpret.
        hold(job, "paused", PAUSED_MESSAGE);
        notify();
        return;
      }
      // A conflict the form must resolve cannot be retried from the bar: the
      // next Submit has to run inline, where its dialog can appear.
      const needsForm = Boolean(job.needsFormDecision?.(error));
      if (needsForm) foreground.add(draftKeyFor(job.kind, job.scopeId));
      const message = needsForm
        ? `${errorMessage(error) || ""} ${NEEDS_FORM_MESSAGE}`.trim()
        : errorMessage(error) || INTERRUPTED_MESSAGE;
      addNotice(job, "attention", "Upload needs attention", message);
      hold(job, "attention", message);
      notify();
    }
  }

  function finishSent(job: Job, result: unknown) {
    addNotice(job, "sent", "Sent", SENT_MESSAGE, true);
    foreground.delete(draftKeyFor(job.kind, job.scopeId));
    if (active === job) active = null;
    // Failing cleanup leaves a stale local draft, which is recoverable; it must
    // never turn an accepted submission into a failure the appraiser retries.
    void Promise.resolve()
      .then(() => job.onAccepted?.(result))
      .catch(() => undefined);
    const event: BackgroundUploadAccepted = {
      kind: job.kind,
      scopeId: job.scopeId,
      result,
    };
    for (const listener of Array.from(acceptedListeners)) {
      try {
        listener(event);
      } catch {
        /* The upload is accepted whatever a view does with the news. */
      }
    }
    startNext();
  }

  const findJob = (jobId: string): Job | undefined =>
    [active, ...queue, ...held].find((job): job is Job => Boolean(job) && job!.id === jobId);

  // Not a method: callers destructure the manager, and `this` would be lost.
  const entryForDraft = (kind: FormDraftKind, scopeId?: string): BackgroundUploadEntry | null => {
    const key = draftKeyFor(kind, scopeId);
    const job = [active, ...queue, ...held].find(
      (item): item is Job => Boolean(item) && draftKeyFor(item!.kind, item!.scopeId) === key
    );
    return job ? toEntry(job) : null;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): BackgroundUploadSnapshot {
      return snapshot;
    },

    /** Server-rendered passes have no line; returning a stable value avoids a mismatch. */
    getServerSnapshot(): BackgroundUploadSnapshot {
      return EMPTY;
    },

    onAccepted(listener: (event: BackgroundUploadAccepted) => void) {
      acceptedListeners.add(listener);
      return () => {
        acceptedListeners.delete(listener);
      };
    },

    /**
     * Binds the line to one account. A change empties it without writing: the
     * previous account's drafts stay exactly as they were, and work started
     * under it can no longer report, notify or persist.
     */
    setOwner(next: string | null) {
      if (ownerId === next) return;
      const previous = ownerId;
      ownerId = next;
      generation += 1;
      for (const job of [active, ...queue, ...held].filter((job): job is Job => Boolean(job))) {
        job.controller?.abort();
      }
      active = null;
      queue = [];
      held = [];
      notices = [];
      foreground.clear();
      if (previous) void forgetOwnerResumableUploads(previous);
      notify();
    },

    enqueue(request: BackgroundUploadRequest): string {
      // Adopt the owner if nothing has bound one yet; a request can only come
      // from a signed-in form. A different bound owner still fences the job.
      if (ownerId === null) ownerId = request.ownerId;
      const job: Job = {
        ...request,
        id: `upload-${(sequence += 1)}`,
        status: "queued",
        percent: 0,
        pauseRequested: false,
        finalizing: false,
      };
      if (!request.skipPersist) {
        void rememberResumableUpload({
          ownerId: request.ownerId,
          kind: request.kind,
          scopeId: request.scopeId,
          endpoint: request.endpoint,
          details: request.details,
          files: request.files,
          clientSubmissionId: request.clientSubmissionId,
          title: request.title,
          totalFiles: request.totalFiles,
          uploadedFiles: 0,
        });
      }
      queue.push(job);
      startNext();
      return job.id;
    },

    /** Records the session id the moment the transport reports one. */
    noteSession(jobId: string, sessionId: string) {
      const job = findJob(jobId);
      if (!job || !sessionId) return;
      void attachResumableSession(job.ownerId, job.kind, job.scopeId, sessionId);
    },

    pause(jobId: string) {
      const job = findJob(jobId);
      if (!job || !canPause(job)) return;
      if (job.status === "queued") {
        hold(job, "paused", PAUSED_MESSAGE);
        notify();
        return;
      }
      job.pauseRequested = true;
      job.controller?.abort();
      notify();
    },

    /**
     * Whether this draft's next Submit must run inside its form. Set when a
     * background attempt failed on something only the form can resolve.
     */
    isForegroundRequired(kind: FormDraftKind, scopeId?: string): boolean {
      return foreground.has(draftKeyFor(kind, scopeId));
    },

    /** Called once the form has taken the decision back on. */
    clearForegroundRequirement(kind: FormDraftKind, scopeId?: string) {
      foreground.delete(draftKeyFor(kind, scopeId));
    },

    resume(jobId: string) {
      const job = findJob(jobId);
      if (!job || (job.status !== "paused" && job.status !== "attention")) return;
      // Retrying from the bar would hit the same unresolved conflict.
      if (foreground.has(draftKeyFor(job.kind, job.scopeId))) return;
      held = held.filter((item) => item !== job);
      Object.assign(job, {
        status: "queued" as const,
        message: undefined,
        pauseRequested: false,
        percent: 0,
      });
      queue.push(job);
      startNext();
    },

    /** Abandons an upload for good and clears its resume record. */
    stop(jobId: string) {
      const job = findJob(jobId);
      if (!job) return;
      drop(job);
      void forgetResumableUpload(job.ownerId, job.kind, job.scopeId);
      foreground.delete(draftKeyFor(job.kind, job.scopeId));
      addNotice(job, "attention", "Upload stopped", STOPPED_MESSAGE);
      startNext();
    },

    dismissNotice(noticeId: string) {
      const next = notices.filter((item) => item.id !== noticeId);
      if (next.length === notices.length) return;
      notices = next;
      notify();
    },

    /**
     * Whether a draft is in the line. Its form must not be reopened and its
     * stored copy must not be replaced or deleted while its photographs are
     * still being transferred.
     */
    entryForDraft,

    isDraftBusy(kind: FormDraftKind, scopeId?: string): boolean {
      const entry = entryForDraft(kind, scopeId);
      return Boolean(entry && (entry.status === "queued" || entry.status === "uploading"));
    },

    /** Test seam. Leaves durable records alone; callers reset those separately. */
    resetForTests() {
      generation += 1;
      for (const job of [active, ...queue, ...held].filter((job): job is Job => Boolean(job))) {
        job.controller?.abort();
      }
      active = null;
      queue = [];
      held = [];
      notices = [];
      foreground.clear();
      sequence = 0;
      ownerId = null;
      snapshot = EMPTY;
      if (typeof window !== "undefined" && unloadGuardInstalled) {
        window.removeEventListener("beforeunload", warnBeforeUnload);
        unloadGuardInstalled = false;
      }
    },
  };
}

export type BackgroundUploadManager = ReturnType<typeof createBackgroundUploadManager>;

/** One line per browser tab. */
export const backgroundUploads: BackgroundUploadManager = createBackgroundUploadManager();
