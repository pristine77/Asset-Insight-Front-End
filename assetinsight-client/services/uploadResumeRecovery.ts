import { loadScopedDraft } from "@/components/forms/drafts/storage";
import { AssetService } from "./asset";
import { createLotListing } from "./lotListing";
import type { BackgroundUploadRequest } from "./backgroundUploadManager";
import type { UploadResumeRecord } from "./uploadResumeStore";
import {
  describeOrderedFiles,
  orderedSubmissionFiles,
  submissionFilesFromLots,
  submissionFilesMatchManifest,
  type SubmissionLotMedia,
} from "./uploadJobFiles";

/**
 * Turning an interrupted upload back into a runnable one.
 *
 * A closed tab ends the transfer but not the submission. The session id and the
 * frozen details are in `uploadResumeStore`, the photographs are still in the
 * drafts database, and whatever reached R2 is still there. Replaying the same
 * `client_submission_id` therefore resumes that session: the backend coalesces
 * onto the existing report and re-issues upload targets, and the transport
 * skips each already-stored object through its authenticated HEAD check rather
 * than sending the bytes again.
 *
 * Every refusal below is deliberate. Submitting a *different* manifest under an
 * identity the server already holds photographs for is the one outcome that
 * cannot be undone from the browser, so anything unverifiable stops and asks.
 */

export type ResumeOutcome =
  | { status: "ready"; request: BackgroundUploadRequest }
  /** The draft was discarded or belongs to another account. */
  | { status: "draft-missing" }
  /** The draft is there but some photographs are no longer in local storage. */
  | { status: "media-missing"; missing: number }
  /** The draft changed after the upload began. */
  | { status: "changed"; reason: "count" | "identity" }
  | { status: "error"; message: string };

type DraftWithLots = { lots?: SubmissionLotMedia[] };

export async function prepareResumeFromRecord(
  record: UploadResumeRecord
): Promise<ResumeOutcome> {
  let loaded: Awaited<ReturnType<typeof loadScopedDraft<never>>> | null = null;
  try {
    loaded = await loadScopedDraft(record.ownerId, record.kind, record.scopeId);
  } catch {
    // A draft that cannot be read is not a draft we may submit from.
    return { status: "draft-missing" };
  }
  if (!loaded) return { status: "draft-missing" };
  if (loaded.missingMediaCount > 0) {
    return { status: "media-missing", missing: loaded.missingMediaCount };
  }

  const lots = (loaded.envelope as DraftWithLots).lots;
  if (!Array.isArray(lots) || lots.length === 0) return { status: "draft-missing" };

  const ordered = orderedSubmissionFiles(record.kind, lots);
  const match = submissionFilesMatchManifest(describeOrderedFiles(ordered), record.files);
  if (!match.matches) return { status: "changed", reason: match.reason };

  return {
    status: "ready",
    request: {
      ownerId: record.ownerId,
      kind: record.kind,
      scopeId: record.scopeId,
      endpoint: record.endpoint,
      title: record.title,
      totalFiles: record.totalFiles,
      clientSubmissionId: record.clientSubmissionId,
      // Replayed verbatim: the session was admitted against this exact payload.
      details: record.details,
      files: record.files,
      // The record is already durable; re-recording it would reset its progress.
      skipPersist: true,
      upload: (onProgress, signal) => {
        if (record.kind === "lot-listing") {
          return createLotListing(record.details, lots, {
            onUploadProgress: onProgress,
            signal,
          });
        }
        const { images, videos } = submissionFilesFromLots(lots);
        return AssetService.create(record.details as never, images, videos, {
          onUploadProgress: onProgress,
          signal,
        });
      },
    },
  };
}

/** Wording for the recovery prompt, so the bar and the Drafts list agree. */
export function describeResumeOutcome(outcome: ResumeOutcome): string | null {
  switch (outcome.status) {
    case "ready":
      return null;
    case "draft-missing":
      return "This upload cannot be resumed because its saved draft is no longer on this device. Check Reports before creating it again — the earlier upload may already have been accepted.";
    case "media-missing":
      return outcome.missing === 1
        ? "This upload cannot be resumed because 1 photo is no longer stored on this device. Check Reports before creating it again."
        : `This upload cannot be resumed because ${outcome.missing} photos are no longer stored on this device. Check Reports before creating it again.`;
    case "changed":
      return "This draft changed after its upload began, so it cannot continue under the same submission. Check Reports for the earlier upload before submitting the current version.";
    default:
      return outcome.message;
  }
}
