import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetReport } from "@/services/assets";
import type { LotListing } from "@/services/lotListing";
import ReportsPage from "./page";

const mocks = vi.hoisted(() => ({
  getMyReports: vi.fn(),
  getAssetReports: vi.fn(),
  getRealEstateReports: vi.fn(),
  getSalvageReports: vi.fn(),
  getLotListings: vi.fn(),
  getDeliveries: vi.fn(),
  deleteReport: vi.fn(),
  downloadReport: vi.fn(),
  downloadCr: vi.fn(),
  downloadCrDocx: vi.fn(),
  deleteAssetReport: vi.fn(),
  resubmitReport: vi.fn(),
  deleteLotListing: vi.fn(),
  resubmitLotListing: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    function DeferredDialog() {
      return null;
    }
    return DeferredDialog;
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: {
      _id: "user-1",
      proposalValuationEnabled: true,
    },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/services/reports", () => ({
  ReportsService: {
    getMyReports: mocks.getMyReports,
    deleteReport: mocks.deleteReport,
    downloadReport: mocks.downloadReport,
    downloadCr: mocks.downloadCr,
    downloadCrDocx: mocks.downloadCrDocx,
  },
}));

vi.mock("@/services/assets", () => ({
  getAssetReports: mocks.getAssetReports,
  deleteAssetReport: mocks.deleteAssetReport,
  resubmitReport: mocks.resubmitReport,
}));

vi.mock("@/services/realEstate", () => ({
  RealEstateService: {
    getReports: mocks.getRealEstateReports,
    deleteReport: vi.fn(),
  },
}));
vi.mock("@/services/salvage", async (original) => ({
  ...await original<typeof import("@/services/salvage")>(),
  SalvageService: { getReports: mocks.getSalvageReports },
}));

vi.mock("@/services/lotListing", () => ({
  getLotListings: mocks.getLotListings,
  deleteLotListing: mocks.deleteLotListing,
  resubmitLotListing: mocks.resubmitLotListing,
}));

vi.mock("@/services/auctioneer", () => ({
  default: {
    getDeliveries: mocks.getDeliveries,
  },
}));

const thumbnailUrl =
  "https://cdn.example.test/reports/cv-thumb-100.webp";

const reportWithThumbnail: AssetReport = {
  _id: "asset-thumbnail",
  user: "user-1",
  grouping_mode: "lot",
  imageUrls: [],
  status: "approved",
  lots: [
    {
      lot_number: "7",
      image_urls: [thumbnailUrl],
      estimated_value: "25000",
    },
  ],
  client_name: "Northfield Plant Ltd",
  contract_no: "CV-THUMB-100",
  preview_files: {
    pdf: "/files/cv-thumb-100.pdf",
    spec_pdf: "/files/cv-thumb-100-cr.pdf",
    cr_docx: "/files/cv-thumb-100-cr.docx",
    docx: "/files/cv-thumb-100.docx",
    excel: "/files/cv-thumb-100.xlsx",
    images: "/files/cv-thumb-100.zip",
  },
  createdAt: "2026-08-02T09:00:00.000Z",
  updatedAt: "2026-08-02T09:30:00.000Z",
};

const reportWithoutThumbnail: AssetReport = {
  ...reportWithThumbnail,
  _id: "asset-no-thumbnail",
  imageUrls: [],
  lots: [{ lot_number: "8", estimated_value: "9000" }],
  client_name: "No Image Client",
  contract_no: "CV-NO-IMAGE",
  preview_files: {
    pdf: "/files/cv-no-image.pdf",
  },
};

const previewReadyAsset: AssetReport = {
  ...reportWithThumbnail,
  _id: "asset-preview-ready",
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "queued",
  files_generating: false,
  client_name: "Preview Asset Client",
  contract_no: "CV-ASSET-PREVIEW",
  preview_files: undefined,
};

