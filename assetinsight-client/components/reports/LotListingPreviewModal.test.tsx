import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LotListingPreviewModal from "./LotListingPreviewModal";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const mocks = vi.hoisted(() => ({
  getAssetCategorySpecs: vi.fn(),
  reverseGeocode: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  promoteDraftPreview: vi.fn(),
  submitForApproval: vi.fn(),
}));

vi.mock("@/services/lotListing", () => ({
  getLotListingPreview: vi.fn(),
  getLotListingSubmittedPreview: vi.fn(),
  updateLotListingPreview: vi.fn(),
  uploadLotListingPreviewLotImages: vi.fn(),
  refreshLotListingSpecPdf: vi.fn(),
  submitLotListingForApproval: mocks.submitForApproval,
  resubmitLotListing: vi.fn(),
}));

vi.mock("@/services/assets", () => ({
  getAssetCategorySpecs: mocks.getAssetCategorySpecs,
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: {
    reverseGeocode: mocks.reverseGeocode,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    promotePreview: mocks.promoteDraftPreview,
  },
}));

function makeListingPreview() {
  return {
    data: {
      status: "preview",
      imageUrls: [],
      preview_data: {
        contract_no: "LOT-LOCATION-1",
        currency: "CAD",
        location: "Old Inspection Yard",
        latitude: 50.1,
        longitude: -104.2,
        lots: [
          {
            lot_id: "lot-1",
            lot_number: "1",
            title: "Test lot",
            description: "Test description",
            estimated_value: "1000",
            image_indices: [],
            location: "Old Inspection Yard",
            latitude: 50.1,
            longitude: -104.2,
            condition_report_selections: {
              condition: "N/A",
              completeness: "N/A",
              legal: "N/A",
            },
          },
        ],
      },
    },
  };
}

