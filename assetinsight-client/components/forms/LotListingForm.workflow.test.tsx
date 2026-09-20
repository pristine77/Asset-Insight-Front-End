import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctioneerWorkItemSetup } from "@/services/auctioneer";
import type { ReportDraftRecord } from "@/services/reportDrafts";
import LotListingForm from "./LotListingForm";
import type { MixedLot } from "./mixed/types";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  deleteByClientId: vi.fn(),
  deleteScopedDraft: vi.fn(),
  deleteSmartUploadDraft: vi.fn(),
  getCurrentPosition: vi.fn(),
  hasScopedDraft: vi.fn(),
  loadScopedDraft: vi.fn(),
  push: vi.fn(),
  requestDurableDraftStorage: vi.fn(),
  reverseGeocode: vi.fn(),
  restoreLots: vi.fn(),
  toastWarning: vi.fn(),
  upsertWithMedia: vi.fn(),
  uploadReportFilesDirectToR2: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  let dynamicComponentIndex = 0;

  return {
    default: () => {
      dynamicComponentIndex += 1;
      if (dynamicComponentIndex === 1) {
        return function MockMixedSection({
          value,
          onChange,
          lockLotStructure,
        }: {
          value: MixedLot[];
          onChange: (lots: MixedLot[]) => void;
          lockLotStructure?: boolean;
        }) {
          return React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "output",
              { "data-testid": "test-lot-count" },
              String(value.length)
            ),
            React.createElement(
              "output",
              { "data-testid": "selected-listing-media" },
              value[0]?.files[0]?.name || "No media selected"
            ),
            React.createElement(
              "output",
              { "data-testid": "listing-source-locks" },
              JSON.stringify({
                lockLotStructure: Boolean(lockLotStructure),
                sources: value.map((lot) => lot.source),
              })
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () =>
                  onChange((value.length ? value : [{
                    id: "test-lot-1",
                    files: [],
                    extraFiles: [],
                    coverIndex: 0,
                  }]).map((lot) => ({
                      ...lot,
                      files: [
                        new File(["photo"], "lot-photo.jpg", {
                          type: "image/jpeg",
                          lastModified: 123,
                        }),
                      ],
                      extraFiles: [],
                      videoFiles: [],
                      coverIndex: 0,
                      mode: "single_lot",
                    }))),
              },
              "Add test media"
            )
          );
        };
      }

      return function MockSmartUploadWorkspace() {
        return null;
      };
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: { _id: "user-1", username: "Test Appraiser" },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/lib/api", () => ({
  default: { post: mocks.apiPost },
}));

vi.mock("@/services/directUpload", () => ({
  isUploadSessionUnsupportedError: (error: unknown) =>
    (error as { code?: string } | null)?.code ===
    "UPLOAD_SESSION_UNSUPPORTED",
  uploadReportFilesDirectToR2: mocks.uploadReportFilesDirectToR2,
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: { reverseGeocode: mocks.reverseGeocode },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    deleteByClientId: mocks.deleteByClientId,
    restoreLots: mocks.restoreLots,
    upsertWithMedia: mocks.upsertWithMedia,
  },
  createReportDraftClientId: () => "lot-listing-draft-1",
  getDuplicateLotWarning: () => null,
  getReportDraftDeviceId: () => "device-1",
}));

vi.mock("./drafts/storage", () => {
  class DraftEnvelopeError extends Error {
    code = "corrupt";
  }
  class DraftPersistenceError extends Error {}

  return {
    DraftEnvelopeError,
    DraftPersistenceError,
    FORM_DRAFT_VERSION: 3,
    recordBrowserObservation: vi.fn(async () => undefined),
    deleteScopedDraft: mocks.deleteScopedDraft,
    getScopedDraftKey: () => "lot-listing-draft-key",
    hasScopedDraft: mocks.hasScopedDraft,
    loadScopedDraft: mocks.loadScopedDraft,
    parseScopedDraftEnvelope: vi.fn(),
    requestDurableDraftStorage: mocks.requestDurableDraftStorage,
    saveScopedDraft: vi.fn(),
  };
});

vi.mock("./smartUpload/storage", () => ({
  deleteSmartUploadDraft: mocks.deleteSmartUploadDraft,
}));