const previewReadyLotListing: LotListing = {
  _id: "lot-preview-ready",
  user: "user-1",
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "processing",
  files_generating: false,
  details: {
    contract_no: "CV-LOT-PREVIEW",
    currency: "GBP",
  },
  lots: [
    {
      lot_id: "lot-1",
      lot_number: "1",
      image_indexes: [],
      estimated_value: "18000",
    },
  ],
  imageUrls: [],
  createdAt: "2026-08-02T10:00:00.000Z",
  updatedAt: "2026-08-02T10:30:00.000Z",
};

class ImmediatelyIntersectingObserver {
  readonly root = null;
  readonly rootMargin = "320px 0px";
  readonly thresholds = [0.01];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe = (target: Element) => {
    this.callback(
      [
        {
          isIntersecting: true,
          target,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  };

  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

describe("My Reports thumbnails", () => {
  beforeEach(() => {
    mocks.getMyReports.mockReset().mockResolvedValue([]);
    mocks.getAssetReports
      .mockReset()
      .mockResolvedValue({
        message: "ok",
        data: [reportWithThumbnail, reportWithoutThumbnail],
      });
    mocks.getRealEstateReports.mockReset().mockResolvedValue({ data: [] });
    mocks.getSalvageReports.mockReset().mockResolvedValue({ data: [] });
    mocks.getLotListings.mockReset().mockResolvedValue({ data: [] });
    mocks.getDeliveries.mockReset().mockResolvedValue([]);
    mocks.downloadReport.mockReset();
    mocks.downloadCr.mockReset();
    mocks.downloadCrDocx.mockReset();
    mocks.routerPush.mockReset();
    mocks.resubmitLotListing.mockReset().mockResolvedValue({});
    vi.stubGlobal("IntersectionObserver", ImmediatelyIntersectingObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["approved", "error", "preview"] as const)("shows a failed Lot Listing's actual error despite old files and status %s", async (status) => {
    mocks.getAssetReports.mockResolvedValue({ data: [] });
    mocks.getLotListings.mockResolvedValue({ data: [{
      ...previewReadyLotListing, status,
      workflow_stage: "error", generation_state: "error", downloadable: false,
      job_error: "Photo archive could not be generated",
      preview_files: { excel: "/old.xlsx", images: "/old.zip" },
    }] });
    render(<ReportsPage />);
    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /CV-LOT-PREVIEW/ });
    expect(within(row).getByText("Photo archive could not be generated")).toBeInTheDocument();
    expect(screen.queryByText("Files available after release")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Preview Lot Listing report/ })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("Photo archive could not be generated")).toBeInTheDocument();

    let finishRetry!: () => void;
    mocks.resubmitLotListing.mockReturnValueOnce(new Promise<void>((resolve) => { finishRetry = resolve; }));
    const retry = within(row).getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(mocks.resubmitLotListing).toHaveBeenCalledTimes(1);
    expect(mocks.resubmitLotListing).toHaveBeenCalledWith("lot-preview-ready");
    expect(retry).toBeDisabled();
    mocks.getLotListings.mockResolvedValue({ data: [{
      ...previewReadyLotListing, workflow_stage: "generating_files", downloadable: false,
      workflow_message: "Generating updated files", files_generating: true,
    }] });
    finishRetry();
    await waitFor(() => expect(within(row).getByText("Generating updated files")).toBeInTheDocument());
    expect(within(row).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps Asset release gates while explaining automatic Lot Listing release", async () => {
    mocks.getAssetReports.mockResolvedValue({ data: [{
      ...reportWithThumbnail, workflow_stage: "awaiting_release", downloadable: false,
    }] });
    mocks.getLotListings.mockResolvedValue({ data: [{
      ...previewReadyLotListing, status: "approved", workflow_stage: "awaiting_release",
      generation_state: "ready", downloadable: false,
      preview_files: { excel: "/old.xlsx", images: "/old.zip" },
    }] });
    render(<ReportsPage />);
    const table = await screen.findByRole("table", { name: "Generated reports" });
    const asset = within(table).getByRole("row", { name: /CV-THUMB-100/ });
    const lot = within(table).getByRole("row", { name: /CV-LOT-PREVIEW/ });
    expect(within(asset).getByText("Approved; awaiting release")).toBeInTheDocument();
    expect(within(lot).getByText(/Lot Listings release automatically/)).toBeInTheDocument();
    expect(within(lot).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });

  it("shows legacy error_message when no canonical workflow state is available", async () => {
    mocks.getAssetReports.mockResolvedValue({ data: [] });
    mocks.getLotListings.mockResolvedValue({ data: [{
      ...previewReadyLotListing, status: "error", workflow_stage: undefined, generation_state: undefined,
      error_message: "Unable to publish report files", downloadable: false,
    }] });
    render(<ReportsPage />);
    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /CV-LOT-PREVIEW/ });
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText("Unable to publish report files")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("wires a source thumbnail into both responsive report presentations", async () => {
    render(<ReportsPage />);

    expect(
      await screen.findByRole("heading", { name: "My reports" })
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAssetReports).toHaveBeenCalledTimes(1));

    const accessibleName =
      /Preview image for Asset Report CV-THUMB-100 — Northfield Plant Ltd/i;
    const mobileList = screen.getByRole("list");
    const desktopTable = screen.getByRole("table", {
      name: "Generated reports",
    });

    expect(
      await within(mobileList).findByRole("img", { name: accessibleName })
    ).toBeInTheDocument();
    expect(
      await within(desktopTable).findByRole("img", {
        name: accessibleName,
      })
    ).toBeInTheDocument();
  });

  it("keeps every rendered thumbnail lazy, asynchronously decoded, and low priority", async () => {
    render(<ReportsPage />);

    const thumbnails = await screen.findAllByRole("img", {
      name: /Preview image for Asset Report CV-THUMB-100 — Northfield Plant Ltd/i,
    });

    expect(thumbnails.length).toBeGreaterThan(0);
    for (const thumbnail of thumbnails) {
      expect(thumbnail).toHaveAttribute("src", thumbnailUrl);
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("decoding", "async");
      expect(thumbnail).toHaveAttribute("fetchpriority", "low");
    }
  });

  it("uses a non-network placeholder when a report has no image source", async () => {
    render(<ReportsPage />);

    expect(
      (
        await screen.findAllByLabelText(
          /No preview image available for Asset Report CV-NO-IMAGE — No Image Client/i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("img", {
        name: /Preview image for Asset Report CV-NO-IMAGE — No Image Client/i,
      })
    ).not.toBeInTheDocument();
  });

  it("exposes the responsive filter disclosure without hiding the desktop controls", async () => {
    render(<ReportsPage />);

    await screen.findByRole("heading", { name: "My reports" });
    const filterToggle = screen.getByRole("button", { name: /filters/i });
    expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("searchbox", { name: "Search reports" })).toBeInTheDocument();

    fireEvent.click(filterToggle);
    expect(filterToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("offers direct, report-specific preview actions for Asset and Lot Listing", async () => {
    mocks.getAssetReports.mockResolvedValue({
      message: "ok",
      data: [previewReadyAsset],
    });
    mocks.getLotListings.mockResolvedValue({
      data: [previewReadyLotListing],
    });
    render(<ReportsPage />);

    const assetActions = await screen.findAllByRole("button", {
      name: "Preview Asset report: Asset · CV-ASSET-PREVIEW",
    });
    const lotActions = await screen.findAllByRole("button", {
      name: "Preview Lot Listing report: Lot Listing · CV-LOT-PREVIEW",
    });
    expect(assetActions.length).toBeGreaterThan(0);
    expect(lotActions.length).toBeGreaterThan(0);

    fireEvent.click(assetActions[0]);
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/previews?reportId=asset-preview-ready&reportType=asset"
    );

    fireEvent.click(lotActions[0]);
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/previews?reportId=lot-preview-ready&reportType=lotListing"
    );
  });

  it("opens Proposal Valuation in its dedicated full-page route", async () => {
    render(<ReportsPage />);

    const actions = await screen.findAllByRole("button", {
      name: /Open Proposal Valuation for Asset .* CV-THUMB-100/i,
    });
    fireEvent.click(actions[0]);

    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/proposal-valuations/asset-thumbnail"
    );
  });

  it("keeps report files aligned and exposes every row action without an overflow menu", async () => {
    mocks.getDeliveries.mockResolvedValue([
      {
        workItemId: "delivery-work-item",
        reportId: reportWithThumbnail._id,
        reportModel: "AssetReport",
        reportType: "asset",
        contractNo: reportWithThumbnail.contract_no,
        state: "ready",
        canSend: true,
      },
    ]);
    render(<ReportsPage />);

    const desktopTable = await screen.findByRole("table", {
      name: "Generated reports",
    });
    const reportRow = within(desktopTable).getByRole("row", {
      name: /CV-THUMB-100/i,
    });
    const fileGroup = within(reportRow).getByRole("group", {
      name: "Available files for CV-THUMB-100",
    });
    const actionGroup = within(reportRow).getByRole("group", {
      name: /Actions for Asset .* CV-THUMB-100/i,
    });

    for (const label of [
      "Schedule A",
      "CR PDF",
      "CR DOCX",
      "Appraisal report",
      "XLSX",
      "ZIP",
    ]) {
      expect(
        within(fileGroup).getByRole("button", {
          name: `Download ${label}`,
        })
      ).toBeInTheDocument();
    }
    expect(
      within(actionGroup).getByRole("button", {
        name: /Preview Asset report/i,
      })
    ).toBeInTheDocument();
    expect(
      within(actionGroup).getByRole("button", {
        name: /Merge reports for Asset .* CV-THUMB-100/i,
      })
    ).toBeInTheDocument();
    expect(
      within(actionGroup).getByRole("button", {
        name: /Send for Asset .* CV-THUMB-100/i,
      })
    ).toBeInTheDocument();
    expect(
      within(actionGroup).getByRole("button", {
        name: /Delete report Asset .* CV-THUMB-100/i,
      })
    ).toBeInTheDocument();
    expect(
      within(reportRow).queryByRole("button", { name: /More actions/i })
    ).not.toBeInTheDocument();
  });

  it("downloads canonical Asset CR files without calling legacy report routes", async () => {
    const clickAnchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<ReportsPage />);

    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /CV-THUMB-100/i });
    const fileGroup = within(row).getByRole("group", {
      name: "Available files for CV-THUMB-100",
    });
    fireEvent.click(
      within(fileGroup).getByRole("button", { name: "Download CR PDF" })
    );
    fireEvent.click(
      within(fileGroup).getByRole("button", { name: "Download CR DOCX" })
    );

    expect(clickAnchor).toHaveBeenCalledTimes(2);
    expect(mocks.downloadCr).not.toHaveBeenCalled();
    expect(mocks.downloadCrDocx).not.toHaveBeenCalled();
  });

  it("uses every canonical artifact URL from a structured Asset aggregate", async () => {
    const clickAnchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    mocks.getAssetReports.mockResolvedValue({ message: "ok", data: [] });
    mocks.getMyReports.mockResolvedValue([
      {
        _id: "promoted-asset-report",
        filename: "Promoted Asset.docx",
        address: "Promoted Asset",
        fairMarketValue: "CAD 10,000",
        createdAt: "2026-08-04T09:00:00.000Z",
        type: "Asset",
        approvalStatus: "approved",
        downloadable: true,
        preview_files: {
          pdf: "https://cdn.example.test/promoted.pdf",
          spec_pdf: "https://cdn.example.test/promoted-cr.pdf",
          cr_docx: "https://cdn.example.test/promoted-cr.docx",
          docx: "https://cdn.example.test/promoted.docx",
          excel: "https://cdn.example.test/promoted.xlsx",
          images: "https://cdn.example.test/promoted.zip",
        },
      },
    ]);

    render(<ReportsPage />);

    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /Promoted Asset/i });
    const fileGroup = within(row).getByRole("group", {
      name: "Available files for Promoted Asset",
    });
    for (const label of [
      "Schedule A",
      "CR PDF",
      "CR DOCX",
      "Appraisal report",
      "XLSX",
      "ZIP",
    ]) {
      expect(
        within(fileGroup).getByRole("button", { name: `Download ${label}` })
      ).toBeInTheDocument();
    }

    fireEvent.click(
      within(fileGroup).getByRole("button", {
        name: "Download Appraisal report",
      })
    );
    expect(clickAnchor).toHaveBeenCalledTimes(1);
    expect(mocks.downloadReport).not.toHaveBeenCalled();
  });

