import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ColumnTotalsFooter, MobileColumnTotals } from "./ColumnTotals";
import { formatMoney, type ProposalValuationColumnTotals } from "./calculations";

it("shows identical two-decimal currency totals on desktop and mobile without changing row formatting", () => {
  const totals: ProposalValuationColumnTotals = {
    lotCount: 1,
    evaluators: [{ id: "riley", name: "Riley", total: 24833.333333333 }],
    average: 24833.333333333,
    low: 24800.125,
    high: 25000,
    buyerPremium: 2000,
  };
  render(<><table><ColumnTotalsFooter totals={totals} currency="USD" /></table><MobileColumnTotals totals={totals} currency="USD" /></>);
  const footer = screen.getByRole("rowgroup", { name: "All-lot valuation totals" });
  expect(within(footer).getByLabelText("Riley total for all lots")).toHaveTextContent("US$24,833.33");
  expect(within(footer).getByLabelText("Average total for all lots")).toHaveTextContent("US$24,833.33");
  expect(within(footer).getByLabelText("Low total for all lots")).toHaveTextContent("US$24,800.13");
  expect(within(footer).getByLabelText("Buyer premium total for all lots")).toHaveTextContent("US$2,000.00");
  const mobile = screen.getByRole("region", { name: "All-lot valuation totals" });
  expect(within(mobile).getAllByText("US$24,833.33")).toHaveLength(2);
  expect(within(mobile).getByText("US$24,800.13")).toBeInTheDocument();
  expect(formatMoney(totals.average, "USD")).toBe("US$24,833");
});
