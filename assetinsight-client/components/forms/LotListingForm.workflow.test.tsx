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
import { backgroundUploads } from "@/services/backgroundUploadManager";
import { StrictMode } from "react";
import type { MixedLot } from "./mixed/types";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
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
  getDraft: vi.fn(),
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
          sourceMappedLots,
        }: {
          value: MixedLot[];
          onChange: (lots: MixedLot[]) => void;
          sourceMappedLots?: boolean;
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
                sourceMappedLots: Boolean(sourceMappedLots),
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

      return function MockSmartUploadWorkspace({ open, groupingMethod }: { open: boolean; groupingMethod?: string }) {
        return open ? React.createElement("output", { "data-testid": "listing-upload-method" }, groupingMethod) : null;
      };
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: mocks.userId ? { _id: mocks.userId, username: "Test Appraiser" } : null,
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
    get: mocks.getDraft,
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
    mocks.userId = "user-1";
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
    mocks.getDraft.mockReset().mockResolvedValue(makeLotResumeDraft());
    mocks.toastWarning.mockReset();
    mocks.upsertWithMedia.mockReset();
    mocks.uploadReportFilesDirectToR2.mockReset();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.getCurrentPosition },
    });
    window.localStorage.clear();
  });

  /*
     Submit hands the upload to the background line and closes the form, so a
     refusal no longer surfaces in a form that is still on screen. The data is
     still safe -- the saved draft is untouched, the line holds the upload for
     attention, and a draft needing a decision is marked foreground so reopening
     it from Drafts submits inline, where its dialog can be answered. These
     tests assert that chain, as AssetForm.workflow.test.tsx does.
  */
  const heldForAttention = async () => {
    await waitFor(() => expect(backgroundUploads.getSnapshot().held).toHaveLength(1));
    return backgroundUploads.getSnapshot().held[0];
  };

  it.each([{}, { reportId: "placeholder", jobId: "j", phase: "upload", status: "uploading" }])("keeps the draft and leaves an unproven receipt retryable from the bar %j", async (receipt) => {
    const onSuccess = vi.fn();
    mocks.uploadReportFilesDirectToR2.mockResolvedValue(receipt);
    render(<LotListingForm onSuccess={onSuccess} resumeLocalDraftScopeId="scope-receipt" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await waitFor(() => expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce());

    const held = await heldForAttention();
    expect(held).toMatchObject({ status: "attention", kind: "lot-listing" });
    /*
       An unconfirmed receipt is retryable as the same upload -- the server may
       still have accepted it, so recreating the report is the one thing that
       must not happen. It stays resumable from the bar rather than demanding a
       decision in the form.
    */
    expect(held.message).toMatch(/Retry this same upload; do not recreate the report/);
    expect(held.needsForm).toBe(false);
    expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-receipt")).toBe(false);
    // An unproven receipt must never be treated as a completed submission.
    expect(mocks.deleteByClientId).not.toHaveBeenCalled(); expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
  });

  it("keeps the draft and returns it to the form when an earlier accepted report is found", async () => {
    mocks.uploadReportFilesDirectToR2.mockResolvedValue({ reportId: "old-report", jobId: "old-job", status: "processed", reusedAcceptance: true });
    render(<LotListingForm resumeLocalDraftScopeId="scope-earlier" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));

    const held = await heldForAttention();
    expect(held.message).toMatch(/earlier submission was already accepted/);
    expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-earlier")).toBe(true);
    expect(mocks.deleteByClientId).not.toHaveBeenCalled(); expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
  });

  it.each([true, false])("sends an unusable old submission back to the form, offering separate recovery only for authoritative eligibility %s", async (canCreateSeparate) => {
    mocks.uploadReportFilesDirectToR2.mockRejectedValue({ response: { status: 409, data: { code: "UPLOAD_SESSION_REPORT_UNAVAILABLE", data: { sessionId: "old-session", accepted: true, reportAvailable: false, canCreateSeparate } } } });
    const first = render(<LotListingForm resumeLocalDraftScopeId="scope-separate" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await heldForAttention();

    // Only an eligible separate recovery is a decision the form can offer.
    expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-separate")).toBe(canCreateSeparate);
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled(); expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    if (!canCreateSeparate) return;

    // Reopened from Drafts, the draft submits inline and offers the recovery.
    first.unmount();
    render(<LotListingForm resumeLocalDraftScopeId="scope-separate" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await screen.findByText(/old submission cannot be reused/);
    expect(screen.getByRole("button", { name: "Save separate draft" })).toBeVisible();
    expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg");
  });

  it.each([new Error("Network Error"), { response: { status: 409, data: { code: "DRAFT_REVISION_CONFLICT" } } }])("keeps an unsuccessful draft save open with actionable guidance %j", async (failure) => {
    mocks.upsertWithMedia.mockRejectedValue(failure);
    render(<LotListingForm />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getAllByRole("button", { name: "Save Draft" })[0]);
    await screen.findByText(/connection was interrupted|version already saved/);
    expect(screen.queryByText(/^Network Error$/)).not.toBeInTheDocument(); expect(screen.queryByText(/status code 409/)).not.toBeInTheDocument();
    expect(mocks.deleteByClientId).not.toHaveBeenCalled(); expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg");
  });

  it("shows the existing-report dialog when the returned draft is submitted again", async () => {
    mocks.uploadReportFilesDirectToR2.mockRejectedValue({ response: { status: 409, data: { code: "ACTIVE_REPORT_EXISTS" } } });
    const first = render(<LotListingForm resumeLocalDraftScopeId="scope-active" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await heldForAttention();
    expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-active")).toBe(true);
    first.unmount();

    // Reopening that draft from Drafts submits inline, where the prompt lives.
    const onSuccess = vi.fn();
    render(<LotListingForm onSuccess={onSuccess} resumeLocalDraftScopeId="scope-active" />);
    await waitForResolvedLotLocation(); addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    const dialog = await screen.findByRole("dialog", { name: "Report already processing" });
    const link = within(dialog).getByRole("link", { name: "Open My Reports (new tab)" });
    expect(link).toHaveAttribute("target", "_blank"); fireEvent.click(link);
    expect(onSuccess).not.toHaveBeenCalled(); expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg");
  });

  it.each([["Smart Upload", "black_divider"], ["Lot Number Upload", "lot_number"]])("opens %s with its own method", async (label, method) => {
    render(<LotListingForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /contract number/i }), { target: { value: "93257" } });
    fireEvent.change(screen.getByRole("textbox", { name: /current inspection location/i }), { target: { value: "Regina" } });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByTestId("listing-upload-method")).toHaveTextContent(method);
    expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();
  });

  it("shows all 85 saved lots and fields before downloading media, without allowing empty saves", async () => {
    const download = deferred<MixedLot[]>();
    mocks.restoreLots.mockReturnValue(download.promise);
    const draft = { ...makeLotResumeDraft(), contractNo: "93257", formData: { location: "Alvarado, Texas", salesDate: "2026-09-25", currency: "CAD" },
      lots: Array.from({ length: 85 }, (_, i) => ({ id: `saved-${i}`, mode: "single_lot", lotNumber: String(i + 1), coverIndex: 0 })),
    };
    render(<LotListingForm resumeDraft={draft} />);
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue("93257");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("85");
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Save Draft" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Create Lot Listing" }).closest("form")!);
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();
    act(() => mocks.restoreLots.mock.calls[0][1].onProgress({ completed: 12, total: 693 }));
    expect(screen.getByText(/12 of 693 media files loaded/)).toBeVisible();
    const lots = draft.lots.map((lot) => ({ ...lot, files: [], extraFiles: [], videoFiles: [] })) as MixedLot[];
    await act(async () => download.resolve(lots));
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeEnabled();
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("85");
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
  });

  it("retains fields after a download failure and requires a successful explicit retry before saving", async () => {
    mocks.restoreLots.mockRejectedValueOnce(new Error("Photo download interrupted"));
    const draft = makeLotResumeDraft();
    render(<LotListingForm resumeDraft={draft} />);
    const retry = await screen.findByRole("button", { name: "Retry loading draft" });
    const latest = { ...draft, revision: draft.revision + 1, contractNo: "LATEST-LOT" };
    mocks.getDraft.mockResolvedValue(latest);
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue(draft.contractNo);
    expect(screen.getAllByRole("button", { name: "Save Draft" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Save Draft" })[0]).toBeEnabled());
    expect(mocks.restoreLots).toHaveBeenCalledTimes(2);
    expect(mocks.restoreLots).toHaveBeenLastCalledWith(latest, expect.any(Object));
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue("LATEST-LOT");
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
  });

  it("waits for authentication and restores after it arrives", async () => {
    mocks.userId = null;
    const draft = makeLotResumeDraft();
    const view = render(<LotListingForm resumeDraft={draft} />);
    expect(mocks.restoreLots).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeDisabled();
    mocks.userId = "user-1";
    view.rerender(<LotListingForm resumeDraft={draft} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeEnabled());
    expect(mocks.restoreLots).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue(draft.contractNo);
  });

  it("cancels obsolete downloads on account changes and ignores their late completion", async () => {
    const download = deferred<MixedLot[]>();
    mocks.restoreLots.mockReturnValue(download.promise);
    const draft = makeLotResumeDraft();
    const view = render(<LotListingForm resumeDraft={draft} />);
    const signal = mocks.restoreLots.mock.calls[0][1].signal as AbortSignal;
    mocks.userId = "another-user";
    view.rerender(<LotListingForm resumeDraft={draft} />);
    expect(signal.aborted).toBe(true);
    await act(async () => download.resolve([{ id: "private", files: [], extraFiles: [], coverIndex: 0 }]));
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeDisabled();
    expect(mocks.restoreLots).toHaveBeenCalledOnce();
  });

  it("restarts safely after StrictMode cleanup and aborts media loading on unmount", async () => {
    mocks.restoreLots.mockReturnValue(new Promise(() => {}));
    const view = render(<StrictMode><LotListingForm resumeDraft={makeLotResumeDraft()} /></StrictMode>);
    expect(mocks.restoreLots).toHaveBeenCalledTimes(2);
    expect(mocks.restoreLots.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.restoreLots.mock.calls[1][1].signal.aborted).toBe(false);
    view.unmount();
    expect(mocks.restoreLots.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it("prefills edited continuation details while keeping fresh media", async () => {
    render(<LotListingForm auctioneer={makeAuctioneerSetup("unknown")} continuationDetails={{ location: "Edited yard", salesDate: "2026-10-05", currency: "USD", bankPhotosEnabled: true, watermarkImages: true }} />);
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue("IMPORTED-100");
    expect(screen.getByDisplayValue("Edited yard")).toBeVisible();
    expect(screen.getByDisplayValue("USD")).toBeVisible();
    expect(mocks.uploadReportFilesDirectToR2).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await waitFor(() => expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce());
    expect(mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details).toMatchObject({ sales_date: "2026-10-05", location: "Edited yard", currency: "USD" });
  });

  it.each(["unknown", "scheduleA"] as const)(
    "continues an imported %s listing at acceptance without waiting for processing or old-draft cleanup",
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
      expect(sources.sourceMappedLots).toBe(kind === "scheduleA");
      if (kind === "scheduleA") {
        expect(sources.sources.map((source: { locked: boolean }) => source.locked)).toEqual([true, true]);
      }
      fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));
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

      await act(async () => upload.resolve({ reportId: "accepted-listing-report", jobId: "accepted-job", status: "processing" }));
      await waitFor(() => expect(mocks.deleteByClientId).toHaveBeenCalledExactlyOnceWith(auctioneer.clientSubmissionId, "lot-listing"));
      expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-listing-report", expect.objectContaining({ contractNo: auctioneer.contract.contractNo }));
      expect(onSuccess).not.toHaveBeenCalled();
      await act(async () => cleanup.resolve());

      await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-listing-report", expect.objectContaining({ contractNo: auctioneer.contract.contractNo })));
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
      .mockResolvedValueOnce({ reportId: "accepted-after-retry", jobId: "accepted-job", status: "processing" });
    render(<LotListingForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Create Lot & Continue" })).toBeEnabled());
    expect(screen.getByTestId("selected-listing-media")).toHaveTextContent("lot-photo.jpg");
    expect(screen.getByRole("textbox", { name: /contract number/i })).toHaveValue("IMPORTED-100");
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    expect(onAcceptedAndContinue).not.toHaveBeenCalled();
    const original = mocks.uploadReportFilesDirectToR2.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-after-retry", expect.objectContaining({ contractNo: "IMPORTED-100" })));
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
        continue: screen.getByRole("button", { name: "Create Lot & Continue" }),
        normal: screen.getByRole("button", { name: "Create Lot & Close" }),
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
      await act(async () => pending.resolve({ _id: "saved-draft", media: [], reportId: "accepted-single-flight", jobId: "accepted-job", status: "processing" }));
      if (first === "continue") {
        await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-single-flight", expect.objectContaining({ contractNo: "IMPORTED-100" })));
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
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({ reportId: "accepted-cleanup-failure", jobId: "accepted-job", status: "processing" });
    mocks.deleteScopedDraft.mockRejectedValueOnce(new Error("Local storage unavailable"));
    render(<LotListingForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-cleanup-failure", expect.objectContaining({ contractNo: "IMPORTED-100" })));
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce();
  });

  it("shows no new-lot action without both an imported contract and continuation callback", () => {
    const view = render(<LotListingForm onAcceptedAndContinue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Create Lot & Continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Lot Listing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Lot & Close" })).not.toBeInTheDocument();
    view.rerender(<LotListingForm auctioneer={makeAuctioneerSetup()} />);
    expect(screen.queryByRole("button", { name: "Create Lot & Continue" })).not.toBeInTheDocument();
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
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({ reportId: "successor-accepted", jobId: "accepted-job", status: "processing" });
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

  it("hands the upload to the line, clears the form, and stops it from the bar without auto-saving", async () => {
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

    const { container } = render(<LotListingForm resumeLocalDraftScopeId="scope-stop" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );

    /*
       The upload now runs in the line, so the form neither blocks the page nor
       owns the control that stops it. Stop lives on the upload bar, and the
       form is cleared for the next listing.
    */
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"][inert]')).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("");

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

    const active = backgroundUploads.getSnapshot().active;
    expect(active).toMatchObject({ kind: "lot-listing", title: "LOT-TEST-1", canPause: true, finalizing: false });
    backgroundUploads.stop(active!.id);

    await waitFor(() => expect(uploadArguments.signal.aborted).toBe(true));
    await waitFor(() => expect(backgroundUploads.getSnapshot().active).toBeNull());
    // Stopping submits nothing, never auto-saves, and leaves the saved draft.
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
    expect(backgroundUploads.getSnapshot().notices.at(-1)).toMatchObject({ heading: "Upload stopped" });
  });

  /*
     The hand-off used to return with the inline-upload locks still set, so the
     cleared form stayed inert and refused every later Save Draft and Submit
     until it was reopened. The next listing must work at once, under its own
     draft scope, while the first upload is still running.
  */
  it("keeps the form usable after a hand-off: the next listing saves under its own scope and queues", async () => {
    mocks.uploadReportFilesDirectToR2.mockImplementation(
      () => new Promise(() => undefined)
    );
    mocks.upsertWithMedia.mockResolvedValue({ _id: "draft-2", media: [] });

    const { container } = render(<LotListingForm resumeLocalDraftScopeId="scope-first" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await waitFor(() => expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce());
    expect(backgroundUploads.getSnapshot().active).toMatchObject({ scopeId: "scope-first" });

    await waitForResolvedLotLocation();
    expect(container.querySelector("form")).not.toHaveAttribute("aria-busy", "true");
    fireEvent.change(
      screen.getByRole("textbox", { name: /contract number/i }),
      { target: { value: "LOT-TEST-2" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Add test media" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Save Draft" })[0]);
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    const savedDraft = mocks.upsertWithMedia.mock.calls[0][0];
    expect(savedDraft).toMatchObject({ contractNo: "LOT-TEST-2" });
    // Never over the first listing's scope: its upload resumes from that draft.
    expect(savedDraft.clientDraftId).not.toBe("scope-first");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Lot Listing" }));
    await waitFor(() => expect(backgroundUploads.getSnapshot().queued).toHaveLength(1));
    const snapshot = backgroundUploads.getSnapshot();
    expect(snapshot.active).toMatchObject({ title: "LOT-TEST-1", scopeId: "scope-first" });
    expect(snapshot.queued[0]).toMatchObject({
      kind: "lot-listing",
      title: "LOT-TEST-2",
      scopeId: savedDraft.clientDraftId,
      status: "queued",
    });
    // One upload at a time: the second waits for the first.
    expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("");
  });

  it("recovers a changed submission manifest through the returned draft", async () => {
    const manifestConflict = {
      response: {
        status: 409,
        data: { code: "SUBMISSION_MANIFEST_CHANGED", data: { accepted: false, canSupersede: true } },
      },
    };
    const retryUpload = deferred<Record<string, unknown>>();
    let retrySignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce(manifestConflict)
      .mockRejectedValueOnce(manifestConflict)
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        retrySignal = signal;
        signal.addEventListener(
          "abort",
          () => retryUpload.reject(signal.reason),
          { once: true }
        );
        return retryUpload.promise;
      });

    // The first attempt runs in the line and comes back needing a decision.
    const first = render(<LotListingForm resumeLocalDraftScopeId="scope-manifest" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-manifest")).toBe(true)
    );
    const firstDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
    first.unmount();

    // Reopening that draft submits inline, where the recovery prompt lives.
    render(<LotListingForm resumeLocalDraftScopeId="scope-manifest" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const recovery = await screen.findByRole("alertdialog", {
      name: "Start a new upload?",
    });
    expect(within(recovery).getByText(/photos changed/i)).toBeVisible();
    fireEvent.click(
      within(recovery).getByRole("button", { name: "Start new upload" })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(3)
    );
    const replacement =
      mocks.uploadReportFilesDirectToR2.mock.calls[2][0].details;
    expect(replacement.force_new).toBe(false);
    expect(replacement.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(replacement.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );

    /*
       The decision has been taken, so the replacement upload goes back to the
       line rather than holding the page open again.
    */
    expect(retrySignal).toBeInstanceOf(AbortSignal);
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
    const active = backgroundUploads.getSnapshot().active;
    expect(active).not.toBeNull();
    backgroundUploads.stop(active!.id);
    await waitFor(() => expect(retrySignal?.aborted).toBe(true));
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
  });

  it("carries the rejected upload identity into an explicit force-new replacement", async () => {
    const activeConflict = {
      response: { status: 409, data: { code: "ACTIVE_REPORT_EXISTS" } },
    };
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce(activeConflict)
      .mockRejectedValueOnce(activeConflict)
      .mockResolvedValueOnce({
        message: "Accepted",
        reportId: "replacement-lot-report",
        jobId: "replacement-lot-job",
        status: "processing",
      });

    // The first attempt runs in the line and is returned for a decision.
    const first = render(<LotListingForm resumeLocalDraftScopeId="scope-force-new" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(backgroundUploads.isForegroundRequired("lot-listing", "scope-force-new")).toBe(true)
    );
    const firstDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
    first.unmount();

    render(<LotListingForm resumeLocalDraftScopeId="scope-force-new" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const conflict = await screen.findByRole("dialog", {
      name: "Report already processing",
    });
    fireEvent.click(
      within(conflict).getByRole("button", {
        name: "Create Separate Report",
      })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(3)
    );
    const replacementDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[2][0].details;
    expect(replacementDetails.force_new).toBe(true);
    expect(replacementDetails.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(replacementDetails.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );
  });

  it("clears the saved draft only once the line reports acceptance", async () => {
    const cleanup = deferred<void>();
    const upload = deferred<Record<string, unknown>>();
    mocks.uploadReportFilesDirectToR2.mockReturnValueOnce(upload.promise);
    mocks.deleteByClientId.mockReturnValueOnce(cleanup.promise);
    render(<LotListingForm resumeLocalDraftScopeId="scope-accept" />);
    await waitForResolvedLotLocation();
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );

    /*
       The draft is what a resumed upload is rebuilt from, so it must survive
       the whole transfer and be cleared only on confirmed acceptance.
    */
    expect(mocks.deleteByClientId).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();

    upload.resolve({
      message: "Accepted",
      reportId: "accepted-report", jobId: "accepted-job", status: "processing",
    });
    await waitFor(() => expect(mocks.deleteByClientId).toHaveBeenCalled());

    // A cleanup still in flight must not hold the line or the notice back.
    await waitFor(() =>
      expect(backgroundUploads.getSnapshot().notices.at(-1)).toMatchObject({
        kind: "sent",
        heading: "Sent",
      })
    );
    expect(backgroundUploads.getSnapshot().active).toBeNull();
    cleanup.resolve();
  });

  it("stops the legacy multipart fallback from the line after upload-session incompatibility", async () => {
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

    render(<LotListingForm resumeLocalDraftScopeId="scope-fallback" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    // The fallback runs in the line too, under the same signal.
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce());
    const directSignal =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].signal;
    expect(fallbackSignal).toBe(directSignal);
    expect(fallbackSignal).toBeInstanceOf(AbortSignal);
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();

    const active = backgroundUploads.getSnapshot().active;
    expect(active).not.toBeNull();
    backgroundUploads.stop(active!.id);

    await waitFor(() => expect(fallbackSignal?.aborted).toBe(true));
    await waitFor(() => expect(backgroundUploads.getSnapshot().active).toBeNull());
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
  });

  it("does not start a legacy listing submission for a later session-file 404", async () => {
    mocks.uploadReportFilesDirectToR2.mockRejectedValueOnce({
      response: { status: 404 },
    });

    render(<LotListingForm resumeLocalDraftScopeId="scope-404" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );
    /*
       Only an explicit upload-session incompatibility may fall back to the
       legacy multipart path. A missing session file is an interrupted upload
       of this same submission: held for a retry from the bar, never resent
       another way and never sent back to the form for a decision.
    */
    const held = await heldForAttention();
    expect(held).toMatchObject({ status: "attention", needsForm: false });
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
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

  it("aborts a draft save when the form unmounts, but never a handed-off upload", async () => {
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
    const submissionView = render(<LotListingForm resumeLocalDraftScopeId="scope-unmount" />);
    await waitForResolvedLotLocation();
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();

    /*
       The upload belongs to the line, not to this component, so closing the
       form leaves it running. That inversion is the point of the feature: the
       appraiser can start the next listing while this one finishes uploading.
       Only an explicit Pause or Stop may abort it.
    */
    await waitFor(() => expect(backgroundUploads.getSnapshot().active).not.toBeNull());
    expect(submitSignal?.aborted).toBe(false);

    const active = backgroundUploads.getSnapshot().active;
    backgroundUploads.stop(active!.id);
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
