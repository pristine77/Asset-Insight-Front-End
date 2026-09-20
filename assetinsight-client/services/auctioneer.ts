import API from "@/lib/api";

export type AuctioneerReportType = "asset" | "lotListing";
export type AuctioneerIncomingKind = "scheduleA" | "unknown";
export type AuctioneerIncomingStatus =
  | "available"
  | "claimed"
  | "report_created"
  | "sent"
  | "abandoned";

export type AuctioneerPersonRef = {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
  email?: string;
};

export type AuctioneerIncomingItem = {
  cycleKey: string;
  workItemId?: string;
  contractId: string;
  contractNo: string;
  customerName: string;
  eventId?: string;
  eventTitle: string;
  eventDate?: string;
  location: string;
  kind: AuctioneerIncomingKind;
  lotCount: number;
  status: AuctioneerIncomingStatus;
  claimedBy?: AuctioneerPersonRef | string | null;
  claimedByMe?: boolean;
  selectedReportType?: AuctioneerReportType;
};

export type AuctioneerSourceLot = {
  sourceKey: string;
  lotId?: string;
  submissionId?: string;
  lotNumber?: string;
  title?: string;
  description?: string;
  details?: string;
  categories?: string;
  serialNumber?: string;
  make?: string;
  model?: string;
  year?: string;
  conditionReport?: string;
  services?: string[];
  sourcePhotoCount?: number;
};

export type AuctioneerWorkItemSetup = {
  workItemId: string;
  cycleKey: string;
  kind: AuctioneerIncomingKind;
  reportType: AuctioneerReportType;
  clientSubmissionId?: string;
  status?: AuctioneerIncomingStatus;
  reportId?: string;
  canResumeUpload?: boolean;
  contract: {
    id: string;
    contractNo: string;
    customerName: string;
    eventId?: string;
    eventTitle: string;
    eventDate?: string;
    location: string;
    categories?: string;
  };
  lots: AuctioneerSourceLot[];
};

export type AuctioneerDeliveryState =
  | "not_ready"
  | "ready"
  | "queued"
  | "sending"
  | "failed"
  | "needs_reconciliation"
  | "sent";

export type AuctioneerDeliverySummary = {
  workItemId: string;
  reportId?: string;
  reportModel?: "AssetReport" | "LotListing";
  reportType?: AuctioneerReportType;
  contractNo?: string;
  state: AuctioneerDeliveryState;
  canSend?: boolean;
  canCompleteContract?: boolean;
  destination?: "LottingBoard" | "OpToDoBoard";
  opTaskDescription?: string;
  completeContract?: boolean;
  error?: string;
  sentAt?: string;
  updatedAt?: string;
};

export type AuctioneerSendDeliveryInput = {
  destination: "LottingBoard" | "OpToDoBoard";
  opTaskDescription?: string;
  completeContract?: boolean;
};

export type AuctioneerReconcileDeliveryInput =
  | { externalLotId: string }
  | { confirmNotCreated: true };

type UnknownRecord = Record<string, any>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function unwrap(value: unknown): unknown {
  const record = asRecord(value);
  return record.data ?? value;
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeKind(value: unknown, record: UnknownRecord): AuctioneerIncomingKind {
  const kind = textValue(value).toLowerCase();
  if (kind.includes("unknown")) return "unknown";
  if (record.hasUnknownLots && !record.hasScheduleA) return "unknown";
  return "scheduleA";
}

function normalizeReportType(value: unknown): AuctioneerReportType | undefined {
  const normalized = textValue(value).replace(/[-_\s]/g, "").toLowerCase();
  if (normalized === "asset" || normalized === "assetreport") return "asset";
  if (normalized === "lotlisting" || normalized === "lot") return "lotListing";
  return undefined;
}

function normalizeStatus(value: unknown): AuctioneerIncomingStatus {
  const normalized = textValue(value).replace(/[-\s]/g, "_").toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "report_created" || normalized === "reportcreated") {
    return "report_created";
  }
  if (normalized === "abandoned") return "abandoned";
  if (normalized === "claimed" || normalized === "in_progress") return "claimed";
  return "available";
}

