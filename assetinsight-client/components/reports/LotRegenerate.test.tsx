/*
 * Save vs Re-Generate in the web previews (owner decision 2026-10-11):
 * the footer "Save" keeps edits and rebuilds files without the AI; each lot's
 * "Re-Generate" asks first, saves the on-screen preview and has the AI
 * re-read that lot's photos. While the reading runs the editor is read-only
 * and the preview checks back every few seconds until the fresh lot arrives.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LotListingPreviewModal from "./LotListingPreviewModal";
import PreviewModal from "./PreviewModal";

const mocks = vi.hoisted(() => ({
  getLotListingPreview: vi.fn(),
  regenerateLotListingPreviewLot: vi.fn(),
  submitLotListingForApproval: vi.fn(),
  getPreviewData: vi.fn(),
  regenerateAssetPreviewLot: vi.fn(),
  getAssetCategorySpecs: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/services/lotListing", () => ({
  getLotListingPreview: mocks.getLotListingPreview,
  getLotListingSubmittedPreview: vi.fn(),
  updateLotListingPreview: vi.fn(),
  uploadLotListingPreviewLotImages: vi.fn(),
  regenerateLotListingPreviewLot: mocks.regenerateLotListingPreviewLot,
  refreshLotListingSpecPdf: vi.fn(),
  submitLotListingForApproval: mocks.submitLotListingForApproval,
  resubmitLotListing: vi.fn(),
}));

vi.mock("@/services/assets", () => ({
  getPreviewData: mocks.getPreviewData,
  getSubmittedPreviewData: vi.fn(),
  submitForApproval: vi.fn(),
  resubmitReport: vi.fn(),
  getAssetCategorySpecs: mocks.getAssetCategorySpecs,
  uploadPreviewLotImages: vi.fn(),
  regenerateAssetPreviewLot: mocks.regenerateAssetPreviewLot,
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: { reverseGeocode: vi.fn() },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo, success: mocks.toastSuccess, warning: vi.fn() },
}));

vi.mock("@/services/reportDrafts", () => ({ ReportDraftService: { promotePreview: vi.fn() } }));

const lot = (overrides: Record<string, unknown> = {}) => ({
  lot_id: "lot-1",
  lot_number: "10051",
  title: "Freightliner Cascadia Sleeper Semi Truck",
  description: "Freightliner Cascadia sleeper semi truck",
  estimated_value: "CA$38,000",
  categories: "Semi Trucks",
  image_urls: [],
  ...overrides,
});

function listingResponse(lotRegeneration: unknown = null, lots = [lot()]) {
  return {
    data: {
      status: "approved",
      imageUrls: [],
      lot_regeneration: lotRegeneration,
      preview_data: {
        contract_no: "LOT-REGEN-1",
        currency: "CAD",
        location: "Regina, SK",
        latitude: 50.4,
        longitude: -104.6,
        valuation_methods: ["FML"],
        lots,
      },
    },
  };
}

function assetResponse(lotRegeneration: unknown = null, lots = [lot()]) {
  return {
    data: {
      status: "approved",
      grouping_mode: "single_lot",
      image_count: 0,
      imageUrls: [],
      lot_regeneration: lotRegeneration,
      preview_data: {
        client_name: "Client",
        contract_no: "ASSET-REGEN-1",
        currency: "CAD",
        location: "Regina, SK",
        latitude: 50.4,
        longitude: -104.6,
        lots,
      },
    },
  };
}

const pending = { lot_id: "lot-1", lot_key: "lot-1", lot_number: "10051", status: "queued", requested_at: "2026-10-11T10:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAssetCategorySpecs.mockResolvedValue({ categories: [], specs: [] });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Lot Listing preview: Save and Re-Generate", () => {
  it("names the footer action Save and explains it never runs the AI", async () => {
    mocks.getLotListingPreview.mockResolvedValue(listingResponse());
    render(<LotListingPreviewModal isOpen reportId="listing-1" onClose={vi.fn()} />);
    const save = await screen.findByRole("button", { name: "Save preview" });
    expect(save).toHaveTextContent(/^Save$/);
    expect(save).toHaveAttribute("title", expect.stringMatching(/Nothing is re-read by the AI/));
    expect(screen.queryByRole("button", { name: /Save & (Generate|Regenerate)/ })).toBeNull();
  });

  it("asks first, saves the on-screen preview, locks the editor and applies the fresh lot", async () => {
    mocks.getLotListingPreview.mockResolvedValueOnce(listingResponse());
    mocks.regenerateLotListingPreviewLot.mockResolvedValue({
      message: "Re-generating Lot 10051. The AI is re-reading its photos.",
      data: { ...listingResponse(pending).data },
    });
    render(<LotListingPreviewModal isOpen reportId="listing-1" onClose={vi.fn()} />);
    const regenerate = await screen.findByRole("button", { name: "Re-Generate lot 10051" });
    fireEvent.change(screen.getByDisplayValue("Freightliner Cascadia sleeper semi truck"), {
      target: { value: "Unsaved edit" },
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(regenerate);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Re-Generate Lot 10051\?/));
    await waitFor(() => expect(mocks.regenerateLotListingPreviewLot).toHaveBeenCalledTimes(1));
    const [reportId, lotKey, sentPreview] = mocks.regenerateLotListingPreviewLot.mock.calls[0]!;
    expect(reportId).toBe("listing-1");
    expect(lotKey).toBe("lot-1");
    expect(sentPreview.lots[0].description).toBe("Unsaved edit");

    await screen.findByText(/Re-generating Lot 10051\./);
    expect(screen.getByRole("button", { name: "Save preview" })).toBeDisabled();

    // Still reading on the first check, done on the second.
    mocks.getLotListingPreview
      .mockResolvedValueOnce(listingResponse({ ...pending, status: "processing", stage: "looking_up_specs" }))
      .mockResolvedValueOnce(listingResponse(null, [lot({ title: "2019 Freightliner Cascadia 126", description: "Fresh reading." })]));
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    await screen.findByText(/Looking up specs/);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    await screen.findByDisplayValue("Fresh reading.");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/Lot 10051 was re-generated/));
    expect(screen.getByRole("button", { name: "Save preview" })).toBeEnabled();
  });

  it("does nothing when the employee cancels the question", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    mocks.getLotListingPreview.mockResolvedValue(listingResponse());
    render(<LotListingPreviewModal isOpen reportId="listing-1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-Generate lot 10051" }));
    expect(mocks.regenerateLotListingPreviewLot).not.toHaveBeenCalled();
  });

  it("resumes waiting when reopened mid-reading and shows a failed reading on the lot", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.getLotListingPreview
      .mockResolvedValueOnce(listingResponse({ ...pending, status: "processing" }))
      .mockResolvedValueOnce(listingResponse({ ...pending, status: "failed", error: "The AI could not re-read this lot's photos. Nothing on the lot was changed; you can try again." }));
    render(<LotListingPreviewModal isOpen reportId="listing-1" onClose={vi.fn()} />);
    await screen.findByText(/Re-generating Lot 10051\./);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Re-Generate failed: The AI could not re-read/);
    expect(mocks.toastError).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save preview" })).toBeEnabled();
  });

  it("offers no Re-Generate to drafts or assigned approvers", async () => {
    mocks.getLotListingPreview.mockResolvedValue(listingResponse());
    const view = render(<LotListingPreviewModal isOpen reportId="listing-1" draftPreviewId="draft-1" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Save preview" });
    expect(screen.queryByRole("button", { name: /Re-Generate lot/ })).toBeNull();
    view.unmount();
    render(<LotListingPreviewModal isOpen reportId="listing-1" isAssignedApprovalMode onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Save preview" });
    expect(screen.queryByRole("button", { name: /Re-Generate lot/ })).toBeNull();
  });
});

describe("Asset preview: Save and Re-Generate", () => {
  it("re-generates one Asset lot through the Asset endpoint", async () => {
    mocks.getPreviewData.mockResolvedValue(assetResponse());
    mocks.regenerateAssetPreviewLot.mockResolvedValue({ message: "Re-generating Lot 10051.", data: { ...assetResponse(pending).data } });
    render(<PreviewModal isOpen reportId="asset-1" onClose={vi.fn()} />);
    const buttons = await screen.findAllByRole("button", { name: "Re-Generate lot 10051" });
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(mocks.regenerateAssetPreviewLot).toHaveBeenCalledWith("asset-1", "lot-1", expect.objectContaining({ contract_no: "ASSET-REGEN-1" })));
    await screen.findByText(/Re-generating Lot 10051\./);
    expect(screen.getByRole("button", { name: "Save preview" })).toBeDisabled();
  });

  it("calls the approver action Save & Approve and offers no Re-Generate", async () => {
    mocks.getPreviewData.mockResolvedValue(assetResponse());
    render(<PreviewModal isOpen reportId="asset-1" isAssignedApprovalMode loadPreviewDataOverride={mocks.getPreviewData} onClose={vi.fn()} />);
    const save = await screen.findByRole("button", { name: "Save and approve preview" });
    expect(save).toHaveTextContent("Save & Approve");
    expect(screen.queryByRole("button", { name: /Re-Generate lot/ })).toBeNull();
  });
});
