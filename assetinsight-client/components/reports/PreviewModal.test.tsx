import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewModal from "./PreviewModal";

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

vi.mock("@/services/assets", () => ({
  getPreviewData: vi.fn(),
  updatePreviewData: vi.fn(),
  submitForApproval: mocks.submitForApproval,
  getSubmittedPreviewData: vi.fn(),
  resubmitReport: vi.fn(),
  getAssetCategorySpecs: mocks.getAssetCategorySpecs,
  refreshAssetSpecPdf: vi.fn(),
  uploadPreviewLotImages: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: {
    reverseGeocode: mocks.reverseGeocode,
  },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    promotePreview: mocks.promoteDraftPreview,
  },
}));

function makePreviewResponse() {
  return {
    data: {
      status: "preview",
      grouping_mode: "single_lot",
      image_count: 0,
      imageUrls: [],
      preview_data: {
        client_name: "Test Client",
        location: "Test Yard, London",
        currency: "USD",
        grouping_mode: "single_lot",
        valuation_methods: ["FML", "TKV", "OLV", "FLV"],
        valuation_data: {
          methods: [
            { method: "FML", fullName: "Fair Market Value", percentage: 100 },
            { method: "TKV", fullName: "Trade Value", percentage: 70 },
            {
              method: "OLV",
              fullName: "Orderly Liquidation Value",
              percentage: 77,
            },
            {
              method: "FLV",
              fullName: "Forced Liquidation Value",
              percentage: 52,
            },
          ],
        },
        lots: [
          {
            lot_number: "1",
            title: "Ford Super Duty",
            categories: "Emergency Vehicles",
            description: "Mobile treatment centre",
            details: "4WD with treatment equipment",
            estimated_value: "US$42,000",
            mixed_group_index: 1,
            sub_mode: "single_lot",
            image_indices: [],
            extra_image_urls: [],
            condition_report_specs: {},
          },
        ],
      },
    },
  };
}

