import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctioneerWorkItemSetup } from "@/services/auctioneer";
import type { ReportDraftRecord } from "@/services/reportDrafts";
import AssetForm from "./AssetForm";
import { backgroundUploads } from "@/services/backgroundUploadManager";
import type { MixedLot } from "./mixed/types";

type DraftProgress = {
  phase: "preparing" | "uploading" | "verifying" | "complete";
  percent: number;
  message: string;
  totalFiles: number;
  uploadedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
};

type DraftProgressCallback = (
  percent: number,
  message: string,
  details: DraftProgress
) => void;

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  upsertWithMedia: vi.fn(),
  deleteDraftByClientId: vi.fn(),
  createAsset: vi.fn(),
  deleteScopedDraft: vi.fn(),
  deleteSmartUploadDraft: vi.fn(),
  geolocation: vi.fn(),
  reverseGeocode: vi.fn(),
  restoreLots: vi.fn(),
  getDraft: vi.fn(),
  authUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  let dynamicIndex = 0;

  return {
    default: () => {
      const componentIndex = dynamicIndex++;
      if (componentIndex !== 0) {
        return function DeferredWorkspace({ open, groupingMethod }: { open: boolean; groupingMethod?: string }) {
          return open ? React.createElement("output", { "data-testid": "asset-upload-method" }, groupingMethod) : null;
        };
      }

      return function TestMixedSection({
        value,
        onChange,
        sourceMappedLots,
      }: {
        value: MixedLot[];
        onChange: (value: MixedLot[]) => void;
        sourceMappedLots?: boolean;
      }) {
        const selectedName = value[0]?.files[0]?.name || "No media selected";
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () =>
                onChange((value.length ? value : [{
                  id: "lot-test-1",
                  files: [],
                  extraFiles: [],
                  coverIndex: 0,
                }]).map((lot) => ({
                    ...lot,
                    mode: "single_lot",
                    files: [
                      new File(["asset-photo"], "asset-photo.jpg", {
                        type: "image/jpeg",
                        lastModified: 1,
                      }),
                    ],
                    extraFiles: [],
                    videoFiles: [],
                    coverIndex: 0,
                  }))),
            },
            "Add test media"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => onChange([0, 2, 0, 1].map((count, index) => ({
                id: `video-lot-${index}`,
                mode: "single_lot",
                files: [new File([`photo-${index}`], `photo-${index}.jpg`, { type: "image/jpeg" })],
                extraFiles: [],
                videoFiles: Array.from({ length: count }, (_, videoIndex) => new File([`video-${index}-${videoIndex}`], `video-${index}-${videoIndex}.mp4`, { type: "video/mp4" })),
                coverIndex: 0,
              }))),
            },
            "Add sparse lot videos"
          ),
          React.createElement(
            "output",
            { "data-testid": "selected-asset-media" },
            selectedName
          ),
          React.createElement(
            "output",
            { "data-testid": "asset-source-locks" },
            JSON.stringify({
              sourceMappedLots: Boolean(sourceMappedLots),
              sources: value.map((lot) => lot.source),
            })
          )
        );
      };
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: mocks.authUser(),
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/services/asset", () => ({
  AssetService: { create: mocks.createAsset },
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: { reverseGeocode: mocks.reverseGeocode },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    upsertWithMedia: mocks.upsertWithMedia,
    deleteByClientId: mocks.deleteDraftByClientId,
    restoreLots: mocks.restoreLots,
    get: mocks.getDraft,
  },
  createReportDraftClientId: () => "asset-workflow-draft",
  getDuplicateLotWarning: () => null,
  getReportDraftDeviceId: () => "asset-workflow-device",
}));

vi.mock("@/services/savedInputs", () => ({
  SavedInputService: { create: vi.fn() },
  getDraftFileMetadata: (file: File) => ({
    name: file.name,
    size: file.size,
    mimeType: file.type,
    lastModified: file.lastModified,
  }),
}));

vi.mock("./drafts/storage", () => ({
  recordBrowserObservation: vi.fn(async () => undefined),
  FORM_DRAFT_VERSION: 3,
  deleteScopedDraft: mocks.deleteScopedDraft,
  getScopedDraftKey: () => "asset-workflow-storage-key",
  loadScopedDraft: vi.fn(),
  parseScopedDraftEnvelope: vi.fn(),
  requestDurableDraftStorage: vi.fn(),
  saveScopedDraft: vi.fn(),
}));

vi.mock("./smartUpload/storage", () => ({
  deleteSmartUploadDraft: mocks.deleteSmartUploadDraft,
}));

const originalGeolocation = Object.getOwnPropertyDescriptor(
  window.navigator,
  "geolocation"
);