const detectedPosition = {
  coords: {
    latitude: 50.1234567,
    longitude: -104.7654321,
    accuracy: 7.4,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: 1,
  toJSON: () => ({}),
} as GeolocationPosition;

const RESOLVED_LOT_LOCATION = "123 Test Yard Road, Regina, SK, Canada";
const OPENSTREETMAP_COPYRIGHT_URL =
  "https://www.openstreetmap.org/copyright";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function addValidListing() {
  fireEvent.change(
    screen.getByRole("textbox", { name: /contract number/i }),
    { target: { value: "LOT-TEST-1" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
}

function makeAuctioneerSetup(
  kind: AuctioneerWorkItemSetup["kind"] = "unknown"
): AuctioneerWorkItemSetup {
  return {
    workItemId: "listing-work-imported",
    cycleKey: "listing-cycle-imported",
    kind,
    reportType: "lotListing",
    clientSubmissionId: "listing-imported-submission",
    status: "claimed",
    contract: {
      id: "imported-contract",
      contractNo: "IMPORTED-100",
      customerName: "Imported customer",
      eventTitle: "Imported auction",
      eventDate: "2026-09-14T10:00:00.000Z",
      location: "Imported inspection yard",
    },
    lots: kind === "scheduleA" ? [
      { sourceKey: "source-1", lotId: "upstream-lot-1", submissionId: "task-1", lotNumber: "10" },
      { sourceKey: "source-2", lotId: "upstream-lot-2", submissionId: "task-2", lotNumber: "11" },
    ] : [],
  };
}

async function waitForResolvedLotLocation() {
  const location = screen.getByRole("textbox", {
    name: /current inspection location/i,
  });
  await waitFor(() => expect(location).toHaveValue(RESOLVED_LOT_LOCATION));
  return location;
}

function makeLotResumeDraft(): ReportDraftRecord {
  return {
    _id: "lot-resume-id",
    user: "user-1",
    clientDraftId: "lot-resume-draft",
    type: "lotListing",
    storageMode: "r2_media",
    revision: 3,
    contractNo: "LOT-RESTORE-1",
    formData: {
      location: "Lat 50.123457 / Long -104.765432",
      latitude: detectedPosition.coords.latitude,
      longitude: detectedPosition.coords.longitude,
      currency: "CAD",
    },
    lots: [],
    media: [],
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}

describe("LotListingForm explicit save and upload workflow", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.apiPost.mockReset();
    mocks.deleteByClientId.mockReset().mockResolvedValue(undefined);
    mocks.deleteScopedDraft.mockReset().mockResolvedValue(undefined);
    mocks.deleteSmartUploadDraft.mockReset().mockResolvedValue(undefined);
    mocks.getCurrentPosition.mockReset().mockImplementation((success) => {
      success(detectedPosition);
    });
    mocks.hasScopedDraft.mockReset().mockResolvedValue(false);
    mocks.loadScopedDraft.mockReset().mockResolvedValue(null);
    mocks.push.mockReset();
    mocks.requestDurableDraftStorage.mockReset().mockResolvedValue(undefined);
    mocks.reverseGeocode.mockReset().mockResolvedValue({
      location: RESOLVED_LOT_LOCATION,
      currency: "CAD",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
      source: "nominatim",
    });
    mocks.restoreLots.mockReset().mockResolvedValue([]);
    mocks.toastWarning.mockReset();
    mocks.upsertWithMedia.mockReset();
    mocks.uploadReportFilesDirectToR2.mockReset();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.getCurrentPosition },
    });
    window.localStorage.clear();
  });

  it.each(["unknown", "scheduleA"] as const)(
    "continues an imported %s listing once after acceptance and old-draft cleanup",
    async (kind) => {
      const upload = deferred<Record<string, unknown>>();
      const cleanup = deferred<void>();
      const onAcceptedAndContinue = vi.fn();
      const onSuccess = vi.fn();
      const auctioneer = makeAuctioneerSetup(kind);
      mocks.uploadReportFilesDirectToR2.mockReturnValueOnce(upload.promise);
      mocks.deleteByClientId.mockReturnValueOnce(cleanup.promise);
      render(<LotListingForm auctioneer={auctioneer} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
      fireEvent.click(screen.getByRole("button", { name: "Add test media" }));

      const sources = JSON.parse(screen.getByTestId("listing-source-locks").textContent || "{}");
      expect(sources.lockLotStructure).toBe(kind === "scheduleA");
      if (kind === "scheduleA") {
        expect(sources.sources.map((source: { locked: boolean }) => source.locked)).toEqual([true, true]);
      }
      fireEvent.click(screen.getByRole("button", { name: "Generate files & new lot" }));
      await waitFor(() => expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce());
      expect(onAcceptedAndContinue).not.toHaveBeenCalled();
      expect(mocks.deleteByClientId).not.toHaveBeenCalled();
      const details = mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
      expect(details).toMatchObject({
        auctioneer_work_item_id: auctioneer.workItemId,
        client_submission_id: auctioneer.clientSubmissionId,
        contract_no: auctioneer.contract.contractNo,
      });
      if (kind === "scheduleA") {
        expect(details.mixed_lots).toEqual(auctioneer.lots.map((lot) => expect.objectContaining({
          source_key: lot.sourceKey,
          source_lot_id: lot.lotId,
          source_submission_id: lot.submissionId,
          mode: "single_lot",
        })));
      }

      await act(async () => upload.resolve({ reportId: "accepted-listing-report", status: "processing" }));
      await waitFor(() => expect(mocks.deleteByClientId).toHaveBeenCalledExactlyOnceWith(auctioneer.clientSubmissionId, "lot-listing"));
      expect(onAcceptedAndContinue).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      await act(async () => cleanup.resolve());

      await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-listing-report"));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce();
      expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("No media selected");
    }
  );

  it("preserves imported media and submission identity when the new-lot upload fails and is retried", async () => {
    const onAcceptedAndContinue = vi.fn();
    const onSuccess = vi.fn();
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({ reportId: "accepted-after-retry" });
    render(<LotListingForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate files & new lot" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Generate files & new lot" })).toBeEnabled());
    expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg");
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue("IMPORTED-100");
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    expect(onAcceptedAndContinue).not.toHaveBeenCalled();
    const original = mocks.uploadReportFilesDirectToR2.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Generate files & new lot" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-after-retry"));
    expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(2);
    expect(mocks.uploadReportFilesDirectToR2.mock.calls[1][0].details.client_submission_id).toBe(original.details.client_submission_id);
    expect(mocks.uploadReportFilesDirectToR2.mock.calls[1][0].files).toEqual(original.files);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it.each(["continue", "normal", "save"] as const)(
    "keeps rapid new-lot, normal-submit, and save clicks in the first %s intent",
    async (first) => {
      const pending = deferred<Record<string, unknown>>();
      const onAcceptedAndContinue = vi.fn();
      const onSuccess = vi.fn();
      mocks.uploadReportFilesDirectToR2.mockReturnValue(pending.promise);
      mocks.upsertWithMedia.mockReturnValue(pending.promise);
      render(<LotListingForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
      fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
      const actions = {
        continue: screen.getByRole("button", { name: "Generate files & new lot" }),
        normal: screen.getByRole("button", { name: "Create Lot Listing" }),
        save: screen.getAllByRole("button", { name: "Save Draft" })[0],
      };
      act(() => {
        actions[first].click();
        actions.continue.click();
        actions.normal.click();
        actions.save.click();
      });

      if (first === "save") {
        await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
        expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce());
        expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
      }
      await act(async () => pending.resolve({ _id: "saved-draft", media: [], reportId: "accepted-single-flight" }));
      if (first === "continue") {
        await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-single-flight"));
        expect(onSuccess).not.toHaveBeenCalled();
      } else if (first === "normal") {
        await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
        expect(onAcceptedAndContinue).not.toHaveBeenCalled();
      } else {
        expect(onAcceptedAndContinue).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
      }
    }
  );

  it("continues accepted imported work even when old-draft cleanup fails", async () => {
    const onAcceptedAndContinue = vi.fn();
    const onSuccess = vi.fn();
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({ reportId: "accepted-cleanup-failure" });
    mocks.deleteScopedDraft.mockRejectedValueOnce(new Error("Local storage unavailable"));
    render(<LotListingForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate files & new lot" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-cleanup-failure"));
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce();
  });

  it("shows no new-lot action without both an imported contract and continuation callback", () => {
    const view = render(<LotListingForm onAcceptedAndContinue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Generate files & new lot" })).not.toBeInTheDocument();
    view.rerender(<LotListingForm auctioneer={makeAuctioneerSetup()} />);
    expect(screen.queryByRole("button", { name: "Generate files & new lot" })).not.toBeInTheDocument();
  });

  it("saves and resumes a fresh successor under its own work item and submission identity", async () => {
    const previous = makeAuctioneerSetup();
    const next = { ...previous, workItemId: "listing-successor-work", clientSubmissionId: "listing-successor-submission" };
    const onSuccess = vi.fn();
    mocks.upsertWithMedia.mockResolvedValueOnce({ _id: "successor-draft", media: [] });
    const first = render(<LotListingForm auctioneer={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Save Draft" })[0]);
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Saving your draft" })).not.toBeInTheDocument());
    const [saved, lots] = mocks.upsertWithMedia.mock.calls[0];
    expect(saved).toMatchObject({
      clientDraftId: next.clientSubmissionId,
      formData: { clientSubmissionId: next.clientSubmissionId, auctioneerWorkItemId: next.workItemId },
    });
    expect(saved.clientDraftId).not.toBe(previous.clientSubmissionId);
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    first.unmount();

    const resumeDraft: ReportDraftRecord = {
      ...makeLotResumeDraft(),
      clientDraftId: saved.clientDraftId,
      contractNo: saved.contractNo,
      revision: saved.revision,
      formData: saved.formData,
      lots,
    };
    mocks.restoreLots.mockResolvedValueOnce(lots);
    mocks.deleteScopedDraft.mockClear();
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({ reportId: "successor-accepted" });
    render(<LotListingForm auctioneer={next} resumeDraft={resumeDraft} onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());

    expect(mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details).toMatchObject({
      auctioneer_work_item_id: next.workItemId,
      client_submission_id: next.clientSubmissionId,
      contract_no: previous.contract.contractNo,
    });
    expect(mocks.deleteByClientId).toHaveBeenCalledExactlyOnceWith(next.clientSubmissionId, "lot-listing");
    expect(mocks.deleteScopedDraft).toHaveBeenCalledExactlyOnceWith("user-1", "lot-listing", next.clientSubmissionId);
  });

  it("defaults new Lot Listings to no watermark and allows explicit opt-in", async () => {
    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    const watermark = screen.getByRole("checkbox", { name: /Apply watermark/i });
    expect(watermark).not.toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).not.toBeChecked();
  });

  it.each([undefined, false, true])("restores watermark choice %s without opting missing draft values in", async (watermarkImages) => {
    const draft = makeLotResumeDraft();
    draft.formData = { ...draft.formData, location: RESOLVED_LOT_LOCATION, watermarkImages };
    const onDraftStatusChange = vi.fn();
    render(<LotListingForm resumeDraft={draft} onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(onDraftStatusChange).toHaveBeenCalledWith("saved", "Draft and photos restored"));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Apply watermark/i })).toHaveProperty("checked", watermarkImages === true));
  });

  it("resets the watermark opt-in when clearing a Lot Listing", async () => {
    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    fireEvent.click(screen.getByRole("checkbox", { name: /Apply watermark/i }));
    expect(screen.getByRole("checkbox", { name: /Apply watermark/i })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Clear this lot listing?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Clear listing" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Apply watermark/i })).not.toBeChecked());
  });

  it("keeps form and media changes local until Save Draft is explicitly selected", async () => {
    vi.useFakeTimers();
    mocks.upsertWithMedia.mockImplementation(
      async (_input, _lots, onProgress) => {
        onProgress?.(100, "Draft and photos saved", {
          phase: "complete",
          percent: 100,
          message: "Draft and photos saved",
          totalFiles: 1,
          uploadedFiles: 1,
          totalBytes: 5,
          uploadedBytes: 5,
        });
        return { _id: "draft-1", media: [] };
      }
    );

    render(<LotListingForm />);
    addValidListing();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(mocks.upsertWithMedia.mock.calls[0][0].formData.watermarkImages).toBe(false);
    expect(mocks.upsertWithMedia.mock.calls[0][0].formData).not.toHaveProperty("auctioneerWorkItemId");
  });

  it("locks immediately, ignores a rapid repeated save, and cancels the original save", async () => {
    const pendingSave = deferred<Record<string, unknown>>();
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (_input, _lots, _onProgress, signal: AbortSignal) => {
        saveSignal = signal;
        signal.addEventListener(
          "abort",
          () => pendingSave.reject(new DOMException("Cancelled", "AbortError")),
          { once: true }
        );
        return pendingSave.promise;
      }
    );

    const { container } = render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    const contractInput = screen.getByRole("textbox", {
      name: /contract number/i,
    });
    const saveButton = screen.getAllByRole("button", { name: "Save Draft" })[0];
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    const saveScreen = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(saveSignal).toBeInstanceOf(AbortSignal);
    expect(saveScreen).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(saveScreen).toHaveAttribute("aria-modal", "true");
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    const hiddenFormContent = container.querySelector(
      '[aria-hidden="true"][inert]'
    );
    expect(hiddenFormContent).toBeInTheDocument();
    expect(hiddenFormContent).toContainElement(contractInput);
    expect(screen.queryByRole("textbox", { name: /contract number/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Draft save progress" })
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel save" }));

    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
    expect(screen.getByText("Draft save cancelled")).toBeInTheDocument();
  });

  it("makes rapid Save Draft then Submit one cancellable draft-save intent", async () => {
    const pendingSave = deferred<Record<string, unknown>>();
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (_input, _lots, _onProgress, signal: AbortSignal) => {
        saveSignal = signal;
        signal.addEventListener(
          "abort",
          () => pendingSave.reject(new DOMException("Cancelled", "AbortError")),
          { once: true }
        );
        return pendingSave.promise;
      }
    );

    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    const saveButton = screen.getAllByRole("button", { name: "Save Draft" })[0];
    const submitButton = screen.getByRole("button", { name: "Create Lot Listing" });
    act(() => {
      saveButton.click();
      submitButton.click();
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel save" }));
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
  });

  it("opens the real more-actions menu and wires clear to confirmation", async () => {
    render(<LotListingForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "More form actions" })
    );

    const menu = await screen.findByRole("menu");
    const clearItem = within(menu).getByRole("menuitem", {
      name: "Clear form",
    });
    expect(clearItem).toBeVisible();
    fireEvent.click(clearItem);

    expect(
      await screen.findByRole("alertdialog", {
        name: "Clear this lot listing?",
      })
    ).toBeVisible();
  });

  it("shows Stop upload, aborts the submission, and never auto-saves it", async () => {
    const pendingUpload = deferred<Record<string, unknown>>();
    mocks.uploadReportFilesDirectToR2.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        signal.addEventListener(
          "abort",
          () =>
            pendingUpload.reject(new DOMException("Stopped", "AbortError")),
          { once: true }
        );
        return pendingUpload.promise;
      }
    );

    const { container } = render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    const contractInput = screen.getByRole("textbox", {
      name: /contract number/i,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const uploadScreen = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    expect(uploadScreen).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    const hiddenFormContent = container.querySelector(
      '[aria-hidden="true"][inert]'
    );
    expect(hiddenFormContent).toBeInTheDocument();
    expect(hiddenFormContent).toContainElement(contractInput);
    expect(screen.queryByRole("textbox", { name: /contract number/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "Upload progress" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Report upload progress" })
    ).toHaveAttribute("aria-valuenow", "0");

    const uploadArguments = mocks.uploadReportFilesDirectToR2.mock.calls[0][0];
    expect(uploadArguments).toMatchObject({
      endpoint: "/lot-listing",
      details: {
        contract_no: "LOT-TEST-1",
        watermark_images: false,
        location: RESOLVED_LOT_LOCATION,
        latitude: 50.1234567,
        longitude: -104.7654321,
      },
    });
    expect(uploadArguments.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(screen.getByRole("button", { name: "Stop upload" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );

    expect(uploadArguments.signal.aborted).toBe(true);
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
    expect(screen.getByText(/upload stopped/i)).toBeInTheDocument();
  });

  it("recovers a changed submission manifest with a new upload identity", async () => {
    const retryUpload = deferred<Record<string, unknown>>();
    let retrySignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "SUBMISSION_MANIFEST_CHANGED" },
        },
      })
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        retrySignal = signal;
        signal.addEventListener(
          "abort",
          () => retryUpload.reject(signal.reason),
          { once: true }
        );
        return retryUpload.promise;
      });
    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const recovery = await screen.findByRole("alertdialog", {
      name: "Start a new upload?",
    });
    expect(within(recovery).getByText(/photos changed/i)).toBeVisible();
    const firstDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
    fireEvent.click(
      within(recovery).getByRole("button", { name: "Start new upload" })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(2)
    );
    const secondDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[1][0].details;
    expect(secondDetails.force_new).toBe(false);
    expect(secondDetails.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(secondDetails.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );
    expect(retrySignal).toBeInstanceOf(AbortSignal);

    const retryDialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    fireEvent.click(
      within(retryDialog).getByRole("button", { name: "Stop upload" })
    );
    await waitFor(() => expect(retrySignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
  });

  it("carries the rejected upload identity into an explicit force-new replacement", async () => {
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "ACTIVE_REPORT_EXISTS" },
        },
      })
      .mockResolvedValueOnce({
        message: "Accepted",
        reportId: "replacement-lot-report",
        jobId: "replacement-lot-job",
        status: "processing",
      });
    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const conflict = await screen.findByRole("dialog", {
      name: "Report already processing",
    });
    const firstDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
    fireEvent.click(
      within(conflict).getByRole("button", {
        name: "Create Separate Report",
      })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(2)
    );
    const replacementDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[1][0].details;
    expect(replacementDetails.force_new).toBe(true);
    expect(replacementDetails.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(replacementDetails.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );
  });

  it("removes cancellation after acceptance while final cleanup is pending", async () => {
    const cleanup = deferred<void>();
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({
      message: "Accepted",
    });
    mocks.deleteByClientId.mockReturnValueOnce(cleanup.promise);
    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    await waitFor(() =>
      expect(
        within(dialog).getAllByText("Report accepted · finalizing…")
      ).not.toHaveLength(0)
    );
    expect(
      within(dialog).queryByRole("button", { name: /stop upload/i })
    ).not.toBeInTheDocument();
    const acceptedSignal =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].signal;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(acceptedSignal.aborted).toBe(false);

    cleanup.resolve();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
  });

  it("cancels the legacy multipart fallback after upload-session incompatibility", async () => {
    let fallbackSignal: AbortSignal | undefined;
    const pendingFallback = deferred<Record<string, unknown>>();
    mocks.uploadReportFilesDirectToR2.mockRejectedValueOnce({
      code: "UPLOAD_SESSION_UNSUPPORTED",
    });
    mocks.apiPost.mockImplementation(
      (
        url: string,
        _body: unknown,
        config?: { signal?: AbortSignal }
      ) => {
        if (url !== "/lot-listing") {
          return Promise.reject(new Error(`Unexpected API call: ${url}`));
        }
        fallbackSignal = config?.signal;
        fallbackSignal?.addEventListener(
          "abort",
          () =>
            pendingFallback.reject(new DOMException("Stopped", "AbortError")),
          { once: true }
        );
        return pendingFallback.promise;
      }
    );

    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const uploadScreen = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce());
    const directSignal =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].signal;
    expect(fallbackSignal).toBe(directSignal);
    expect(fallbackSignal).toBeInstanceOf(AbortSignal);

    fireEvent.click(
      within(uploadScreen).getByRole("button", { name: "Stop upload" })
    );

    await waitFor(() => expect(fallbackSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
  });

  it("does not start a legacy listing submission for a later session-file 404", async () => {
    mocks.uploadReportFilesDirectToR2.mockRejectedValueOnce({
      response: { status: 404 },
    });

    render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );
    await screen.findByText("Failed to create lot listing.");
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
  });

  it("does not let a stale geolocation response overwrite a manual location", async () => {
    let resolveLocation: PositionCallback | undefined;
    mocks.getCurrentPosition.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    render(<LotListingForm />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    const location = screen.getByRole("textbox", {
      name: /current inspection location/i,
    });
    fireEvent.change(location, { target: { value: "Manual auction yard" } });
    act(() => {
      resolveLocation?.(detectedPosition);
    });

    expect(location).toHaveValue("Manual auction yard");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
    expect(mocks.reverseGeocode).not.toHaveBeenCalled();
  });

  it("aborts and ignores an in-flight reverse lookup after manual entry", async () => {
    const lookup = deferred<{
      location: string;
      attribution: string;
      attributionUrl: string;
    }>();
    mocks.reverseGeocode.mockReturnValueOnce(lookup.promise);
    render(<LotListingForm />);

    await waitFor(() => expect(mocks.reverseGeocode).toHaveBeenCalledOnce());
    const lookupSignal = mocks.reverseGeocode.mock.calls[0][1]
      .signal as AbortSignal;
    const location = screen.getByRole("textbox", {
      name: /current inspection location/i,
    });
    fireEvent.change(location, { target: { value: "Manual auction yard" } });

    expect(lookupSignal.aborted).toBe(true);
    await act(async () => {
      lookup.resolve({
        location: "Stale automatic location",
        attribution: "© OpenStreetMap contributors",
        attributionUrl: OPENSTREETMAP_COPYRIGHT_URL,
      });
      await lookup.promise;
    });

    expect(location).toHaveValue("Manual auction yard");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
    expect(
      screen.queryByRole("link", { name: "© OpenStreetMap contributors" })
    ).not.toBeInTheDocument();
  });

  it("preserves the prior location when re-detection is denied", async () => {
    let requestCount = 0;
    mocks.getCurrentPosition.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(detectedPosition);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<LotListingForm />);
    const location = await waitForResolvedLotLocation();
    fireEvent.change(location, { target: { value: "Existing auction yard" } });

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));

    expect(location).toHaveValue("Existing auction yard");
    expect(location).toHaveAccessibleDescription(
      "Browser location access denied or unavailable"
    );
  });

  it("keeps detected coordinates when a re-detection attempt is denied", async () => {
    let requestCount = 0;
    mocks.getCurrentPosition.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(detectedPosition);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<LotListingForm />);
    const location = await waitForResolvedLotLocation();

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    expect(location).toHaveValue(RESOLVED_LOT_LOCATION);

    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );
    expect(
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details
    ).toMatchObject({
      location: RESOLVED_LOT_LOCATION,
      latitude: detectedPosition.coords.latitude,
      longitude: detectedPosition.coords.longitude,
    });
  });

  it("preserves the readable name, exact coordinates, and attribution when the provider fails", async () => {
    render(<LotListingForm />);
    const location = await waitForResolvedLotLocation();
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The location name could not be refreshed. Keeping the previous location. · © OpenStreetMap contributors"
      )
    );
    expect(location).toHaveValue(RESOLVED_LOT_LOCATION);
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" })
    ).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);

    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );
    expect(
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details
    ).toMatchObject({
      location: RESOLVED_LOT_LOCATION,
      latitude: detectedPosition.coords.latitude,
      longitude: detectedPosition.coords.longitude,
    });
  });

  it("does not report draft-save success when a newer location revision remains unsaved", async () => {
    const serverSave = deferred<Record<string, unknown>>();
    let resolveLocation: PositionCallback | undefined;
    const onDraftStatusChange = vi.fn();
    mocks.getCurrentPosition.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    mocks.upsertWithMedia
      .mockResolvedValue({ _id: "unexpected-second-save", media: [] })
      .mockReturnValueOnce(serverSave.promise);
    render(<LotListingForm onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    act(() => {
      resolveLocation?.(detectedPosition);
    });
    await waitFor(() =>
      expect(onDraftStatusChange).toHaveBeenCalledWith(
        "dirty",
        "Unsaved changes"
      )
    );
    serverSave.resolve({ _id: "saved-before-location", media: [] });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(
      onDraftStatusChange.mock.calls.some(([status]) => status === "saved")
    ).toBe(false);
  });

  it("keeps a legacy coordinate-only draft blank when its name cannot be resolved", async () => {
    mocks.getCurrentPosition.mockImplementation(() => undefined);
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    render(<LotListingForm resumeDraft={makeLotResumeDraft()} />);
    const location = screen.getByRole("textbox", {
      name: /current inspection location/i,
    });
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The browser coordinates could not be named. Re-detect or enter the location manually."
      )
    );
    expect(location).toHaveValue("");
    expect(location).not.toHaveAccessibleDescription(
      /Keeping the previous location/
    );
  });

  it("aborts active draft saves and submissions when the form unmounts", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (_input, _lots, _onProgress, signal: AbortSignal) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const draftView = render(<LotListingForm />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    await waitFor(() => expect(saveSignal).toBeInstanceOf(AbortSignal));
    draftView.unmount();
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));

    let submitSignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        submitSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const submissionView = render(<LotListingForm />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();
    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
  });

  it("uses exact fresh coordinates but displays a readable attributed location", async () => {
    render(<LotListingForm />);

    const location = await waitForResolvedLotLocation();
    expect(location).toHaveAccessibleDescription(
      "Accurate to within approximately 7 m · © OpenStreetMap contributors"
    );
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(
      {
        latitude: detectedPosition.coords.latitude,
        longitude: detectedPosition.coords.longitude,
      },
      { signal: expect.any(AbortSignal) }
    );
    const attribution = screen.getByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    expect(attribution).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);
    expect(attribution).toHaveAttribute("target", "_blank");
    expect(attribution).toHaveAttribute("rel", "noopener noreferrer");
    expect(mocks.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      }
    );
  });
});
