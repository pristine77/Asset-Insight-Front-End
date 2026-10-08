import { beforeEach, describe, expect, it, vi } from "vitest";

const drafts = vi.hoisted(() => ({ loadScopedDraft: vi.fn() }));
vi.mock("@/components/forms/drafts/storage", () => drafts);

const asset = vi.hoisted(() => ({
  AssetService: {
    create: vi.fn(async (...args: unknown[]) => ({ reportId: "r1", args })),
  },
}));
vi.mock("./asset", () => asset);

const lotListing = vi.hoisted(() => ({
  createLotListing: vi.fn(async (...args: unknown[]) => ({ reportId: "r2", args })),
}));
vi.mock("./lotListing", () => lotListing);

import { describeResumeOutcome, prepareResumeFromRecord } from "./uploadResumeRecovery";
import { describeOrderedFiles, orderedSubmissionFiles } from "./uploadJobFiles";
import type { UploadResumeRecord } from "./uploadResumeStore";

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: "image/jpeg", lastModified: 1700000000000 });

const lots = () => [
  { files: [file("a1.jpg"), file("a2.jpg")], extraFiles: [file("a-extra.jpg")], videoFiles: [file("a.mp4")] },
  { files: [file("b1.jpg")], extraFiles: [], videoFiles: [] },
];

function record(overrides: Partial<UploadResumeRecord> = {}): UploadResumeRecord {
  const kind = overrides.kind || "asset";
  return {
    version: 1,
    key: "owner-1:asset:scope-1",
    ownerId: "owner-1",
    kind,
    scopeId: "scope-1",
    endpoint: kind === "asset" ? "/asset" : "/lot-listing",
    details: { contract_no: "CN-1001", client_submission_id: "submission-1" },
    files: describeOrderedFiles(orderedSubmissionFiles(kind, lots())),
    clientSubmissionId: "submission-1",
    sessionId: "session-1",
    title: "CN-1001",
    totalFiles: 5,
    uploadedFiles: 3,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  drafts.loadScopedDraft.mockResolvedValue({ envelope: { lots: lots() }, missingMediaCount: 0 });
});

describe("prepareResumeFromRecord", () => {
  it("rebuilds a runnable request when the saved draft still matches", async () => {
    const outcome = await prepareResumeFromRecord(record());

    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.request).toMatchObject({
      ownerId: "owner-1",
      kind: "asset",
      scopeId: "scope-1",
      clientSubmissionId: "submission-1",
      // The record is already durable; re-recording would reset its progress.
      skipPersist: true,
    });
    // The payload must be replayed verbatim, not rebuilt from the draft.
    expect(outcome.request.details).toEqual(record().details);
  });

  it("replays an Asset upload through the Asset service", async () => {
    const outcome = await prepareResumeFromRecord(record());
    if (outcome.status !== "ready") throw new Error("expected ready");

    await outcome.request.upload(() => {}, new AbortController().signal);

    expect(asset.AssetService.create).toHaveBeenCalledTimes(1);
    const [, images, videos] = asset.AssetService.create.mock.calls[0];
    expect((images as File[]).map((item) => item.name)).toEqual([
      "a1.jpg",
      "a2.jpg",
      "a-extra.jpg",
      "b1.jpg",
    ]);
    expect((videos as File[]).map((item) => item.name)).toEqual(["a.mp4"]);
  });

  it("replays a Lot Listing upload through its own service, keeping lot order", async () => {
    const outcome = await prepareResumeFromRecord(record({ kind: "lot-listing" }));
    if (outcome.status !== "ready") throw new Error("expected ready");

    await outcome.request.upload(() => {}, new AbortController().signal);

    expect(lotListing.createLotListing).toHaveBeenCalledTimes(1);
    expect(asset.AssetService.create).not.toHaveBeenCalled();
  });

  it("refuses when the draft is gone", async () => {
    drafts.loadScopedDraft.mockResolvedValue(null);
    expect(await prepareResumeFromRecord(record())).toEqual({ status: "draft-missing" });
  });

  it("refuses when the draft cannot be read at all", async () => {
    drafts.loadScopedDraft.mockRejectedValue(new Error("corrupt"));
    expect(await prepareResumeFromRecord(record())).toEqual({ status: "draft-missing" });
  });

  it("refuses when photographs are no longer stored locally", async () => {
    drafts.loadScopedDraft.mockResolvedValue({ envelope: { lots: lots() }, missingMediaCount: 2 });
    expect(await prepareResumeFromRecord(record())).toEqual({ status: "media-missing", missing: 2 });
  });

  it("refuses a draft that gained a photo after the upload began", async () => {
    const changed = lots();
    changed[1].files.push(file("b2.jpg"));
    drafts.loadScopedDraft.mockResolvedValue({ envelope: { lots: changed }, missingMediaCount: 0 });

    expect(await prepareResumeFromRecord(record())).toEqual({ status: "changed", reason: "count" });
  });

  it("refuses a draft whose photo was replaced under the same name", async () => {
    const changed = lots();
    changed[0].files[0] = file("a1.jpg", 999);
    drafts.loadScopedDraft.mockResolvedValue({ envelope: { lots: changed }, missingMediaCount: 0 });

    expect(await prepareResumeFromRecord(record())).toEqual({
      status: "changed",
      reason: "identity",
    });
  });

  it("does not call a report service for any refusal", async () => {
    drafts.loadScopedDraft.mockResolvedValue(null);
    await prepareResumeFromRecord(record());

    expect(asset.AssetService.create).not.toHaveBeenCalled();
    expect(lotListing.createLotListing).not.toHaveBeenCalled();
  });
});

describe("describeResumeOutcome", () => {
  it("says nothing when the upload can simply continue", () => {
    expect(describeResumeOutcome({ status: "ready" } as never)).toBeNull();
  });

  it("points every refusal at Reports rather than at submitting again", () => {
    for (const outcome of [
      { status: "draft-missing" } as const,
      { status: "media-missing", missing: 2 } as const,
      { status: "changed", reason: "identity" } as const,
    ]) {
      expect(describeResumeOutcome(outcome)).toContain("Reports");
    }
  });

  it("counts missing photos with matching agreement", () => {
    expect(describeResumeOutcome({ status: "media-missing", missing: 1 })).toContain(
      "1 photo is no longer stored"
    );
    expect(describeResumeOutcome({ status: "media-missing", missing: 3 })).toContain(
      "3 photos are no longer stored"
    );
  });
});