function normalizeIncomingItem(value: unknown): AuctioneerIncomingItem {
  const item = asRecord(value);
  const contract = asRecord(item.contract ?? item.contractSnapshot);
  const event = asRecord(item.event ?? contract.event);
  const customer = asRecord(item.customer ?? contract.customer);
  const workItem = asRecord(item.workItem);
  const claim = asRecord(item.claim);
  const claimedBy =
    item.claimedBy ??
    workItem.claimedBy ??
    item.claimed_by ??
    claim.user ??
    claim.owner;
  const contractId = textValue(
    item.contractId,
    item.contract_id,
    contract.id,
    contract._id
  );
  const cycleKey = textValue(item.cycleKey, item.cycle_key, workItem.cycleKey);
  const lots = Array.isArray(item.lots) ? item.lots : [];
  const tasks = Array.isArray(item.tasks) ? item.tasks : [];

  return {
    cycleKey: cycleKey || contractId,
    workItemId: textValue(
      item.workItemId,
      item.work_item_id,
      workItem.id,
      workItem._id,
      item._id
    ) || undefined,
    contractId,
    contractNo: textValue(
      item.contractNo,
      item.contract_no,
      contract.contractNo,
      contract.contract_no,
      contract.number
    ),
    customerName: textValue(
      item.customerName,
      item.customer_name,
      contract.customerName,
      contract.customer_name,
      customer.name,
      customer.companyName,
      customer.company_name
    ),
    eventId:
      textValue(item.eventId, item.event_id, contract.eventId, event.id, event._id) ||
      undefined,
    eventTitle: textValue(
      item.eventTitle,
      item.event_title,
      contract.eventTitle,
      event.title,
      event.name
    ),
    eventDate:
      textValue(
        item.eventDate,
        item.event_date,
        item.closeDate,
        contract.eventDate,
        contract.closeDate,
        event.date,
        event.closeDate
      ) || undefined,
    location: textValue(
      item.location,
      item.saleLocation,
      contract.location,
      contract.saleLocation,
      event.location
    ),
    kind: normalizeKind(item.kind ?? item.sourceKind, {
      ...contract,
      ...item,
    }),
    lotCount:
      Number(item.lotCount ?? item.lot_count ?? (lots.length || tasks.length)) ||
      0,
    status: normalizeStatus(item.status ?? item.state ?? workItem.status),
    claimedBy: claimedBy || null,
    claimedByMe: Boolean(item.claimedByMe ?? item.claimed_by_me),
    selectedReportType: normalizeReportType(
      item.selectedReportType ??
        item.selected_report_type ??
        item.reportType ??
        item.report_type ??
        workItem.reportType
    ),
  };
}

function normalizeLot(value: unknown, index: number): AuctioneerSourceLot {
  const task = asRecord(value);
  const lot = asRecord(task.lot ?? task.asset ?? value);
  const submission = asRecord(task.submission);
  const lotId = textValue(lot.id, lot._id, lot.lotId, task.lotId);
  const submissionId = textValue(
    submission.id,
    submission._id,
    task.submissionId,
    task.submissionGuid
  );
  const lotNumber = textValue(lot.lotNumber, lot.lot_number, lot.number);
  return {
    sourceKey:
      textValue(task.sourceKey, task.source_key, lot.sourceKey) ||
      `${lotId || "unknown"}:${submissionId || index}`,
    lotId: lotId || undefined,
    submissionId: submissionId || undefined,
    lotNumber: lotNumber || undefined,
    title: textValue(lot.title, lot.name, lot.asset_name) || undefined,
    description: textValue(lot.description, task.description) || undefined,
    details: textValue(lot.details, lot.specifications, task.details) || undefined,
    categories:
      textValue(lot.categories, lot.category, task.categories) || undefined,
    serialNumber:
      textValue(lot.serialNumber, lot.serial_number, lot.serialNo) || undefined,
    make: textValue(lot.make, lot.manufacturer) || undefined,
    model: textValue(lot.model) || undefined,
    year: textValue(lot.year) || undefined,
    conditionReport:
      textValue(
        lot.conditionReport,
        lot.condition_report,
        task.conditionReport
      ) || undefined,
    services: (Array.isArray(lot.services) ? lot.services : [])
      .map((service) =>
        typeof service === "string"
          ? service.trim()
          : textValue(
              asRecord(service).name,
              asRecord(service).title,
              asRecord(service).serviceName,
              asRecord(service).code
            )
      )
      .filter(Boolean),
    sourcePhotoCount:
      Number(lot.sourcePhotoCount ?? lot.source_photo_count) || undefined,
  };
}

