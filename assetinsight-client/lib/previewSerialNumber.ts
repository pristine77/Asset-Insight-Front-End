type PreviewLot = Record<string, any>;

const normalizeFieldKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const PRIMARY_SERIAL_KEYS = new Set(["serialnumber", "vin", "sn"]);

export const isPrimarySerialField = (value: unknown) =>
  PRIMARY_SERIAL_KEYS.has(normalizeFieldKey(value));

const toSpecRecord = (value: unknown): Record<string, string> => {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry: any) => [
          String(entry?.field || "").trim(),
          String(entry?.value || "").trim(),
        ])
        .filter(([field]) => field)
    );
  }
  return value && typeof value === "object"
    ? { ...(value as Record<string, string>) }
    : {};
};

/** Keeps the root serial and Condition Report serial row as one editable value. */
export function applyPrimarySerialEdit(lot: PreviewLot, value: unknown): PreviewLot {
  const next = { ...lot };
  const serial = String(value ?? "");
  const specs = toSpecRecord(next.condition_report_specs);
  Object.keys(specs).forEach((field) => {
    if (isPrimarySerialField(field)) delete specs[field];
  });

  const deleted = (Array.isArray(next.condition_report_specs_deleted)
    ? next.condition_report_specs_deleted
    : []
  )
    .map((field: unknown) => String(field || "").trim())
    .filter((field: string) => field && !isPrimarySerialField(field));

  next.serial_number = serial;
  next.condition_report_specs = specs;

  if (serial.trim()) {
    next.condition_report_specs["Serial Number"] = serial;
    next.condition_report_specs_deleted = deleted;
  } else {
    for (const field of ["serial_no_or_label", "sn_vin", "vin", "sn"]) {
      if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = "";
    }
    next.condition_report_specs_deleted = [...deleted, "Serial Number"];
    if (Array.isArray(next.condition_report_specs_custom_order)) {
      next.condition_report_specs_custom_order =
        next.condition_report_specs_custom_order.filter(
          (field: unknown) => !isPrimarySerialField(field)
        );
    }
  }

  return next;
}