describe("LotListingPreviewModal inspection location", () => {
  it("resubmits an edited failed preview instead of calling the preview-only submit endpoint", async () => {
    const response = makeListingPreview();
    response.data.status = "error";
    const retry = vi.fn().mockResolvedValue({ status: "processing", files_generating: true });
    render(<LotListingPreviewModal isOpen reportId="failed-lot" onClose={vi.fn()}
      loadPreviewDataOverride={vi.fn().mockResolvedValue(response)} resubmitReportOverride={retry} />);
    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    expect(screen.getByRole("alert")).toHaveTextContent("saved preview is available");
    fireEvent.change(contract, { target: { value: "93530" } });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Approved Files" }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("failed-lot", expect.objectContaining({ contract_no: "93530" })));
    expect(mocks.submitForApproval).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mocks.getAssetCategorySpecs.mockReset();
    mocks.getAssetCategorySpecs.mockResolvedValue({ categories: [], specs: [] });
    mocks.reverseGeocode.mockReset();
    mocks.reverseGeocode.mockResolvedValue({
      location: "10 Downing Street, London, United Kingdom",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    });
    mocks.promoteDraftPreview.mockReset().mockResolvedValue({
      reportId: "promoted-lot-report",
      reportType: "lotListing",
      status: "approved",
      files_generating: true,
    });
    mocks.submitForApproval.mockReset();
  });

  it("reloads for a mode switch and ignores the older in-flight listing", async () => {
    const olderRequest = deferred<ReturnType<typeof makeListingPreview>>();
    const submittedResponse = makeListingPreview();
    submittedResponse.data.status = "approved";
    submittedResponse.data.preview_data.contract_no = "LOT-SUBMITTED-SNAPSHOT";
    const loadPreview = vi
      .fn()
      .mockReturnValueOnce(olderRequest.promise)
      .mockResolvedValueOnce(submittedResponse);
    const onClose = vi.fn();

    const { rerender } = render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-mode-switch"
        isResubmitMode={false}
        onClose={onClose}
        loadPreviewDataOverride={loadPreview}
      />
    );
    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(1));

    rerender(
      <LotListingPreviewModal
        isOpen
        reportId="listing-mode-switch"
        isResubmitMode
        onClose={onClose}
        loadPreviewDataOverride={loadPreview}
      />
    );

    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue("LOT-SUBMITTED-SNAPSHOT")).toBeInTheDocument();

    const olderResponse = makeListingPreview();
    olderResponse.data.preview_data.contract_no = "LOT-OLDER-SNAPSHOT";
    olderRequest.resolve(olderResponse);
    await waitFor(() => {
      expect(screen.queryByDisplayValue("LOT-OLDER-SNAPSHOT")).toBeNull();
      expect(screen.getByDisplayValue("LOT-SUBMITTED-SNAPSHOT")).toBeInTheDocument();
    });
  });

  it("resolves a coordinate-only legacy preview without exposing a placeholder", async () => {
    const response = makeListingPreview();
    response.data.preview_data.location = "Current Browser Location";
    response.data.preview_data.lots[0].location = "Current Browser Location";

    render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    await waitFor(() => {
      expect(location).toHaveValue(
        "10 Downing Street, London, United Kingdom"
      );
    });
    expect(screen.queryByDisplayValue("Current Browser Location")).toBeNull();
  });

  it("sends null coordinate markers when the location name is manually changed", async () => {
    const response = makeListingPreview();
    const updatePreview = vi.fn().mockResolvedValue({
      data: { preview_data: response.data.preview_data, imageUrls: [] },
    });

    render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-manual-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshSpecPdfOverride={vi.fn().mockResolvedValue({
          data: { spec_pdf: "https://example.test/cr.pdf" },
        })}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    fireEvent.change(location, { target: { value: "New Inspection Yard" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalled());
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(savedPreview).toMatchObject({
      location: "New Inspection Yard",
      latitude: null,
      longitude: null,
    });
    expect(savedPreview.lots[0]).toMatchObject({
      location: "New Inspection Yard",
      latitude: null,
      longitude: null,
    });
  });

  it("promotes and submits the exact edited Lot Listing draft preview", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <LotListingPreviewModal
        isOpen
        reportId="hidden-lot-report"
        draftPreviewId="lot-draft-1"
        onClose={onClose}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makeListingPreview())}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-EDITED-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & Submit" }));

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "lot-draft-1",
        expect.objectContaining({
          submit: true,
          preview_data: expect.objectContaining({
            contract_no: "LOT-EDITED-1",
          }),
        })
      )
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "promoted-lot-report",
        reportId: "promoted-lot-report",
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves Lot Listing draft edits without generating partial hidden CR files", async () => {
    const response = makeListingPreview();
    const updatePreview = vi.fn().mockResolvedValue({
      data: { preview_data: response.data.preview_data, imageUrls: [] },
    });
    const refreshSpecPdf = vi.fn();

    render(
      <LotListingPreviewModal
        isOpen
        reportId="hidden-lot-save-only"
        draftPreviewId="lot-draft-save-only"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshSpecPdfOverride={refreshSpecPdf}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-SAVED-ONLY" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(mocks.promoteDraftPreview).not.toHaveBeenCalled();
  });

  it("serializes Save and Resubmit without starting a second client regeneration", async () => {
    const response = makeListingPreview();
    response.data.status = "approved";
    const pendingSave = deferred<{
      data: typeof response.data.preview_data;
      files_regeneration_queued?: boolean;
    }>();
    const updatePreview = vi.fn().mockReturnValue(pendingSave.promise);
    const resubmit = vi.fn();
    const uploadImages = vi.fn();
    const refreshSpecPdf = vi.fn();
    const onClose = vi.fn();

    render(
      <LotListingPreviewModal
        isOpen
        reportId="approved-lot-exclusive-save"
        onClose={onClose}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        resubmitReportOverride={resubmit}
        uploadPreviewLotImagesOverride={uploadImages}
        refreshSpecPdfOverride={refreshSpecPdf}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-LOCKED" } });
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    const resubmitButton = screen.getByRole("button", {
      name: "Regenerate Approved Files",
    });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    fireEvent.click(resubmitButton);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["photo"], "locked.jpg", { type: "image/jpeg" })],
      },
    });

    expect(updatePreview).toHaveBeenCalledTimes(1);
    expect(resubmit).not.toHaveBeenCalled();
    expect(uploadImages).not.toHaveBeenCalled();
    expect(saveButton).toBeDisabled();
    expect(resubmitButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving preview changes"
    );
    expect(document.querySelector(".preview-editor [inert]")).not.toBeNull();

    pendingSave.resolve({
      data: response.data.preview_data,
      files_regeneration_queued: true,
    });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(resubmitButton).toBeDisabled();
  });

  it("keeps the server-normalized listing preview after Save when no newer edit exists", async () => {
    const response = makeListingPreview();
    const canonicalPreview = JSON.parse(JSON.stringify({
      ...response.data.preview_data,
      contract_no: "LOT-CANONICAL",
      location: "Canonical Listing Yard",
      latitude: undefined,
      longitude: undefined,
      lots: [
        {
          ...response.data.preview_data.lots[0],
          title: "Canonical listing title",
          location: "Canonical Listing Yard",
          latitude: undefined,
          longitude: undefined,
        },
      ],
    }));
    const updatePreview = vi.fn().mockResolvedValue({ data: canonicalPreview });
    mocks.submitForApproval.mockResolvedValue({
      ...response.data,
      status: "processing",
      files_generating: true,
      preview_data: canonicalPreview,
    });

    render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-canonical-save"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-EDITED-LOCALLY" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Inspection Location *" })).toHaveValue(
        "Canonical Listing Yard"
      );
      expect(screen.getByDisplayValue("LOT-CANONICAL")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Approved Files" }));
    await waitFor(() => expect(mocks.submitForApproval).toHaveBeenCalledTimes(1));
    const submittedPreview = mocks.submitForApproval.mock.calls[0]?.[1]?.preview_data;
    expect(submittedPreview).toMatchObject({
      contract_no: "LOT-CANONICAL",
      location: "Canonical Listing Yard",
      lots: [
        expect.objectContaining({
          title: "Canonical listing title",
          location: "Canonical Listing Yard",
        }),
      ],
    });
    expect(submittedPreview).not.toHaveProperty("latitude");
    expect(submittedPreview).not.toHaveProperty("longitude");
    expect(submittedPreview.lots[0]).not.toHaveProperty("latitude");
    expect(submittedPreview.lots[0]).not.toHaveProperty("longitude");
  });

  it("submits a dirty listing snapshot once without requiring a file-generating Save", async () => {
    const pendingSubmit = deferred<Record<string, unknown>>();
    const onClose = vi.fn();
    mocks.submitForApproval.mockReturnValue(pendingSubmit.promise);

    render(
      <LotListingPreviewModal
        isOpen
        reportId="initial-lot-submit-lock"
        onClose={onClose}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makeListingPreview())}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-FINAL-SNAPSHOT" } });
    const submitButton = screen.getByRole("button", {
      name: "Generate Approved Files",
    });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(mocks.submitForApproval).toHaveBeenCalledTimes(1);
    expect(mocks.submitForApproval).toHaveBeenCalledWith(
      "initial-lot-submit-lock",
      expect.objectContaining({
        preview_data: expect.objectContaining({
          contract_no: "LOT-FINAL-SNAPSHOT",
        }),
      })
    );
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeDisabled();

    pendingSubmit.resolve({
      _id: "initial-lot-submit-lock",
      status: "approved",
      preview_data: makeListingPreview().data.preview_data,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
