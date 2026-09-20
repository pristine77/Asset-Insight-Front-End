import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AuctioneerSpecsEditor from "./AuctioneerSpecsEditor";

const baseProps = {
  lot: {
    title: "Mack Dump Truck",
    categories: "Trucks",
    specifications: [],
  },
  lotIndex: 0,
  specsByCategory: new Map(),
  onChange: vi.fn(),
  onDelete: vi.fn(),
  includeDamageAnalysis: true,
  damageAnalysis: "",
  onDamageAnalysisChange: vi.fn(),
};

describe("AuctioneerSpecsEditor Damage Analysis policy", () => {
  it("renders the Damages editor for an eligible lot", () => {
    render(<AuctioneerSpecsEditor {...baseProps} damageEligible />);

    expect(screen.getByText("Damages")).toBeInTheDocument();
    expect(screen.queryByText("Damage Analysis not required")).not.toBeInTheDocument();
  });

  it("renders the corrected exclusion notice for a lot above 1000", () => {
    render(<AuctioneerSpecsEditor {...baseProps} damageEligible={false} />);

    expect(screen.getByText("Damage Analysis not required")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This lot is above 1000, so Damage Analysis is excluded from the report and generated files."
      )
    ).toBeInTheDocument();
  });
});
