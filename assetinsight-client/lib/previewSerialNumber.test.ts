import { describe, expect, it } from "vitest";
import { applyPrimarySerialEdit } from "./previewSerialNumber";

describe("preview serial editing", () => {
  it("removes primary aliases while preserving unrelated serial fields", () => {
    const lot = applyPrimarySerialEdit(
      {
        serial_number: "OLD-123",
        sn_vin: "OLD-123",
        condition_report_specs: {
          VIN: "OLD-123",
          "Engine Serial Number": "ENGINE-456",
        },
      },
      ""
    );

    expect(lot.serial_number).toBe("");
    expect(lot.sn_vin).toBe("");
    expect(lot.condition_report_specs).toEqual({
      "Engine Serial Number": "ENGINE-456",
    });
    expect(lot.condition_report_specs_deleted).toEqual(["Serial Number"]);
  });

  it("allows a serial to be entered again after it was deleted", () => {
    const lot = applyPrimarySerialEdit(
      {
        serial_number: "",
        condition_report_specs_deleted: ["Serial Number", "Colour"],
      },
      "NEW-789"
    );

    expect(lot.serial_number).toBe("NEW-789");
    expect(lot.condition_report_specs).toEqual({
      "Serial Number": "NEW-789",
    });
    expect(lot.condition_report_specs_deleted).toEqual(["Colour"]);
  });
});
