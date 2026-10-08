"use client";

import { useCallback, useEffect, useState } from "react";
import {
  backgroundUploads,
  describeBackgroundUpload,
  type BackgroundUploadEntry,
} from "@/services/backgroundUploadManager";
import {
  describeResumeOutcome,
  prepareResumeFromRecord,
} from "@/services/uploadResumeRecovery";
import {
  forgetResumableUpload,
  listResumableUploads,
  type UploadResumeRecord,
} from "@/services/uploadResumeStore";
import { useBackgroundUploads } from "./useBackgroundUploads";

/**
 * The upload line, shown above every Listings page.
 *
 * Submit closes its form and the transfer continues here, so this bar is the
 * only place that knows work is outstanding. It also surfaces uploads this
 * browser was carrying when the tab was closed: those are offered as an
 * explicit "Finish upload", never resumed automatically, because an attempt
 * that was cut off may already have been accepted by the server.
 */

const ACTION_CLASS =
  "inline-flex min-h-8 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-ring)] disabled:cursor-not-allowed disabled:opacity-45";

function ProgressTrack({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-panel-alt)]"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ActiveRow({ entry }: { entry: BackgroundUploadEntry }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--app-text)]">{entry.title}</p>
          <p className="text-xs text-[var(--app-text-muted)]">{describeBackgroundUpload(entry)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className={ACTION_CLASS}
            disabled={!entry.canPause}
            onClick={() => backgroundUploads.pause(entry.id)}
          >
            Pause
          </button>
          <button
            type="button"
            className={ACTION_CLASS}
            disabled={!entry.canPause}
            onClick={() => backgroundUploads.stop(entry.id)}
          >
            Stop
          </button>
        </div>
      </div>
      <ProgressTrack percent={entry.percent} label={`Upload progress for ${entry.title}`} />
      {entry.finalizing ? (
        <p className="text-xs text-[var(--app-text-muted)]">
          This submission has been accepted and can no longer be stopped.
        </p>
      ) : null}
    </div>
  );
}

function HeldRow({ entry }: { entry: BackgroundUploadEntry }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--app-text)]">{entry.title}</p>
        <p className="text-xs text-[var(--app-text-muted)]">
          {entry.message || describeBackgroundUpload(entry)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {/* A conflict the form must resolve would fail identically from here. */}
        {entry.needsForm ? null : (
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => backgroundUploads.resume(entry.id)}
          >
            Resume
          </button>
        )}
        <button
          type="button"
          className={ACTION_CLASS}
          onClick={() => backgroundUploads.stop(entry.id)}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/** An upload this browser was carrying when its tab closed. */
function ResumableRow({
  record,
  onDone,
}: {
  record: UploadResumeRecord;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const finish = useCallback(async () => {
    setBusy(true);
    setRefusal(null);
    try {
      const outcome = await prepareResumeFromRecord(record);
      if (outcome.status === "ready") {
        backgroundUploads.enqueue(outcome.request);
        onDone();
        return;
      }
      setRefusal(describeResumeOutcome(outcome));
    } catch {
      setRefusal("This upload could not be checked. Open Reports before submitting it again.");
    } finally {
      setBusy(false);
    }
  }, [record, onDone]);

  const discard = useCallback(async () => {
    await forgetResumableUpload(record.ownerId, record.kind, record.scopeId);
    onDone();
  }, [record, onDone]);

  const done = Math.min(record.uploadedFiles, record.totalFiles);
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--app-border)] pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--app-text)]">{record.title}</p>
          <p className="text-xs text-[var(--app-text-muted)]">
            {record.totalFiles > 0
              ? `Interrupted after ${done} of ${record.totalFiles} files. Your photos are saved.`
              : "Interrupted before it finished. Your photos are saved."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={ACTION_CLASS} disabled={busy} onClick={() => void finish()}>
            {busy ? "Checking…" : "Finish upload"}
          </button>
          <button type="button" className={ACTION_CLASS} disabled={busy} onClick={() => void discard()}>
            Discard
          </button>
        </div>
      </div>
      {refusal ? (
        <p className="text-xs text-[var(--app-danger)]" role="alert">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

export function UploadBar({ ownerId }: { ownerId: string }) {
  const { active, queued, held, notices } = useBackgroundUploads();
  const [resumable, setResumable] = useState<UploadResumeRecord[]>([]);

  const refreshResumable = useCallback(() => {
    let cancelled = false;
    void listResumableUploads(ownerId)
      .then((rows) => {
        if (cancelled) return;
        // A record whose upload is already running again is not an offer.
        setResumable(
          rows.filter((row) => !backgroundUploads.entryForDraft(row.kind, row.scopeId))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  useEffect(() => refreshResumable(), [refreshResumable]);

  // An accepted or discarded upload clears its offer without a page reload.
  useEffect(() => backgroundUploads.onAccepted(() => refreshResumable()), [refreshResumable]);

  useEffect(() => {
    const sent = notices.filter((notice) => notice.autoDismiss);
    if (!sent.length) return;
    const timer = window.setTimeout(() => {
      for (const notice of sent) backgroundUploads.dismissNotice(notice.id);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [notices]);

  if (!active && !queued.length && !held.length && !notices.length && !resumable.length) {
    return null;
  }

  return (
    <section
      className="sticky bottom-0 z-30 mx-auto w-full max-w-5xl rounded-t-xl border border-b-0 border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-lg sm:p-4"
      aria-label="Report uploads"
    >
      <div className="flex flex-col gap-2" role="status" aria-live="polite">
        {active ? <ActiveRow entry={active} /> : null}
        {queued.length ? (
          <p className="text-xs text-[var(--app-text-muted)]">
            {queued.length} more {queued.length === 1 ? "report is" : "reports are"} waiting in line.
          </p>
        ) : null}
        {held.map((entry) => (
          <HeldRow key={entry.id} entry={entry} />
        ))}
        {resumable.map((record) => (
          <ResumableRow key={record.key} record={record} onDone={refreshResumable} />
        ))}
      </div>
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="mt-2 flex flex-wrap items-start justify-between gap-2 border-t border-[var(--app-border)] pt-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--app-text)]">
              {notice.heading} · {notice.title}
            </p>
            <p className="text-xs text-[var(--app-text-muted)]">{notice.message}</p>
          </div>
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => backgroundUploads.dismissNotice(notice.id)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}

export default UploadBar;