function normalizeSetup(value: unknown): AuctioneerWorkItemSetup {
  const envelope = asRecord(unwrap(value));
  const raw = asRecord(
    envelope.setup ??
      envelope.workItem ??
      envelope.work_item ??
      envelope
  );
  const snapshot = asRecord(raw.snapshot ?? raw.sourceSnapshot);
  const contract = asRecord(raw.contract ?? snapshot.contract);
  const event = asRecord(raw.event ?? contract.event ?? snapshot.event);
  const customer = asRecord(raw.customer ?? contract.customer ?? snapshot.customer);
  const lotValues =
    (Array.isArray(raw.lots) && raw.lots) ||
    (Array.isArray(raw.tasks) && raw.tasks) ||
    (Array.isArray(snapshot.lots) && snapshot.lots) ||
    (Array.isArray(snapshot.tasks) && snapshot.tasks) ||
    [];

  const workItemId = textValue(raw.workItemId, raw.work_item_id, raw.id, raw._id);
  const status = textValue(raw.status, raw.state);
  return {
    workItemId,
    cycleKey: textValue(raw.cycleKey, raw.cycle_key),
    kind: normalizeKind(raw.kind ?? raw.sourceKind ?? raw.source_kind ?? snapshot.kind, {
      ...contract,
      ...snapshot,
    }),
    reportType:
      normalizeReportType(
        raw.reportType ??
          raw.report_type ??
          raw.selectedReportType ??
          raw.selected_report_type
      ) || "asset",
    clientSubmissionId:
      textValue(raw.clientSubmissionId, raw.client_submission_id) || undefined,
    status: status ? normalizeStatus(status) : undefined,
    reportId: textValue(raw.reportId, raw.report_id) || undefined,
    canResumeUpload: typeof raw.canResumeUpload === "boolean" ? raw.canResumeUpload : undefined,
    contract: {
      id: textValue(
        raw.contractId,
        raw.contract_id,
        contract.id,
        contract._id,
        contract.contractId,
        contract.contract_id
      ),
      contractNo: textValue(
        raw.contractNo,
        contract.contractNo,
        contract.contract_no,
        contract.number
      ),
      customerName: textValue(
        raw.customerName,
        raw.customer_name,
        contract.customerName,
        contract.customer_name,
        customer.name,
        customer.companyName,
        customer.company_name
      ),
      eventId:
        textValue(raw.eventId, contract.eventId, event.id, event._id) || undefined,
      eventTitle: textValue(
        raw.eventTitle,
        contract.eventTitle,
        event.title,
        event.name
      ),
      eventDate:
        textValue(
          raw.eventDate,
          contract.eventDate,
          contract.closeDate,
          event.date,
          event.closeDate
        ) || undefined,
      location: textValue(
        raw.location,
        contract.location,
        contract.saleLocation,
        event.location
      ),
      categories:
        textValue(raw.categories, contract.categories, snapshot.categories) ||
        undefined,
    },
    lots: lotValues.map(normalizeLot),
  };
}

function normalizeDelivery(value: unknown): AuctioneerDeliverySummary {
  const raw = asRecord(value);
  const delivery = asRecord(raw.delivery);
  return {
    workItemId: textValue(
      raw.workItemId,
      raw.work_item_id,
      raw.id,
      raw._id
    ),
    reportId: textValue(raw.reportId, raw.report_id, raw.linkedReportId) || undefined,
    reportModel: raw.reportModel ?? raw.linkedReportModel,
    reportType: normalizeReportType(raw.reportType),
    contractNo: textValue(raw.contractNo, raw.contract_no) || undefined,
    state: textValue(
      delivery.state,
      delivery.status,
      raw.state,
      raw.status,
      raw.deliveryState
    )
      .replace(/[-\s]/g, "_")
      .toLowerCase() as AuctioneerDeliveryState,
    canSend:
      typeof raw.canSend === "boolean"
        ? raw.canSend
        : typeof delivery.canSend === "boolean"
          ? delivery.canSend
          : undefined,
    canCompleteContract:
      typeof raw.canCompleteContract === "boolean"
        ? raw.canCompleteContract
        : typeof delivery.canCompleteContract === "boolean"
          ? delivery.canCompleteContract
          : undefined,
    destination: delivery.destination ?? raw.destination,
    opTaskDescription:
      textValue(delivery.opTaskDescription, raw.opTaskDescription) || undefined,
    completeContract: Boolean(
      delivery.completeContract ?? raw.completeContract
    ),
    error: textValue(delivery.error, raw.error) || undefined,
    sentAt: textValue(delivery.sentAt, raw.sentAt) || undefined,
    updatedAt: textValue(delivery.updatedAt, raw.updatedAt) || undefined,
  };
}