describe("PreviewModal valuation methods", () => {
  it("resubmits a failed saved Asset preview instead of calling the preview-only submit endpoint", async () => {
    const response = makePreviewResponse();
    response.data.status = "error";
    const retry = vi.fn().mockResolvedValue({ status: "processing", files_generating: true });
    render(<PreviewModal isOpen reportId="failed-asset" onClose={vi.fn()}
      loadPreviewDataOverride={vi.fn().mockResolvedValue(response)} resubmitReportOverride={retry} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("saved preview is available");
    fireEvent.click(screen.getByRole("button", { name: "Resubmit report" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(retry.mock.calls[0][0]).toBe("failed-asset");
    expect(mocks.submitForApproval).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    mocks.getAssetCategorySpecs.mockReset();
    mocks.getAssetCategorySpecs.mockResolvedValue({ categories: [], specs: [] });
    mocks.reverseGeocode.mockReset();
    mocks.reverseGeocode.mockResolvedValue({
      location: "10 Downing Street, London, United Kingdom",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    });
    mocks.promoteDraftPreview.mockReset().mockResolvedValue({
      reportId: "promoted-report-1",
      reportType: "asset",
      status: "pending_approval",
      files_generating: true,
    });
    mocks.submitForApproval.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads for a mode switch and ignores the older in-flight preview", async () => {
    const olderRequest = deferred<ReturnType<typeof makePreviewResponse>>();
    const submittedResponse = makePreviewResponse();
    submittedResponse.data.status = "pending_approval";
    submittedResponse.data.preview_data.client_name = "Submitted snapshot";
    const loadPreview = vi
      .fn()
      .mockReturnValueOnce(olderRequest.promise)
      .mockResolvedValueOnce(submittedResponse);
    const onClose = vi.fn();

    const { rerender } = render(
      <PreviewModal
        isOpen
        reportId="asset-mode-switch"
        isResubmitMode={false}
        onClose={onClose}
        loadPreviewDataOverride={loadPreview}
      />
    );
    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(1));

    rerender(
      <PreviewModal
        isOpen
        reportId="asset-mode-switch"
        isResubmitMode
        onClose={onClose}
        loadPreviewDataOverride={loadPreview}
      />
    );

    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByDisplayValue("Submitted snapshot")).not.toHaveLength(0);

    const olderResponse = makePreviewResponse();
    olderResponse.data.preview_data.client_name = "Older preview snapshot";
    olderRequest.resolve(olderResponse);
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Older preview snapshot")).toBeNull();
      expect(screen.getAllByDisplayValue("Submitted snapshot")).not.toHaveLength(0);
    });
  });

  it("renders every selected method and recalculates each lot value from the editable base", async () => {
    render(
      <PreviewModal
        isOpen
        reportId="report-1"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    expect(
      await screen.findByRole("heading", { name: "Assets / Lots" })
    ).toBeInTheDocument();

    const methodGroups = screen.getAllByLabelText(
      "Selected valuation methods for lot 1"
    );
    const valueGroups = screen.getAllByLabelText(
      "Valuation method values for lot 1"
    );
    expect(methodGroups).toHaveLength(1);
    expect(valueGroups).toHaveLength(1);

    for (const method of ["FML", "TKV", "OLV", "FLV"]) {
      expect(within(methodGroups[0]).getByText(method)).toBeInTheDocument();
    }
    for (const value of [
      "US$42,000",
      "US$29,400",
      "US$32,340",
      "US$21,840",
    ]) {
      expect(within(valueGroups[0]).getByText(value)).toBeInTheDocument();
    }

    const baseFields = screen.getAllByRole("textbox", {
      name: "Base market value for lot 1",
    });
    expect(baseFields).toHaveLength(1);
    fireEvent.change(baseFields[0], { target: { value: "US$50,000" } });

    await waitFor(() => {
      expect(within(valueGroups[0]).getByText("US$35,000")).toBeInTheDocument();
    });
  });

  it("renders only the compact lot editor on mobile viewports", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(min-width: 768px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    render(
      <PreviewModal
        isOpen
        reportId="report-mobile"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    expect(
      await screen.findByLabelText("Selected valuation methods for lot 1")
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Selected valuation methods for lot 1")
    ).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "Base market value for lot 1" })
    ).toBeInTheDocument();
  });

  it("applies each required group only to lots 4, 8, and 9 of 100 and preserves individual overrides after save/reopen", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 100 }, (_, index) => ({
      ...response.data.preview_data.lots[0],
      lot_number: String(index + 1),
      title: `Asset ${index + 1}`,
      condition_report_selections: { condition: "N/A", completeness: "N/A", legal: "" },
    }));
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
    }));

    const view = render(
      <PreviewModal
        isOpen
        reportId="report-selected-lots"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    await screen.findByDisplayValue("Asset 1");
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    const applyControl = screen.getByRole("group", {
      name: "Apply Legal value to selected lots",
    });
    expect(saveButton).toBeDisabled();
    expect(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 0 selected lots",
      })
    ).toBeDisabled();

    for (const lotNumber of [4, 8, 9]) {
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: `Select lot ${lotNumber}, row ${lotNumber}`,
        })
      );
    }

    expect(
      screen.getByText(
        "3 of 100 lots selected. Apply a value below or adjust any lot individually."
      )
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.click(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 3 selected lots",
      })
    );
    expect(saveButton).toBeEnabled();

    for (const [group, option] of [["Running Condition", "Starts and Runs with Boost"], ["Completeness", "Has Keys"]]) {
      fireEvent.click(within(screen.getByRole("group", { name: `Apply ${group} value to selected lots` })).getByRole("button", { name: `Apply ${option} to 3 selected lots` }));
    }
    expect(screen.getByRole("combobox", { name: "Legal for lot 1, row 1" })).toHaveValue("");
    for (const index of [3, 7, 8]) {
      expect(
        screen.getByRole("combobox", { name: `Legal for lot ${index + 1}, row ${index + 1}` })
      ).toHaveValue("N/A");
    }

    fireEvent.change(screen.getByRole("combobox", { name: "Legal for lot 8, row 8" }), { target: { value: "No Title" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Running Condition for lot 4, row 4" }), { target: { value: "Does not Start or Run" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Completeness for lot 9, row 9" }), { target: { value: "Missing Parts" } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(
      savedPreview.lots.map(
        (lot: any) => lot.condition_report_selections?.legal || ""
      )
    ).toEqual(Array.from({ length: 100 }, (_, index) => index === 7 ? "No Title" : [3, 8].includes(index) ? "N/A" : ""));
    for (let index = 0; index < 100; index += 1) {
      expect(savedPreview.lots[index].condition_report_selections.condition).toBe(index === 3 ? "Does not Start or Run" : [7, 8].includes(index) ? "Starts and Runs with Boost" : "N/A");
      expect(savedPreview.lots[index].condition_report_selections.completeness).toBe(index === 8 ? "Missing Parts" : [3, 7].includes(index) ? "Has Keys" : "N/A");
      for (const key of ["lot_number", "description", "details", "image_indices", "extra_image_urls"]) expect(savedPreview.lots[index][key]).toEqual((response.data.preview_data.lots[index] as any)[key]);
    }
    expect(savedPreview.lots[3].condition_report_specs["Running Condition"]).toBe("Does not Start or Run");
    await waitFor(() => {
      expect(
        screen.getByText("Select the lots that should receive the same required selections.")
      ).toBeInTheDocument();
    });
    expect(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 0 selected lots",
      })
    ).toBeDisabled();
    view.unmount();
    render(<PreviewModal isOpen reportId="report-selected-lots" onClose={vi.fn()} loadPreviewDataOverride={vi.fn().mockResolvedValue({ data: { ...response.data, preview_data: savedPreview } })} />);
    expect(await screen.findByRole("combobox", { name: "Running Condition for lot 4, row 4" })).toHaveValue("Does not Start or Run");
    expect(screen.getByRole("combobox", { name: "Completeness for lot 9, row 9" })).toHaveValue("Missing Parts");
    expect(screen.getByRole("combobox", { name: "Legal for lot 8, row 8" })).toHaveValue("No Title");
    expect(screen.getByRole("checkbox", { name: "Select lot 8, row 8" })).not.toBeChecked();
  }, 20_000);

  it("pages large reports, preserves focus, and selects every off-page lot", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 205 }, (_, index) => ({
      ...response.data.preview_data.lots[0],
      lot_number: String(index + 1),
      title: `Asset ${index + 1}`,
      condition_report_selections: {
        legal: index === 0 ? "No Title" : "",
      },
    }));
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
    }));

    render(
      <PreviewModal
        isOpen
        reportId="report-large"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    const firstTitle = await screen.findByDisplayValue("Asset 1");
    expect(screen.queryByDisplayValue("Asset 21")).toBeNull();
    expect(screen.getByText("Showing 1–20 of 205 lots")).toBeInTheDocument();

    firstTitle.focus();
    fireEvent.change(firstTitle, { target: { value: "Focused asset" } });
    expect(firstTitle).toHaveFocus();

    const selectionControl = screen.getByRole("group", {
      name: "Select lots for bulk required selections",
    });
    fireEvent.click(
      within(selectionControl).getByRole("button", {
        name: "Select all 205 lots",
      })
    );
    expect(
      screen.getByText(
        "205 of 205 lots selected. Apply a value below or adjust any lot individually."
      )
    ).toBeInTheDocument();

    const applyControl = screen.getByRole("group", {
      name: "Apply Legal value to selected lots",
    });
    fireEvent.click(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 205 selected lots",
      })
    );
    const firstLegalControl = screen.getByRole("combobox", { name: "Legal for lot 1, row 1" });
    expect(firstLegalControl).toHaveValue("N/A");

    fireEvent.change(firstLegalControl, { target: { value: "No Title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(savedPreview.lots[0].condition_report_selections.legal).toBe("No Title");
    expect(savedPreview.lots[204].condition_report_selections.legal).toBe("N/A");
    expect(
      screen.getByText("Select the lots that should receive the same required selections.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next lots page" }));
    expect(await screen.findByDisplayValue("Asset 21")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Focused asset")).toBeNull();
  });

  it("preserves selected lots across pages, applies page/all groups, and clears without changing values", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 100 }, (_, index) => ({ ...response.data.preview_data.lots[0], lot_number: String(index + 1), title: `Asset ${index + 1}` }));
    const update = vi.fn().mockImplementation(async (_id, data) => ({ message: "Saved", data }));
    render(<PreviewModal isOpen reportId="page-selections" onClose={vi.fn()} loadPreviewDataOverride={vi.fn().mockResolvedValue(response)} updatePreviewDataOverride={update} />);
    await screen.findByDisplayValue("Asset 1");
    for (const label of ["Running Condition", "Completeness", "Legal"]) {
      expect(within(screen.getByRole("group", { name: `Apply ${label} value to selected lots` })).getByRole("button", { name: "Apply N/A to 0 selected lots" })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Select lot 4, row 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Next lots page" }));
    fireEvent.click(screen.getByRole("button", { name: "Select 20 lots on this page" }));
    expect(screen.getByText("21 of 100 lots selected. Apply a value below or adjust any lot individually.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Apply Running Condition value to selected lots" })).getByRole("button", { name: "Apply Unverified Running Condition to 21 selected lots" }));
    fireEvent.click(screen.getByRole("button", { name: "Unselect 20 lots on this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous lots page" }));
    expect(screen.getByRole("checkbox", { name: "Select lot 4, row 4" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Select all 100 lots" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Apply Completeness value to selected lots" })).getByRole("button", { name: "Apply Incomplete Unit to 100 selected lots" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Running Condition for lot 4, row 4" })).toHaveValue("Unverified Running Condition");
    expect(screen.getByRole("combobox", { name: "Completeness for lot 1, row 1" })).toHaveValue("Incomplete Unit");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const lots = update.mock.calls[0][1].lots;
    lots.forEach((lot: any, index: number) => {
      expect(lot.condition_report_selections.completeness).toBe("Incomplete Unit");
      expect(lot.condition_report_selections.condition || "").toBe(index === 3 || (index >= 20 && index < 40) ? "Unverified Running Condition" : "");
      expect(lot.condition_report_selections.legal).toBeUndefined();
    });
  }, 20_000);

  it.each([0, 1])("handles %i lots without bulk controls and keeps single-lot overrides available", async (count) => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = response.data.preview_data.lots.slice(0, count);
    render(<PreviewModal isOpen reportId={`lot-count-${count}`} onClose={vi.fn()} loadPreviewDataOverride={vi.fn().mockResolvedValue(response)} />);
    await screen.findByRole("heading", { name: "Assets / Lots" });
    expect(screen.queryByRole("region", { name: "Bulk required selections" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Select lot/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Asset lots pagination" })).toBeNull();
    if (count === 1) for (const label of ["Running Condition", "Completeness", "Legal"]) {
      const field = screen.getByRole("combobox", { name: `${label} for lot 1, row 1` });
      fireEvent.change(field, { target: { value: "N/A" } });
      expect(field).toHaveValue("N/A");
    }
  });

  it("clears transient selection on lot insertion, deletion and explicit reload", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 3 }, (_, index) => ({ ...response.data.preview_data.lots[0], lot_number: String(index + 1) }));
    const load = vi.fn().mockResolvedValue(response);
    const view = render(<PreviewModal isOpen reportId="structure-selection" onClose={vi.fn()} loadPreviewDataOverride={load} />);
    await screen.findByRole("heading", { name: "Assets / Lots" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select lot 2, row 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lot" }));
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select lot 2, row 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete lot 1" }));
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select lot 2, row 1" }));
    view.rerender(<PreviewModal isOpen={false} reportId="structure-selection" onClose={vi.fn()} loadPreviewDataOverride={load} />);
    view.rerender(<PreviewModal isOpen reportId="structure-selection" onClose={vi.fn()} loadPreviewDataOverride={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled());
  });

  it("saves the selected appraiser cover images in the chosen order", async () => {
    const response: any = makePreviewResponse();
    const coverImages = [
      "https://images.test/cover-one.jpg",
      "https://images.test/cover-two.jpg",
      "https://images.test/cover-three.jpg",
    ];
    response.data.imageUrls = coverImages;
    response.data.image_count = coverImages.length;
    Object.assign(response.data.preview_data.lots[0], {
      image_urls: coverImages.slice(0, 2),
      image_indexes: [0, 1],
    });
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
      imageUrls: coverImages,
    }));

    render(
      <PreviewModal
        isOpen
        reportId="report-cover"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Select cover images" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Select cover image 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Select cover image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply cover images" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(updatePreview.mock.calls[0][1].cover_image_urls).toEqual([
      coverImages[1],
      coverImages[0],
    ]);
    expect(screen.getByText("2 of 4 cover images selected.")).toBeInTheDocument();
  });

  it("resolves a legacy coordinate-only preview before showing a location", async () => {
    const response = makePreviewResponse();
    Object.assign(response.data.preview_data, {
      location: "Current Browser Location",
      latitude: 51.503407,
      longitude: -0.127592,
    });

    render(
      <PreviewModal
        isOpen
        reportId="report-location"
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
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(
      { latitude: 51.503407, longitude: -0.127592 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("clears stale report and inherited lot coordinates after a manual location edit", async () => {
    const response = makePreviewResponse();
    Object.assign(response.data.preview_data, {
      location: "Old Inspection Yard",
      latitude: 50.1,
      longitude: -104.2,
    });
    Object.assign(response.data.preview_data.lots[0], {
      location: "Old Inspection Yard",
      latitude: 50.1,
      longitude: -104.2,
    });
    const updatePreview = vi.fn().mockResolvedValue({
      message: "Saved",
      data: response.data.preview_data,
    });

    render(
      <PreviewModal
        isOpen
        reportId="report-manual-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshAssetSpecPdfOverride={vi.fn().mockResolvedValue({
          message: "Refreshed",
          data: { spec_pdf: "https://example.test/cr.pdf" },
        })}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    fireEvent.change(location, { target: { value: "New Inspection Yard" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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

  it("promotes and submits a draft from the exact edited preview snapshot", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <PreviewModal
        isOpen
        reportId="hidden-report-1"
        draftPreviewId="draft-1"
        onClose={onClose}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Edited Draft Client" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft preview and submit report",
      })
    );

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "draft-1",
        expect.objectContaining({
          submit: true,
          preview_data: expect.objectContaining({
            client_name: "Edited Draft Client",
          }),
        })
      )
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "promoted-report-1",
        reportId: "promoted-report-1",
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves draft edits without generating partial hidden CR files", async () => {
    const response = makePreviewResponse();
    const updatePreview = vi.fn().mockResolvedValue({
      message: "Saved",
      data: response.data.preview_data,
    });
    const refreshSpecPdf = vi.fn();

    render(
      <PreviewModal
        isOpen
        reportId="hidden-report-save-only"
        draftPreviewId="draft-save-only"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshAssetSpecPdfOverride={refreshSpecPdf}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Saved Draft Client" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(mocks.promoteDraftPreview).not.toHaveBeenCalled();
  });

  it("serializes Save and Resubmit without starting a second client regeneration", async () => {
    const response = makePreviewResponse();
    response.data.status = "approved";
    const pendingSave = deferred<{
      message: string;
      data: typeof response.data.preview_data;
      files_regeneration_queued?: boolean;
    }>();
    const updatePreview = vi.fn().mockReturnValue(pendingSave.promise);
    const resubmit = vi.fn();
    const uploadImages = vi.fn();
    const refreshSpecPdf = vi.fn();
    const onClose = vi.fn();

    render(
      <PreviewModal
        isOpen
        reportId="approved-exclusive-save"
        onClose={onClose}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        resubmitReportOverride={resubmit}
        uploadPreviewLotImagesOverride={uploadImages}
        refreshAssetSpecPdfOverride={refreshSpecPdf}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Locked Client" } });
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    const resubmitButton = screen.getByRole("button", { name: "Resubmit report" });

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
      message: "Saved",
      data: response.data.preview_data,
      files_regeneration_queued: true,
    });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(resubmitButton).toBeDisabled();
  });

  it("keeps the server-normalized preview after Save when no newer edit exists", async () => {
    const response = makePreviewResponse();
    Object.assign(response.data.preview_data, {
      latitude: 51.5007,
      longitude: -0.1246,
    });
    Object.assign(response.data.preview_data.lots[0], {
      location: "Test Yard, London",
      latitude: 51.5007,
      longitude: -0.1246,
    });
    const canonicalPreview = JSON.parse(JSON.stringify({
      ...response.data.preview_data,
      client_name: "Canonical Client",
      location: "Canonical Asset Yard",
      lots: [
        {
          ...response.data.preview_data.lots[0],
          title: "Canonical server title",
          location: "Canonical Asset Yard",
          latitude: undefined,
          longitude: undefined,
        },
      ],
      latitude: undefined,
      longitude: undefined,
    }));
    const updatePreview = vi.fn().mockResolvedValue({
      message: "Saved",
      data: canonicalPreview,
    });
    mocks.submitForApproval.mockResolvedValue({
      message: "Submitted",
      data: { reportId: "asset-canonical-save" },
    });

    render(
      <PreviewModal
        isOpen
        reportId="asset-canonical-save"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Edited locally" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Inspection Location *" })).toHaveValue(
        "Canonical Asset Yard"
      );
      expect(screen.getByDisplayValue("Canonical Client")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(mocks.submitForApproval).toHaveBeenCalledTimes(1));
    const submittedPreview = mocks.submitForApproval.mock.calls[0]?.[1];
    expect(submittedPreview).toMatchObject({
      client_name: "Canonical Client",
      location: "Canonical Asset Yard",
      lots: [
        expect.objectContaining({
          title: "Canonical server title",
          location: "Canonical Asset Yard",
        }),
      ],
    });
    expect(submittedPreview).not.toHaveProperty("latitude");
    expect(submittedPreview).not.toHaveProperty("longitude");
    expect(submittedPreview.lots[0]).not.toHaveProperty("latitude");
    expect(submittedPreview.lots[0]).not.toHaveProperty("longitude");
  });

  it("submits a dirty preview snapshot once without requiring a file-generating Save", async () => {
    const pendingSubmit = deferred<{
      message: string;
      data: { reportId: string };
    }>();
    const onClose = vi.fn();
    mocks.submitForApproval.mockReturnValue(pendingSubmit.promise);

    render(
      <PreviewModal
        isOpen
        reportId="initial-submit-lock"
        onClose={onClose}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Final Snapshot Client" } });
    const submitButton = screen.getByRole("button", { name: "Submit report" });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(mocks.submitForApproval).toHaveBeenCalledTimes(1);
    expect(mocks.submitForApproval).toHaveBeenCalledWith(
      "initial-submit-lock",
      expect.objectContaining({ client_name: "Final Snapshot Client" })
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeDisabled();

    pendingSubmit.resolve({
      message: "Submitted",
      data: { reportId: "initial-submit-lock" },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps an approved hidden draft on the promotion path when saving and resubmitting", async () => {
    const onSuccess = vi.fn();
    const approvedPreview = makePreviewResponse();
    approvedPreview.data.status = "approved";

    render(
      <PreviewModal
        isOpen
        reportId="hidden-approved-report"
        draftPreviewId="approved-draft"
        onClose={vi.fn()}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(approvedPreview)}
      />
    );

    await screen.findByRole("heading", { name: "Assets / Lots" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft preview and submit report",
      })
    );

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "approved-draft",
        expect.objectContaining({ submit: true })
      )
    );
    expect(screen.getAllByText("Save & Resubmit")).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "promoted-report-1" })
    );
  });
});