  it("does not invent a legacy Appraisal download for a URL-less aggregate", async () => {
    mocks.getAssetReports.mockResolvedValue({ message: "ok", data: [] });
    mocks.getMyReports.mockResolvedValue([
      {
        _id: "hidden-aggregate-without-files",
        filename: "Hidden Draft.docx",
        address: "Hidden Draft",
        fairMarketValue: "CAD 0.00",
        createdAt: "2026-08-04T09:00:00.000Z",
        type: "Asset",
        approvalStatus: "approved",
        downloadable: true,
        preview_files: {},
      },
    ]);

    render(<ReportsPage />);

    await screen.findByRole("table", { name: "Generated reports" });
    expect(
      screen.queryByRole("button", { name: "Download Appraisal report" })
    ).not.toBeInTheDocument();
  });

  it("shows the generated Schedule A for a Lot Listing", async () => {
    mocks.getAssetReports.mockResolvedValue({ message: "ok", data: [] });
    mocks.getLotListings.mockResolvedValue({
      data: [
        {
          ...previewReadyLotListing,
          _id: "lot-with-schedule-a",
          status: "approved",
          details: { contract_no: "LOT-SCHEDULE-A", currency: "CAD" },
          preview_files: {
            schedule_a_pdf: "https://cdn.example.test/lot-schedule-a.pdf",
            excel: "https://cdn.example.test/lot.xlsx",
            images: "https://cdn.example.test/lot.zip",
          },
        },
      ],
    });

    render(<ReportsPage />);

    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /LOT-SCHEDULE-A/i });
    expect(
      within(row).getByRole("button", { name: "Download Schedule A" })
    ).toBeInTheDocument();
  });

  it("downloads canonical Lot Listing CR files without calling legacy report routes", async () => {
    const clickAnchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    mocks.getAssetReports.mockResolvedValue({ message: "ok", data: [] });
    mocks.getLotListings.mockResolvedValue({
      data: [
        {
          ...previewReadyLotListing,
          _id: "lot-canonical-cr",
          status: "approved",
          generation_state: "ready",
          files_generating: false,
          details: { contract_no: "LOT-CANONICAL-CR", currency: "CAD" },
          preview_files: {
            spec_pdf: "https://cdn.example.test/lot-cr.pdf",
            cr_docx: "https://cdn.example.test/lot-cr.docx",
          },
        },
      ],
    });

    render(<ReportsPage />);

    const table = await screen.findByRole("table", { name: "Generated reports" });
    const row = within(table).getByRole("row", { name: /LOT-CANONICAL-CR/i });
    const fileGroup = within(row).getByRole("group", {
      name: "Available files for LOT-CANONICAL-CR",
    });
    fireEvent.click(
      within(fileGroup).getByRole("button", { name: "Download CR PDF" })
    );
    fireEvent.click(
      within(fileGroup).getByRole("button", { name: "Download CR DOCX" })
    );

    expect(clickAnchor).toHaveBeenCalledTimes(2);
    expect(mocks.downloadCr).not.toHaveBeenCalled();
    expect(mocks.downloadCrDocx).not.toHaveBeenCalled();
  });
});