export const AuctioneerService = {
  async getStatus() {
    const response = await API.get("/auctioneer/status");
    return unwrap(response.data) as {
      enabled: boolean;
      configured: boolean;
      reachable?: boolean;
      message?: string;
      apiKeyConfigured?: boolean;
      verificationEndpoint?: "/health" | "/auth/verify" | null;
    };
  },

  async getIncoming(forceRefresh = false): Promise<AuctioneerIncomingItem[]> {
    const response = await API.get("/auctioneer/incoming", {
      ...(forceRefresh ? { params: { refresh: true } } : {}),
    });
    const payload = unwrap(response.data);
    const record = asRecord(payload);
    const values = Array.isArray(payload)
      ? payload
      : record.items ?? record.contracts ?? record.incoming ?? [];
    return (Array.isArray(values) ? values : []).map(normalizeIncomingItem);
  },

  async getIncomingSummary(): Promise<{ availableCount: number }> {
    const response = await API.get("/auctioneer/incoming/summary");
    const payload = asRecord(unwrap(response.data));
    return {
      availableCount: Math.max(0, Number(payload.availableCount) || 0),
    };
  },

  async claim(cycleKey: string, reportType: AuctioneerReportType) {
    const response = await API.post(
      `/auctioneer/incoming/${encodeURIComponent(cycleKey)}/claim`,
      { reportType }
    );
    const claimed = normalizeSetup(response.data);
    if (
      claimed.workItemId &&
      (!claimed.contract.id || !claimed.contract.contractNo)
    ) {
      return AuctioneerService.getSetup(claimed.workItemId);
    }
    return claimed;
  },

  async getSetup(workItemId: string, options?: { signal?: AbortSignal }) {
    const response = await API.get(
      `/auctioneer/work-items/${encodeURIComponent(workItemId)}/setup`,
      options
    );
    return normalizeSetup(response.data);
  },

  async continueWorkItem(
    workItemId: string,
    reportId: string
  ): Promise<AuctioneerWorkItemSetup> {
    const response = await API.post(
      `/auctioneer/work-items/${encodeURIComponent(workItemId)}/continue`,
      { reportId }
    );
    return normalizeSetup(response.data);
  },

  async releaseClaim(workItemId: string) {
    await API.delete(
      `/auctioneer/work-items/${encodeURIComponent(workItemId)}/claim`
    );
  },

  async getDeliveries(): Promise<AuctioneerDeliverySummary[]> {
    const response = await API.get("/auctioneer/deliveries");
    const payload = unwrap(response.data);
    const record = asRecord(payload);
    const values = Array.isArray(payload)
      ? payload
      : record.items ?? record.deliveries ?? [];
    return (Array.isArray(values) ? values : []).map(normalizeDelivery);
  },

  async sendDelivery(
    workItemId: string,
    input: AuctioneerSendDeliveryInput
  ): Promise<AuctioneerDeliverySummary> {
    const response = await API.post(
      `/auctioneer/deliveries/${encodeURIComponent(workItemId)}/send`,
      input
    );
    return normalizeDelivery(unwrap(response.data));
  },

  async reconcileDelivery(
    workItemId: string,
    input: AuctioneerReconcileDeliveryInput
  ): Promise<AuctioneerDeliverySummary> {
    const response = await API.post(
      `/auctioneer/deliveries/${encodeURIComponent(workItemId)}/reconcile`,
      input
    );
    return normalizeDelivery(unwrap(response.data));
  },
};

export default AuctioneerService;