const position = {
  coords: {
    latitude: 51.507351,
    longitude: -0.127758,
    accuracy: 7.4,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
} as GeolocationPosition;

const RESOLVED_ASSET_LOCATION =
  "10 Downing Street, London SW1A 2AA, United Kingdom";
const OPENSTREETMAP_COPYRIGHT_URL =
  "https://www.openstreetmap.org/copyright";

const uploadingProgress: DraftProgress = {
  phase: "uploading",
  percent: 35,
  message: "Uploading asset-photo.jpg",
  totalFiles: 1,
  uploadedFiles: 0,
  totalBytes: 11,
  uploadedBytes: 4,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function addTestMedia() {
  fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
}

function fillRequiredReportFields() {
  fireEvent.change(screen.getByLabelText(/Client name/i), {
    target: { value: "Workflow Client" },
  });
  fireEvent.change(screen.getByLabelText(/Appraisal purpose/i), {
    target: { value: "Insurance valuation" },
  });
  fireEvent.change(screen.getByLabelText(/Currency/i), {
    target: { value: "GBP" },
  });
}

function makeAuctioneerSetup(
  kind: AuctioneerWorkItemSetup["kind"] = "unknown"
): AuctioneerWorkItemSetup {
  return {
    workItemId: "asset-work-imported",
    cycleKey: "asset-cycle-imported",
    kind,
    reportType: "asset",
    clientSubmissionId: "asset-imported-submission",
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

async function waitForResolvedAssetLocation() {
  const location = screen.getByLabelText(/Inspection location/i);
  await waitFor(() =>
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION)
  );
  return location;
}

function makeAssetResumeDraft(
  location = "Lat 51.507351 / Long -0.127758"
): ReportDraftRecord {
  return {
    _id: "asset-resume-id",
    user: "user-asset-workflow",
    clientDraftId: "asset-resume-draft",
    type: "asset",
    storageMode: "r2_media",
    revision: 4,
    contractNo: "ASSET-RESTORE-1",
    formData: {
      location,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      currency: "GBP",
    },
    lots: [],
    media: [],
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}

describe("AssetForm manual save and submission workflow", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.authUser.mockReturnValue({ _id: "user-asset-workflow", username: "Alex Appraiser", companyName: "Asset Insight QA" });
    mocks.deleteDraftByClientId.mockResolvedValue(undefined);
    mocks.deleteScopedDraft.mockResolvedValue(undefined);
    mocks.deleteSmartUploadDraft.mockResolvedValue(undefined);
    mocks.reverseGeocode.mockResolvedValue({
      location: RESOLVED_ASSET_LOCATION,
      currency: "GBP",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
      source: "nominatim",
    });
    mocks.restoreLots.mockResolvedValue([]);
    mocks.getDraft.mockResolvedValue(makeAssetResumeDraft());
    mocks.geolocation.mockImplementation(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => {
        success(position);
      }
    );
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.geolocation },
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalGeolocation) {
      Object.defineProperty(
        window.navigator,
        "geolocation",
        originalGeolocation
      );
    } else {
      Reflect.deleteProperty(window.navigator, "geolocation");
    }
  });

  it.each([
    { failure: new Error("Network Error"), expected: /connection|network/i },
    { failure: Object.assign(new Error("Request failed with status code 409"), { response: { status: 409, data: { code: "DRAFT_REVISION_CONFLICT", message: "This draft changed on another device. Review the latest saved version." } } }), expected: /version already saved/i },
  ])("keeps an unsuccessful draft save open with actionable guidance", async ({ failure, expected }) => {
    mocks.upsertWithMedia.mockRejectedValue(failure);
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(screen.getByText(expected)).toBeVisible());
    expect(screen.queryByText("Network Error")).not.toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Workflow Client");
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent("asset-photo.jpg");
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  /*
     Submit hands the upload to the background line and closes the form, so a
     refusal no longer surfaces in a form that is still on screen. The data is
     still safe — the saved draft is untouched, the line holds the upload for
     attention, and the draft is marked foreground so reopening it from Drafts
     submits inline, where its dialog can be answered. These tests assert that
     chain rather than the old on-screen form.
  */
  const heldForAttention = async () => {
    await waitFor(() => expect(backgroundUploads.getSnapshot().held).toHaveLength(1));
    return backgroundUploads.getSnapshot().held[0];
  };

  it.each([{}, { reportId: "unaccepted-placeholder", phase: "upload", status: "uploading" }])("keeps the draft and asks for the form when a receipt is not acceptance %j", async (receipt) => {
    mocks.createAsset.mockResolvedValue(receipt);
    render(<AssetForm resumeLocalDraftScopeId="scope-receipt" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());

    const held = await heldForAttention();
    expect(held).toMatchObject({ status: "attention" });
    /*
       An unconfirmed receipt is retryable as the same upload — the server may
       still have accepted it, so recreating the report is the one thing that
       must not happen. It therefore stays resumable from the bar rather than
       demanding a decision in the form.
    */
    expect(held.message).toMatch(/Retry this same upload; do not recreate the report/);
    expect(held.needsForm).toBe(false);
    expect(backgroundUploads.isForegroundRequired("asset", "scope-receipt")).toBe(false);
    // An unproven receipt must never be treated as a completed submission.
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
  });

  it("keeps the draft when an earlier accepted report is found", async () => {
    mocks.createAsset.mockResolvedValue({ reportId: "old-report", jobId: "old-job", status: "processed", reusedAcceptance: true });
    render(<AssetForm resumeLocalDraftScopeId="scope-earlier" />);
    await waitForResolvedAssetLocation(); fillRequiredReportFields(); addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const held = await heldForAttention();
    expect(held.message).toMatch(/earlier submission was already accepted/);
    expect(backgroundUploads.isForegroundRequired("asset", "scope-earlier")).toBe(true);
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
  });

  it.each([true, false])("sends an unusable old submission back to the form, offering separate recovery only for authoritative eligibility %s", async (canCreateSeparate) => {
    mocks.createAsset.mockRejectedValue({ response: { status: 409, data: { code: "UPLOAD_SESSION_REPORT_UNAVAILABLE", data: { sessionId: "old-session", accepted: true, reportAvailable: false, canCreateSeparate } } } });
    render(<AssetForm resumeLocalDraftScopeId="scope-separate" />);
    await waitForResolvedAssetLocation(); fillRequiredReportFields(); addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await heldForAttention();

    // Only an eligible separate recovery is a decision the form can offer.
    expect(backgroundUploads.isForegroundRequired("asset", "scope-separate")).toBe(canCreateSeparate);
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
  });

  it("shows the existing-report dialog when the returned draft is submitted again", async () => {
    mocks.createAsset.mockRejectedValue({ response: { status: 409, data: { code: "ACTIVE_REPORT_EXISTS" } } });
    const first = render(<AssetForm resumeLocalDraftScopeId="scope-active" />);
    await waitForResolvedAssetLocation(); fillRequiredReportFields(); addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await heldForAttention();
    expect(backgroundUploads.isForegroundRequired("asset", "scope-active")).toBe(true);
    first.unmount();

    // Reopening that draft from Drafts submits inline, where the prompt lives.
    render(<AssetForm resumeLocalDraftScopeId="scope-active" />);
    await waitForResolvedAssetLocation(); fillRequiredReportFields(); addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const dialog = await screen.findByRole("dialog", { name: "Report already processing" });
    const link = within(dialog).getByRole("link", { name: "Open My Reports (new tab)" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Workflow Client");
  });

  it.each([["Smart Upload", "black_divider"], ["Lot Number Upload", "lot_number"]])("opens %s with its own method", async (label, method) => {
    render(<AssetForm />);
    fillRequiredReportFields();
    fireEvent.change(screen.getByRole("textbox", { name: /inspection location/i }), { target: { value: "Regina" } });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByTestId("asset-upload-method")).toHaveTextContent(method);
    expect(mocks.createAsset).not.toHaveBeenCalled();
  });

  it("prefills a fresh continuation with edited details without reusing the previous submission", async () => {
    const auctioneer = makeAuctioneerSetup("unknown");
    render(<AssetForm auctioneer={auctioneer} continuationDetails={{ clientName: "Edited client", location: "Edited yard", currency: "USD", appraisalPurpose: "Continued inspection", bankPhotosEnabled: true }} />);
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Edited client");
    expect(screen.getByLabelText(/Inspection location/i)).toHaveValue("Edited yard");
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("USD");
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({ client_submission_id: auctioneer.clientSubmissionId, client_name: "Edited client", location: "Edited yard", currency: "USD" });
  });

  it.each(["unknown", "scheduleA"] as const)(
    "continues an imported %s report at acceptance without waiting for processing or old-draft cleanup",
    async (kind) => {
      const upload = deferred<Record<string, unknown>>();
      const cleanup = deferred<void>();
      const onAcceptedAndContinue = vi.fn();
      const onSuccess = vi.fn();
      const onDraftStatusChange = vi.fn();
      const auctioneer = makeAuctioneerSetup(kind);
      mocks.createAsset.mockReturnValueOnce(upload.promise);
      mocks.deleteDraftByClientId.mockReturnValueOnce(cleanup.promise);
      render(<AssetForm auctioneer={auctioneer} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} onDraftStatusChange={onDraftStatusChange} />);
      addTestMedia();

      const sources = JSON.parse(screen.getByTestId("asset-source-locks").textContent || "{}");
      expect(sources.sourceMappedLots).toBe(kind === "scheduleA");
      if (kind === "scheduleA") {
        expect(sources.sources.map((source: { locked: boolean }) => source.locked)).toEqual([true, true]);
      }
      fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));
      await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
      expect(onAcceptedAndContinue).not.toHaveBeenCalled();
      expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
      const details = mocks.createAsset.mock.calls[0][0];
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

      await act(async () => upload.resolve({ reportId: "accepted-asset-report", jobId: "accepted-job", status: "processing" }));
      await waitFor(() => expect(mocks.deleteDraftByClientId).toHaveBeenCalledExactlyOnceWith(auctioneer.clientSubmissionId, "asset"));
      expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-asset-report", expect.objectContaining({ contractNo: auctioneer.contract.contractNo }));
      expect(onSuccess).not.toHaveBeenCalled();
      await act(async () => cleanup.resolve());

      await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-asset-report", expect.objectContaining({ contractNo: auctioneer.contract.contractNo })));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mocks.createAsset).toHaveBeenCalledOnce();
      expect(screen.getByTestId("selected-asset-media")).toHaveTextContent("No media selected");
      expect(onDraftStatusChange).not.toHaveBeenCalledWith("saved", "Submission accepted");
    }
  );

  it("preserves imported media and submission identity when the new-lot upload fails and is retried", async () => {
    const onAcceptedAndContinue = vi.fn();
    const onSuccess = vi.fn();
    mocks.createAsset
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({ reportId: "accepted-after-retry", jobId: "accepted-job", status: "processing" });
    render(<AssetForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Create Lot & Continue" })).toBeEnabled());
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent("asset-photo.jpg");
    expect(screen.getByLabelText(/Contract number/i)).toHaveValue("IMPORTED-100");
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    expect(onAcceptedAndContinue).not.toHaveBeenCalled();
    const original = mocks.createAsset.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-after-retry", expect.objectContaining({ contractNo: "IMPORTED-100" })));
    expect(mocks.createAsset).toHaveBeenCalledTimes(2);
    expect(mocks.createAsset.mock.calls[1][0].client_submission_id).toBe(original[0].client_submission_id);
    expect(mocks.createAsset.mock.calls[1][1]).toEqual(original[1]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it.each(["continue", "normal", "save"] as const)(
    "keeps rapid new-lot, normal-submit, and save clicks in the first %s intent",
    async (first) => {
      const pending = deferred<Record<string, unknown>>();
      const onAcceptedAndContinue = vi.fn();
      const onSuccess = vi.fn();
      mocks.createAsset.mockReturnValue(pending.promise);
      mocks.upsertWithMedia.mockReturnValue(pending.promise);
      render(<AssetForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
      addTestMedia();
      const actions = {
        continue: screen.getByRole("button", { name: "Create Lot & Continue" }),
        normal: screen.getByRole("button", { name: "Create Lot & Close" }),
        save: screen.getByRole("button", { name: /Save draft/i }),
      };
      act(() => {
        actions[first].click();
        actions.continue.click();
        actions.normal.click();
        actions.save.click();
      });

      if (first === "save") {
        await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
        expect(mocks.createAsset).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
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
    mocks.createAsset.mockResolvedValueOnce({ reportId: "accepted-cleanup-failure", jobId: "accepted-job", status: "processing" });
    mocks.deleteScopedDraft.mockRejectedValueOnce(new Error("Local storage unavailable"));
    render(<AssetForm auctioneer={makeAuctioneerSetup()} onAcceptedAndContinue={onAcceptedAndContinue} onSuccess={onSuccess} />);
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create Lot & Continue" }));

    await waitFor(() => expect(onAcceptedAndContinue).toHaveBeenCalledExactlyOnceWith("accepted-cleanup-failure", expect.objectContaining({ contractNo: "IMPORTED-100" })));
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringContaining("Report submitted"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.createAsset).toHaveBeenCalledOnce();
  });

  it("shows no new-lot action without both an imported contract and continuation callback", () => {
    const view = render(<AssetForm onAcceptedAndContinue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Create Lot & Continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create report" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Lot & Close" })).not.toBeInTheDocument();
    view.rerender(<AssetForm auctioneer={makeAuctioneerSetup()} />);
    expect(screen.queryByRole("button", { name: "Create Lot & Continue" })).not.toBeInTheDocument();
  });

  it("saves and resumes a fresh successor under its own work item and submission identity", async () => {
    const previous = makeAuctioneerSetup();
    const next = { ...previous, workItemId: "asset-successor-work", clientSubmissionId: "asset-successor-submission" };
    const onSuccess = vi.fn();
    mocks.upsertWithMedia.mockResolvedValueOnce({ _id: "successor-draft", media: [] });
    const first = render(<AssetForm auctioneer={next} />);
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Saving your draft" })).not.toBeInTheDocument());
    const [saved, lots] = mocks.upsertWithMedia.mock.calls[0];
    expect(saved).toMatchObject({
      clientDraftId: next.clientSubmissionId,
      formData: { clientSubmissionId: next.clientSubmissionId, auctioneerWorkItemId: next.workItemId },
    });
    expect(saved.clientDraftId).not.toBe(previous.clientSubmissionId);
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    first.unmount();

    const resumeDraft: ReportDraftRecord = {
      ...makeAssetResumeDraft(next.contract.location),
      clientDraftId: saved.clientDraftId,
      contractNo: saved.contractNo,
      revision: saved.revision,
      formData: saved.formData,
      lots,
    };
    mocks.restoreLots.mockResolvedValueOnce(lots);
    mocks.deleteScopedDraft.mockClear();
    mocks.createAsset.mockResolvedValueOnce({ reportId: "successor-accepted", jobId: "accepted-job", status: "processing" });
    render(<AssetForm auctioneer={next} resumeDraft={resumeDraft} onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByTestId("selected-asset-media")).toHaveTextContent("asset-photo.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());

    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      auctioneer_work_item_id: next.workItemId,
      client_submission_id: next.clientSubmissionId,
      contract_no: previous.contract.contractNo,
    });
    expect(mocks.deleteDraftByClientId).toHaveBeenCalledExactlyOnceWith(next.clientSubmissionId, "asset");
    expect(mocks.deleteScopedDraft).toHaveBeenCalledExactlyOnceWith("user-asset-workflow", "asset", next.clientSubmissionId);
  });

  it("defaults new Asset reports to no watermark and allows explicit opt-in", async () => {
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    const watermark = screen.getByRole("checkbox", { name: /Apply watermark/i });
    expect(watermark).not.toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).not.toBeChecked();
  });

  it("submits sparse per-lot video counts with every selected clip in lot order", async () => {
    mocks.createAsset.mockResolvedValueOnce({ reportId: "video-report", jobId: "accepted-job", status: "processing" });
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    fireEvent.click(screen.getByRole("button", { name: "Add sparse lot videos" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    const [details, photos, clips] = mocks.createAsset.mock.calls[0];
    expect(details.mixed_lots.map((lot: any) => lot.video_count)).toEqual([0, 2, 0, 1]);
    expect(photos.map((file: File) => file.name)).toEqual(["photo-0.jpg", "photo-1.jpg", "photo-2.jpg", "photo-3.jpg"]);
    expect(clips.map((file: File) => file.name)).toEqual(["video-1-0.mp4", "video-1-1.mp4", "video-3-0.mp4"]);
  });

  it.each([undefined, false, true])("restores watermark choice %s without opting missing draft values in", async (watermarkImages) => {
    const draft = makeAssetResumeDraft(RESOLVED_ASSET_LOCATION);
    draft.formData = { ...draft.formData, watermarkImages };
    const onDraftStatusChange = vi.fn();
    render(<AssetForm resumeDraft={draft} onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(onDraftStatusChange).toHaveBeenCalledWith("saved", "Draft and photos restored"));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Apply watermark/i })).toHaveProperty("checked", watermarkImages === true));
  });

  it("keeps form and media changes local until Save draft is selected", async () => {
    vi.useFakeTimers();
    render(<AssetForm />);

    fireEvent.change(screen.getByLabelText(/Client name/i), {
      target: { value: "Unsaved workflow client" },
    });
    addTestMedia();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
  });

  it("persists only after the explicit Save draft action", async () => {
    mocks.upsertWithMedia.mockImplementation(
      async (
        _input: unknown,
        _lots: unknown,
        onProgress?: DraftProgressCallback
      ) => {
        onProgress?.(100, "Draft and photos saved", {
          ...uploadingProgress,
          phase: "complete",
          percent: 100,
          message: "Draft and photos saved",
          uploadedFiles: 1,
          uploadedBytes: 11,
        });
        return { _id: "draft-server-1", media: [] };
      }
    );
    render(<AssetForm />);
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));

    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    expect(mocks.upsertWithMedia.mock.calls[0][0].formData.watermarkImages).toBe(false);
    expect(mocks.upsertWithMedia.mock.calls[0][0].formData).not.toHaveProperty("auctioneerWorkItemId");
    const [, lots, , signal] = mocks.upsertWithMedia.mock.calls[0];
    expect(lots[0].files[0].name).toBe("asset-photo.jpg");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("locks immediately, ignores a rapid repeated save, and cancels the original save", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    render(<AssetForm />);
    fireEvent.change(screen.getByLabelText(/Client name/i), {
      target: { value: "Keep this client" },
    });
    addTestMedia();

    const saveButton = screen.getByRole("button", { name: /Save draft/i });
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(saveSignal).toBeInstanceOf(AbortSignal);
    expect(dialog).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("button", { name: "Cancel save" })
    ).toBeVisible();
    expect(within(dialog).getByText(/keep this page open/i)).toBeVisible();
    const hiddenWorkspace = document
      .getElementById("asset-clientName")
      ?.closest("[inert]");
    expect(hiddenWorkspace).not.toBeNull();
    expect(hiddenWorkspace).toHaveAttribute("inert");
    expect(hiddenWorkspace).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByRole("contentinfo", { name: "Form actions" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Client name/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create report" })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel save" })
    );

    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(
      document.getElementById("asset-clientName")?.closest("[inert]")
    ).toBeNull();
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Keep this client");
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
  });

  it("makes rapid Save draft then Submit one cancellable draft-save intent", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    const saveButton = screen.getByRole("button", { name: /Save draft/i });
    const submitButton = screen.getByRole("button", { name: "Create report" });
    act(() => {
      saveButton.click();
      submitButton.click();
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(mocks.createAsset).not.toHaveBeenCalled();

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
    expect(mocks.createAsset).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
  });

  it("opens the real more-actions menu and wires discard to confirmation", async () => {
    render(<AssetForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "More asset form actions" })
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Save as reusable input" })
    ).toBeVisible();
    expect(
      within(menu).getByRole("menuitem", {
        name: "Discard draft and clear form",
      })
    ).toBeVisible();

    fireEvent.click(
      within(menu).getByRole("menuitem", {
        name: "Discard draft and clear form",
      })
    );

    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard this asset draft?",
      })
    ).toBeVisible();
  });

  it("stops a handed-off upload from the line, submitting nothing", async () => {
    let submitSignal: AbortSignal | undefined;
    mocks.createAsset.mockImplementation(
      (
        _details: unknown,
        _images: File[],
        _videos: File[],
        options?: { signal?: AbortSignal }
      ) => {
        submitSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          submitSignal?.addEventListener(
            "abort",
            () => reject(submitSignal?.reason),
            { once: true }
          );
        });
      }
    );
    render(<AssetForm resumeLocalDraftScopeId="scope-stop" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));

    /*
       The upload now runs in the line, so the form neither blocks the page nor
       owns the control that stops it. Stop lives on the upload bar.
    */
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
    expect(document.getElementById("asset-clientName")?.closest("[inert]")).toBeNull();
    expect(mocks.createAsset.mock.calls[0][0].watermark_images).toBe(false);

    const active = backgroundUploads.getSnapshot().active;
    expect(active).toMatchObject({ canPause: true, finalizing: false });
    backgroundUploads.stop(active!.id);

    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
    await waitFor(() => expect(backgroundUploads.getSnapshot().active).toBeNull());
    // Stopping submits nothing and leaves the saved draft to be reopened.
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
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
    mocks.createAsset
      .mockRejectedValueOnce(manifestConflict)
      .mockRejectedValueOnce(manifestConflict)
      .mockImplementationOnce(
        (
          _details: unknown,
          _images: File[],
          _videos: File[],
          options?: { signal?: AbortSignal }
        ) => {
          retrySignal = options?.signal;
          retrySignal?.addEventListener(
            "abort",
            () => retryUpload.reject(retrySignal?.reason),
            { once: true }
          );
          return retryUpload.promise;
        }
      );

    // The first attempt runs in the line and comes back needing a decision.
    const first = render(<AssetForm resumeLocalDraftScopeId="scope-manifest" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(backgroundUploads.isForegroundRequired("asset", "scope-manifest")).toBe(true)
    );
    const firstDetails = mocks.createAsset.mock.calls[0][0];
    first.unmount();

    // Reopening that draft submits inline, where the recovery prompt lives.
    render(<AssetForm resumeLocalDraftScopeId="scope-manifest" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const recovery = await screen.findByRole("alertdialog", {
      name: "Start a new upload?",
    });
    expect(within(recovery).getByText(/photos changed/i)).toBeVisible();
    fireEvent.click(
      within(recovery).getByRole("button", { name: "Start new upload" })
    );

    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(3));
    const replacement = mocks.createAsset.mock.calls[2][0];
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
    mocks.createAsset
      .mockRejectedValueOnce(activeConflict)
      .mockRejectedValueOnce(activeConflict)
      .mockResolvedValueOnce({ message: "Accepted", reportId: "accepted-report", jobId: "accepted-job", status: "processing" });

    // The first attempt runs in the line and is returned for a decision.
    const first = render(<AssetForm resumeLocalDraftScopeId="scope-force-new" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(backgroundUploads.isForegroundRequired("asset", "scope-force-new")).toBe(true)
    );
    const firstDetails = mocks.createAsset.mock.calls[0][0];
    first.unmount();

    render(<AssetForm resumeLocalDraftScopeId="scope-force-new" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const conflict = await screen.findByRole("dialog", {
      name: "Report already processing",
    });
    fireEvent.click(
      within(conflict).getByRole("button", {
        name: "Create Separate Report",
      })
    );

    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(3));
    const replacementDetails = mocks.createAsset.mock.calls[2][0];
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
    mocks.createAsset.mockReturnValueOnce(upload.promise);
    mocks.deleteDraftByClientId.mockReturnValueOnce(cleanup.promise);
    render(<AssetForm resumeLocalDraftScopeId="scope-accept" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());

    /*
       The draft is what a resumed upload is rebuilt from, so it must survive
       the whole transfer and be cleared only on confirmed acceptance.
    */
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
    expect(mocks.deleteScopedDraft).not.toHaveBeenCalled();

    upload.resolve({ message: "Accepted", reportId: "accepted-report", jobId: "accepted-job", status: "processing" });
    await waitFor(() => expect(mocks.deleteDraftByClientId).toHaveBeenCalled());

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

  it("does not let a stale geolocation response overwrite a manual location", async () => {
    let resolveLocation: PositionCallback | undefined;
    mocks.geolocation.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    render(<AssetForm />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    const location = screen.getByLabelText(/Inspection location/i);
    fireEvent.change(location, { target: { value: "Manual warehouse bay" } });
    act(() => {
      resolveLocation?.(position);
    });

    expect(location).toHaveValue("Manual warehouse bay");
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
    render(<AssetForm />);

    await waitFor(() => expect(mocks.reverseGeocode).toHaveBeenCalledOnce());
    const lookupSignal = mocks.reverseGeocode.mock.calls[0][1].signal as AbortSignal;
    const location = screen.getByLabelText(/Inspection location/i);
    fireEvent.change(location, { target: { value: "Manual warehouse bay" } });

    expect(lookupSignal.aborted).toBe(true);
    await act(async () => {
      lookup.resolve({
        location: "Stale automatic location",
        attribution: "© OpenStreetMap contributors",
        attributionUrl: OPENSTREETMAP_COPYRIGHT_URL,
      });
      await lookup.promise;
    });

    expect(location).toHaveValue("Manual warehouse bay");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
    expect(
      screen.queryByRole("link", { name: "© OpenStreetMap contributors" })
    ).not.toBeInTheDocument();
  });

  it("preserves the prior location when re-detection is denied", async () => {
    let requestCount = 0;
    mocks.geolocation.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(position);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();
    fireEvent.change(location, { target: { value: "Existing inspection yard" } });

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));

    expect(location).toHaveValue("Existing inspection yard");
    expect(location).toHaveAccessibleDescription(
      "Browser location access was denied or is unavailable"
    );
  });

  it("keeps detected coordinates when a re-detection attempt is denied", async () => {
    let requestCount = 0;
    mocks.geolocation.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(position);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION);

    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("preserves the readable name, exact coordinates, and attribution when the provider fails", async () => {
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The location name could not be refreshed. Keeping the previous location. · © OpenStreetMap contributors"
      )
    );
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION);
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" })
    ).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);

    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("does not report draft-save success when a newer location revision remains unsaved", async () => {
    const serverSave = deferred<Record<string, unknown>>();
    let resolveLocation: PositionCallback | undefined;
    const onDraftStatusChange = vi.fn();
    mocks.geolocation.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    mocks.upsertWithMedia.mockReturnValueOnce(serverSave.promise);
    render(<AssetForm onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    act(() => {
      resolveLocation?.(position);
    });
    await waitFor(() =>
      expect(onDraftStatusChange).toHaveBeenCalledWith(
        "dirty",
        "Location updated · save again"
      )
    );
    serverSave.resolve({ _id: "saved-before-location", media: [] });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onDraftStatusChange).toHaveBeenCalledWith(
      "dirty",
      "Location updated · save again"
    );
    expect(
      onDraftStatusChange.mock.calls.some(([status]) => status === "saved")
    ).toBe(false);
  });

  it("keeps a failed restore locked and retries the latest saved snapshot without saving partial data", async () => {
    mocks.restoreLots.mockRejectedValueOnce(new Error("Lot 2, photo 3: missing original"));
    const draft = makeAssetResumeDraft(RESOLVED_ASSET_LOCATION);
    const latest = { ...draft, revision: 5, contractNo: "LATEST-SAVED" };
    mocks.getDraft.mockResolvedValue(latest);
    render(<AssetForm resumeDraft={draft} />);
    const retry = await screen.findByRole("button", { name: "Retry loading draft" });
    expect(screen.getByRole("button", { name: /Save draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create report" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Create report" }).closest("form")!);
    expect(mocks.createAsset).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: /Save draft/i })).toBeEnabled());
    expect(mocks.getDraft).toHaveBeenCalledWith(draft._id, expect.any(AbortSignal));
    expect(mocks.restoreLots).toHaveBeenLastCalledWith(latest, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(mocks.deleteDraftByClientId).not.toHaveBeenCalled();
  });

  it("restarts account restoration in StrictMode and ignores late media after unmount", async () => {
    const loading = deferred<MixedLot[]>();
    mocks.restoreLots.mockReturnValue(loading.promise);
    const view = render(<StrictMode><AssetForm resumeDraft={makeAssetResumeDraft(RESOLVED_ASSET_LOCATION)} /></StrictMode>);
    expect(mocks.restoreLots).toHaveBeenCalledTimes(2);
    expect(mocks.restoreLots.mock.calls[0][1].signal.aborted).toBe(true);
    view.unmount();
    expect(mocks.restoreLots.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => loading.resolve([]));
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
  });

  it("rejects another owner's draft before reading media", async () => {
    render(<AssetForm resumeDraft={{ ...makeAssetResumeDraft(), user: "other-owner" }} />);
    await screen.findByRole("button", { name: "Retry loading draft" });
    expect(mocks.restoreLots).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Save draft/i })).toBeDisabled();
  });

  it("waits for authentication and cancels restoration when the signed-in account changes", async () => {
    const download = deferred<MixedLot[]>();
    mocks.authUser.mockReturnValue(null);
    mocks.restoreLots.mockReturnValue(download.promise);
    const draft = makeAssetResumeDraft(RESOLVED_ASSET_LOCATION);
    const view = render(<AssetForm resumeDraft={draft} />);
    expect(mocks.restoreLots).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create report" })).toBeDisabled();
    mocks.authUser.mockReturnValue({ _id: draft.user });
    view.rerender(<AssetForm resumeDraft={draft} />);
    await waitFor(() => expect(mocks.restoreLots).toHaveBeenCalledOnce());
    const signal = mocks.restoreLots.mock.calls[0][1].signal;
    mocks.authUser.mockReturnValue({ _id: "another-user" });
    view.rerender(<AssetForm resumeDraft={draft} />);
    expect(signal.aborted).toBe(true);
    await act(async () => download.resolve([]));
    expect(screen.getByRole("button", { name: /Save draft/i })).toBeDisabled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
  });

  it("keeps an immediately resolved legacy draft location marked dirty after hydration", async () => {
    const restoredLots = deferred<[]>();
    const onDraftStatusChange = vi.fn();
    mocks.restoreLots.mockReturnValueOnce(restoredLots.promise);

    render(
      <AssetForm
        resumeDraft={makeAssetResumeDraft()}
        onDraftStatusChange={onDraftStatusChange}
      />
    );
    await waitForResolvedAssetLocation();
    restoredLots.resolve([]);

    await waitFor(() => {
      const calls = onDraftStatusChange.mock.calls;
      expect(calls[calls.length - 1]).toEqual([
        "dirty",
        "Location updated · save again",
      ]);
    });
    expect(mocks.geolocation).not.toHaveBeenCalled();
  });

  it("marks a delayed legacy location migration dirty and saves the readable tuple as a new revision", async () => {
    const lookup = deferred<{
      location: string;
      currency: string;
      attribution: string;
      attributionUrl: string;
    }>();
    const onDraftStatusChange = vi.fn();
    mocks.reverseGeocode.mockReturnValueOnce(lookup.promise);
    mocks.upsertWithMedia.mockResolvedValueOnce({
      _id: "saved-migrated-location",
      media: [],
    });

    render(
      <AssetForm
        resumeDraft={makeAssetResumeDraft()}
        onDraftStatusChange={onDraftStatusChange}
      />
    );
    await waitFor(() =>
      expect(onDraftStatusChange).toHaveBeenCalledWith(
        "saved",
        "Draft and photos restored"
      )
    );

    await act(async () => {
      lookup.resolve({
        location: RESOLVED_ASSET_LOCATION,
        currency: "GBP",
        attribution: "© OpenStreetMap contributors",
        attributionUrl: OPENSTREETMAP_COPYRIGHT_URL,
      });
      await lookup.promise;
    });
    await waitForResolvedAssetLocation();
    await waitFor(() => {
      const calls = onDraftStatusChange.mock.calls;
      expect(calls).toContainEqual([
        "dirty",
        "Location updated · save again",
      ]);
      expect(calls[calls.length - 1]?.[0]).toBe("dirty");
    });

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    const draftInput = mocks.upsertWithMedia.mock.calls[0][0];
    expect(draftInput.revision).toBeGreaterThan(4);
    expect(draftInput.formData).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("keeps a legacy coordinate-only draft blank when its name cannot be resolved", async () => {
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    render(<AssetForm resumeDraft={makeAssetResumeDraft()} />);
    const location = screen.getByLabelText(/Inspection location/i);
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The browser coordinates could not be named. Re-detect or enter the location manually."
      )
    );
    expect(location).toHaveValue("");
    expect(location).not.toHaveAccessibleDescription(
      /Keeping the previous location/
    );
    expect(mocks.geolocation).not.toHaveBeenCalled();
  });

  it("aborts a draft save when the form unmounts, but never a handed-off upload", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const draftView = render(<AssetForm />);
    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(saveSignal).toBeInstanceOf(AbortSignal));
    draftView.unmount();
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));

    let submitSignal: AbortSignal | undefined;
    mocks.createAsset.mockImplementation(
      (
        _details: unknown,
        _images: File[],
        _videos: File[],
        options?: { signal?: AbortSignal }
      ) => {
        submitSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          submitSignal?.addEventListener(
            "abort",
            () => reject(submitSignal?.reason),
            { once: true }
          );
        });
      }
    );
    const submissionView = render(<AssetForm resumeLocalDraftScopeId="scope-unmount" />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();

    /*
       The upload belongs to the line, not to this component, so closing the
       form leaves it running. That inversion is the point of the feature: the
       appraiser can start the next report while this one finishes uploading.
       Only an explicit Pause or Stop may abort it.
    */
    await waitFor(() => expect(backgroundUploads.getSnapshot().active).not.toBeNull());
    expect(submitSignal?.aborted).toBe(false);

    const active = backgroundUploads.getSnapshot().active;
    backgroundUploads.stop(active!.id);
    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
  });

  it("requests exact fresh coordinates but displays a readable attributed location", async () => {
    render(<AssetForm />);

    await waitFor(() => expect(mocks.geolocation).toHaveBeenCalled());
    for (const call of mocks.geolocation.mock.calls) {
      expect(call[2]).toEqual({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      });
    }
    const location = await waitForResolvedAssetLocation();
    expect(location).toHaveAccessibleDescription(
      "Accurate to within approximately 7 m · © OpenStreetMap contributors"
    );
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      { signal: expect.any(AbortSignal) }
    );
    const attribution = screen.getByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    expect(attribution).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);
    expect(attribution).toHaveAttribute("target", "_blank");
    expect(attribution).toHaveAttribute("rel", "noopener noreferrer");
  });
});
