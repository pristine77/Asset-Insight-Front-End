import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FormDraftKind } from "@/components/forms/drafts/storage";
import type { SubmissionFileDescriptor } from "./uploadJobFiles";

/**
 * Durable record of one in-flight report upload, so closing the tab costs the
 * remaining files rather than the whole submission.
 *
 * This store deliberately holds no file bytes. The draft media already lives in
 * the drafts database, and `loadScopedDraft` rehydrates real File objects from
 * it; this record only carries the identities needed to resume *that same*
 * upload session: the stable client submission id, the session id once the
 * server has issued one, and the exact details payload that was accepted with
 * it. Re-sending a different payload under the same submission id is what the
 * backend answers with SUBMISSION_MANIFEST_CHANGED, so the payload is frozen
 * here at hand-off and replayed verbatim.
 *
 * It is a separate database from the drafts store on purpose: adding an object
 * store there would mean a schema upgrade on a database that already holds the
 * appraiser's unsent photographs.
 */

export const UPLOAD_RESUME_VERSION = 1 as const;

export type UploadResumeRecord = {
  version: typeof UPLOAD_RESUME_VERSION;
  /** Composite key; see resumeKey(). */
  key: string;
  ownerId: string;
  kind: FormDraftKind;
  /** Draft scope that owns the media, passed back to loadScopedDraft(). */
  scopeId?: string;
  endpoint: "/asset" | "/lot-listing";
  /** Frozen at hand-off: the exact payload the session was created with. */
  details: Record<string, unknown>;
  /** Stable submission identity. The backend coalesces an exact retry onto it. */
  clientSubmissionId: string;
  /** Known only after the server issues it; absent if the tab closed first. */
  sessionId?: string;
  /**
   * The manifest's media identities, in submission order, frozen at hand-off.
   * Resume compares the rehydrated draft against this and refuses on any
   * difference rather than submitting other media under an accepted identity.
   */
  files: SubmissionFileDescriptor[];
  /** Contract number or client name, for the recovery prompt. */
  title: string;
  totalFiles: number;
  /** Best-effort progress when the record was last written. Display only. */
  uploadedFiles: number;
  savedAt: string;
};

interface ResumeDatabase extends DBSchema {
  resumable: {
    key: string;
    value: UploadResumeRecord;
    indexes: { "by-owner": string };
  };
}

const DATABASE_NAME = "cv-upload-resume";
let databasePromise: Promise<IDBPDatabase<ResumeDatabase>> | null = null;

function available() {
  return typeof indexedDB !== "undefined";
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<ResumeDatabase>(DATABASE_NAME, UPLOAD_RESUME_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("resumable")) {
          const store = database.createObjectStore("resumable", { keyPath: "key" });
          store.createIndex("by-owner", "ownerId");
        }
      },
    });
  }
  return databasePromise;
}

export function resumeKey(ownerId: string, kind: FormDraftKind, scopeId?: string) {
  return `${ownerId}:${kind}:${scopeId || "default"}`;
}

/**
 * Writes or replaces the record for one upload. Storage failures are swallowed:
 * losing the ability to resume must never fail the upload that is running.
 */
export async function rememberResumableUpload(
  record: Omit<UploadResumeRecord, "version" | "key" | "savedAt">
): Promise<void> {
  if (!available()) return;
  try {
    const database = await getDatabase();
    await database.put("resumable", {
      ...record,
      version: UPLOAD_RESUME_VERSION,
      key: resumeKey(record.ownerId, record.kind, record.scopeId),
      savedAt: new Date().toISOString(),
    });
  } catch {
    /* A browser without durable storage still uploads; it just cannot resume. */
  }
}

/**
 * Records the session id as soon as the server issues one, leaving the rest of
 * the frozen record untouched. A missing record is not recreated here: the
 * upload may have been accepted or stopped between the two writes.
 */
export async function attachResumableSession(
  ownerId: string,
  kind: FormDraftKind,
  scopeId: string | undefined,
  sessionId: string
): Promise<void> {
  if (!available()) return;
  try {
    const database = await getDatabase();
    const key = resumeKey(ownerId, kind, scopeId);
    const existing = await database.get("resumable", key);
    if (!existing) return;
    await database.put("resumable", { ...existing, sessionId, savedAt: new Date().toISOString() });
  } catch {
    /* See rememberResumableUpload. */
  }
}

/** Display-only progress, so a recovery prompt can say how far it had got. */
export async function recordResumableProgress(
  ownerId: string,
  kind: FormDraftKind,
  scopeId: string | undefined,
  uploadedFiles: number
): Promise<void> {
  if (!available()) return;
  try {
    const database = await getDatabase();
    const key = resumeKey(ownerId, kind, scopeId);
    const existing = await database.get("resumable", key);
    if (!existing || existing.uploadedFiles === uploadedFiles) return;
    await database.put("resumable", { ...existing, uploadedFiles });
  } catch {
    /* See rememberResumableUpload. */
  }
}

/**
 * Every resumable upload for the signed-in account, newest first. Records
 * belonging to another account are never returned, so a shared browser cannot
 * offer one appraiser another's unfinished work.
 */
export async function listResumableUploads(ownerId: string): Promise<UploadResumeRecord[]> {
  if (!available() || !ownerId) return [];
  try {
    const database = await getDatabase();
    const rows = await database.getAllFromIndex("resumable", "by-owner", ownerId);
    return rows
      .filter((row) => row.version === UPLOAD_RESUME_VERSION)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch {
    return [];
  }
}

/**
 * Removes the record once its upload is accepted, explicitly discarded, or its
 * draft is gone. Acceptance must call this: a stale record would invite a
 * resume that the backend answers with an already-accepted receipt.
 */
export async function forgetResumableUpload(
  ownerId: string,
  kind: FormDraftKind,
  scopeId?: string
): Promise<void> {
  if (!available()) return;
  try {
    const database = await getDatabase();
    await database.delete("resumable", resumeKey(ownerId, kind, scopeId));
  } catch {
    /* See rememberResumableUpload. */
  }
}

/** Clears one account's records on sign-out or an account switch. */
export async function forgetOwnerResumableUploads(ownerId: string): Promise<void> {
  if (!available() || !ownerId) return;
  try {
    const database = await getDatabase();
    const tx = database.transaction("resumable", "readwrite");
    const keys = await tx.store.index("by-owner").getAllKeys(ownerId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
  } catch {
    /* See rememberResumableUpload. */
  }
}

/** Test seam: the module-level connection would otherwise outlive a fake IDB. */
export function resetUploadResumeStoreForTests() {
  databasePromise = null;
}
