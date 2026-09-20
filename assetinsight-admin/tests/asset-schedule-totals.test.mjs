import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  deriveAssetScheduleSummary,
  formatCurrencyCell,
  recalculateAssetScheduleSheet,
} from "../app/components/reports/assetScheduleSheetUtils.ts";

function sheet(values, evaluatorIds = ["riley", "femi", "jay"]) {
  return recalculateAssetScheduleSheet({
    evaluator_columns: evaluatorIds.map((id) => ({ id, name: id })),
    rows: values.map((evaluator_values, index) => ({
      lot_id: `lot-${index}`, asset_id: String(index + 1), evaluator_values,
      market_check: {},
    })),
    file_summary: {},
  });
}

test("all-lot totals sum each evaluator and existing per-row average, high, low and capped premium", () => {
  const data = sheet([
    { riley: 10000, femi: 20000, jay: null },
    { riley: 50000, femi: null, jay: 40000 },
    { riley: null, femi: null, jay: null },
  ]);
  const totals = deriveAssetScheduleSummary(data);
  assert.deepEqual(totals.evaluator_totals, { riley: 60000, femi: 20000, jay: 40000 });
  assert.equal(totals.total_asset_value, 60000); // 15000 + 45000, not mean of evaluator totals
  assert.equal(totals.total_low_est_value, 50000);
  assert.equal(totals.total_high_est_value, 70000);
  assert.equal(totals.total_capped_bp, 4000); // Sum of each capped amount, not cap of aggregate or sum of rates
  assert.equal(totals.capped.avg, totals.total_asset_value);
  assert.equal(totals.capped.low, totals.total_low_est_value);
  assert.equal(totals.capped.high, totals.total_high_est_value);
  assert.equal(totals.capped.bp, totals.total_capped_bp);
});

test("pagination cannot limit aggregates and every row contributes once", () => {
  const data = sheet(Array.from({ length: 26 }, (_, i) => ({ riley: i === 25 ? 1000 : 10 })), ["riley"]);
  const before = JSON.stringify(data);
  const totals = deriveAssetScheduleSummary(data);
  assert.equal(totals.evaluator_totals.riley, 1250);
  assert.equal(totals.total_asset_value, 1250);
  assert.equal(totals.total_capped_bp, 187.5);
  assert.equal(JSON.stringify(data), before, "totals must not mutate the saved sheet");
});

test("all-blank and empty sheets display zero totals without replacing blank row values", () => {
  for (const values of [[], [{}], [{ riley: null, femi: null, jay: null }]]) {
    const data = sheet(values);
    const totals = deriveAssetScheduleSummary(data);
    assert.deepEqual(totals.evaluator_totals, { riley: 0, femi: 0, jay: 0 });
    assert.equal(totals.total_asset_value, 0);
    assert.equal(totals.total_high_est_value, 0);
    assert.equal(totals.total_low_est_value, 0);
    assert.equal(totals.total_capped_bp, 0);
    if (data.rows.length) {
      assert.equal(data.rows[0].evaluator_values.riley, null);
      assert.equal(data.rows[0].high_est_sale_value, null);
      assert.equal(data.rows[0].buyer_premium_amount, null);
    }
  }
});

test("evaluator IDs, not names or removed entries, own totals", () => {
  const data = sheet([{ left: 12, right: 30, removed: 99999 }], ["right", "left", "new"]);
  data.evaluator_columns.forEach((column) => { column.name = "Same name"; });
  const totals = deriveAssetScheduleSummary(data);
  assert.deepEqual(totals.evaluator_totals, { right: 30, left: 12, new: 0 });
  assert.equal(totals.total_asset_value, 21);
  assert.equal(totals.total_high_est_value, 30);
});

test("precision is preserved until display, including explicit zero and existing negative-value formulas", () => {
  const data = sheet([{ riley: 0.004, femi: 0 }, { riley: 0.004, femi: -0.002 }], ["riley", "femi"]);
  const totals = deriveAssetScheduleSummary(data);
  assert.equal(totals.evaluator_totals.riley, 0.008);
  assert.equal(formatCurrencyCell(totals.evaluator_totals.riley), "0.01");
  assert.equal(totals.evaluator_totals.femi, -0.002);
  assert.equal(totals.total_asset_value, 0.003);
  assert.equal(totals.total_low_est_value, -0.002);
  assert.equal(totals.total_high_est_value, 0.008);
});

test("canonical parsing ignores unavailable/nonfinite values and honours entered zero", () => {
  const data = sheet([
    { riley: "1,250.50", femi: "", jay: Number.NaN },
    { riley: Number.POSITIVE_INFINITY, femi: 0, jay: null },
  ]);
  const totals = deriveAssetScheduleSummary(data);
  assert.deepEqual(totals.evaluator_totals, { riley: 1250.5, femi: 0, jay: 0 });
  assert.equal(totals.total_asset_value, 1250.5);
});

test("editing an evaluator value recalculates totals from the same updated row formulas", () => {
  const data = sheet([{ riley: 100, femi: 200 }]);
  const updated = recalculateAssetScheduleSheet({
    ...data, rows: data.rows.map((row) => ({ ...row, evaluator_values: { ...row.evaluator_values, femi: 300 } })),
  });
  const totals = deriveAssetScheduleSummary(updated);
  assert.deepEqual(totals.evaluator_totals, { riley: 100, femi: 300, jay: 0 });
  assert.equal(totals.total_asset_value, 200);
  assert.equal(totals.total_high_est_value, 300);
  assert.equal(totals.total_capped_bp, 45);
});

test("desktop and mobile render the same all-sheet totals with amount-only premium", () => {
  const source = readFileSync(new URL("../app/components/reports/AssetScheduleSheet.tsx", import.meta.url), "utf8");
  assert.match(source, /deriveAssetScheduleSummary\(sheet\)/);
  assert.match(source, /<TableFooter aria-label=\{`Totals across all \$\{sheet.rows.length\} lots`\}>/);
  assert.match(source, /const total = allLotTotals\[column.id\]/);
  assert.match(source, /Object.entries\(allLotTotals\).map/);
  assert.match(source, /buyer_premium_amount: \{ label: "B.P. amount \(\$\)", value: derivedSummary.total_capped_bp \}/);
  assert.doesNotMatch(source, /buyer_premium_percent: \{ label:/);
});
