import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreviewModal from "./PreviewModal";
import LotListingPreviewModal from "./LotListingPreviewModal";

vi.mock("@/services/assets", () => ({
  getAssetCategorySpecs: vi.fn().mockResolvedValue({ categories: [], specs: [] }),
  getPreviewData: vi.fn(), updatePreviewData: vi.fn(), submitForApproval: vi.fn(),
  getSubmittedPreviewData: vi.fn(), resubmitReport: vi.fn(), refreshAssetSpecPdf: vi.fn(),
  uploadPreviewLotImages: vi.fn(),
}));
vi.mock("@/services/lotListing", () => ({
  getLotListingPreview: vi.fn(), getLotListingSubmittedPreview: vi.fn(),
  updateLotListingPreview: vi.fn(), uploadLotListingPreviewLotImages: vi.fn(),
  refreshLotListingSpecPdf: vi.fn(), submitLotListingForApproval: vi.fn(), resubmitLotListing: vi.fn(),
}));
vi.mock("@/services/browserLocation", () => ({ BrowserLocationService: { reverseGeocode: vi.fn() } }));
vi.mock("@/services/reportDrafts", () => ({ ReportDraftService: { promotePreview: vi.fn() } }));
vi.mock("@/components/ui/toast", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

describe.each(["asset", "lotListing"] as const)("%s preview integrity", (type) => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  it("saves a serial correction without changing separate lot photo order or cover choices", async () => {
    const photos = Array.from({ length: 41 }, (_, index) => `https://images.test/lot-222-${index}.jpg`);
    const secondPhotos = ["https://images.test/lot-223-front.jpg", "https://images.test/lot-223-rear.jpg"];
    const lots = [photos, secondPhotos].map((urls, index) => ({
      lot_id: `stable-lot-${index}`, lot_number: String(222 + index), title: "2019 Trailer",
      description: `Separate unit ${index}`, estimated_value: "18000", mixed_group_index: index + 1,
      sub_mode: "single_lot", image_urls: urls,
      image_indexes: urls.map((_, position) => position + (index ? photos.length : 0)),
      extra_image_urls: [], serial_number: index ? "SECOND-UNIT" : "OLD-SERIAL",
      condition_report_specs: { "Serial Number": index ? "SECOND-UNIT" : "OLD-SERIAL" },
      condition_report_specs_manual_overrides: { "Serial Number": index ? "SECOND-UNIT" : "OLDER-ADMIN-SERIAL" },
      condition_report_selections: { condition: "N/A", completeness: "N/A", legal: "N/A" },
    }));
    const preview = {
      contract_no: "PHOTO-INTEGRITY", client_name: "Fixture client", currency: "CAD",
      location: "Fixture yard", grouping_mode: "mixed", lots,
      cover_image_urls: [photos[2], photos[0]],
    };
    const imageUrls = [...photos, ...secondPhotos];
    const load = vi.fn().mockResolvedValue({ data: { status: "preview", grouping_mode: "mixed", imageUrls, preview_data: preview } });
    const save = vi.fn().mockImplementation(async (_id, submitted) => ({
      data: type === "asset" ? submitted : { preview_data: submitted, imageUrls }, imageUrls,
    }));
    const Component = type === "asset" ? PreviewModal : LotListingPreviewModal;
    render(<Component isOpen reportId="integrity-report" onClose={vi.fn()}
      loadPreviewDataOverride={load} updatePreviewDataOverride={save} />);

    if (type === "asset") {
      fireEvent.click((await screen.findAllByRole("button", { name: "OLD-SERIAL" }))[0]);
    }
    const serial = (await screen.findAllByDisplayValue("OLD-SERIAL"))[0];
    fireEvent.change(serial, { target: { value: "1FTWW3DR9AEA01459" } });
    if (type === "asset") fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0][1];
    expect(saved.lots).toHaveLength(2);
    expect(saved.lots[0]).toMatchObject({
      serial_number: "1FTWW3DR9AEA01459",
      condition_report_specs: { "Serial Number": "1FTWW3DR9AEA01459" },
      condition_report_specs_manual_overrides: { "Serial Number": "1FTWW3DR9AEA01459" },
    });
    for (let index = 0; index < lots.length; index++) {
      for (const key of ["lot_id", "lot_number", "image_urls", "image_indexes", "mixed_group_index", "description"] as const) {
        expect(saved.lots[index][key]).toEqual(lots[index][key]);
      }
    }
    expect(saved.cover_image_urls).toEqual(preview.cover_image_urls);
    expect(saved.lots[1].serial_number).toBe("SECOND-UNIT");
  });

  it("saves and reopens a URL-only deletion without deleting a stale paired image from another lot", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const old = "https://images.test/old-position.jpg";
    const selected = "https://images.test/selected.jpg";
    const remaining = "https://images.test/remaining.jpg";
    const other = "https://images.test/other-lot.jpg";
    const imageUrls = [old, selected, remaining, other];
    const common = { estimated_value: "18000", description: "Reviewed notes", sub_mode: "single_lot" };
    let preview = {
      contract_no: "STALE-PHOTO-INDEX", client_name: "Fixture client", location: "Fixture yard", grouping_mode: "mixed", currency: "CAD",
      lots: [
        { ...common, lot_id: "first", lot_number: "222", title: "Trailer A", image_urls: [selected, remaining], image_indexes: [0, 1] },
        { ...common, lot_id: "second", lot_number: "223", title: "Trailer B", image_urls: [other], image_indexes: [2] },
      ],
    };
    const secondLot = structuredClone(preview.lots[1]);
    const load = vi.fn().mockImplementation(async () => ({ data: { status: "preview", grouping_mode: "mixed", imageUrls, preview_data: preview } }));
    const save = vi.fn().mockImplementation(async (_id, submitted) => {
      preview = submitted;
      return { data: type === "asset" ? submitted : { preview_data: submitted, imageUrls }, imageUrls };
    });
    const Component = type === "asset" ? PreviewModal : LotListingPreviewModal;
    const props = { isOpen: true, reportId: "deletion-integrity", onClose: vi.fn(), loadPreviewDataOverride: load, updatePreviewDataOverride: save };
    const view = render(<Component {...props} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Remove photo 1" }))[0]);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0][1];
    expect(saved.lots[0].image_urls).toEqual([remaining]);
    expect(saved.lots[0].image_indexes).toEqual([1]);
    expect(saved.deleted_image_indexes).toEqual([]);
    expect(saved.deleted_image_urls).toEqual([selected]);
    expect(saved.lots[1]).toMatchObject(secondLot);
    view.unmount();
    render(<Component {...props} />);
    await waitFor(() => {
      const sources = [...document.body.querySelectorAll("img")].map((image) => image.getAttribute("src"));
      expect(sources).toContain(remaining);
      expect(sources).toContain(other);
      expect(sources).not.toContain(selected);
      expect(sources).not.toContain(old);
    });
  });
});
