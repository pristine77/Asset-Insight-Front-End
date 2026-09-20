import { beforeEach, describe, expect, it, vi } from "vitest";
import API from "@/lib/api";
import { AuctioneerService } from "./auctioneer";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("AuctioneerService incoming", () => {
  beforeEach(() => {
    vi.mocked(API.get).mockReset();
    vi.mocked(API.post).mockReset();
  });

  it("keeps every normalized proposal row from the backend items contract", async () => {
    vi.mocked(API.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
              cycleKey: "proposal:825291",
              contractId: "contract-825291",
              contractNo: 825291,
              customerName: "Proposal customer one",
              eventTitle: "ProposalInAssetInsight",
              location: "London",
              kind: "unknown",
              lotCount: 0,
              status: "available",
            },
            {
              cycleKey: "proposal:825295",
              contractId: "contract-825295",
              contractNo: 825295,
              customerName: "Proposal customer two",
              eventTitle: "ProposalInAssetInsight",
              location: "Manchester",
              kind: "scheduleA",
              lotCount: 3,
              status: "available",
            },
          ],
        },
      },
    });

    const items = await AuctioneerService.getIncoming();

    expect(items.map((item) => item.contractNo)).toEqual([
      "825291",
      "825295",
    ]);
    expect(items.map((item) => item.kind)).toEqual(["unknown", "scheduleA"]);
    expect(API.get).toHaveBeenCalledWith("/auctioneer/incoming", {});
    expect(vi.mocked(API.get).mock.calls[0]?.[1]).not.toHaveProperty(
      "params.userId"
    );
  });

  it.each([
    { fields: { status: "reportCreated", reportId: "report-1" }, status: "report_created" },
    { fields: { state: "in_progress", report_id: "report-1" }, status: "claimed" },
  ])("normalizes setup status and report identity from $fields", async ({ fields, status }) => {
    vi.mocked(API.get).mockResolvedValueOnce({
      data: { success: true, data: { workItemId: "work-1", ...fields } },
    });

    const setup = await AuctioneerService.getSetup("work-1");

    expect(setup).toMatchObject({ workItemId: "work-1", status, reportId: "report-1" });
  });

  it("keeps absent setup status and report identity unknown", async () => {
    vi.mocked(API.get).mockResolvedValueOnce({
      data: { success: true, data: { workItemId: "work-1" } },
    });

    const setup = await AuctioneerService.getSetup("work-1");

    expect(setup.status).toBeUndefined();
    expect(setup.reportId).toBeUndefined();
  });

  it.each([true, false, undefined, "true"])("trusts only a boolean upload-resume capability: %j", async (canResumeUpload) => {
    vi.mocked(API.get).mockResolvedValueOnce({ data: { data: { workItemId: "work-1", canResumeUpload } } });
    const setup = await AuctioneerService.getSetup("work-1");
    expect(setup.canResumeUpload).toBe(typeof canResumeUpload === "boolean" ? canResumeUpload : undefined);
  });

  it("continues the exact work item and accepted report with the normalized server setup", async () => {
    vi.mocked(API.post).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          work_item_id: "work-next",
          cycle_key: "cycle-1",
          kind: "unknown",
          report_type: "lot_listing",
          client_submission_id: "submission-next",
          status: "claimed",
          contract: {
            id: "contract-1",
            contract_no: "CTR-100",
            customer_name: "Example Customer",
            location: "London",
          },
          lots: [],
        },
      },
    });

    const setup = await AuctioneerService.continueWorkItem("work/1 ?", "report-accepted");

    expect(API.post).toHaveBeenCalledExactlyOnceWith(
      "/auctioneer/work-items/work%2F1%20%3F/continue",
      { reportId: "report-accepted" }
    );
    expect(setup).toMatchObject({
      workItemId: "work-next",
      cycleKey: "cycle-1",
      kind: "unknown",
      reportType: "lotListing",
      clientSubmissionId: "submission-next",
      status: "claimed",
      contract: { id: "contract-1", contractNo: "CTR-100", customerName: "Example Customer" },
      lots: [],
    });
    expect(API.get).not.toHaveBeenCalled();
  });

  it("repeats continuation with the same work item and accepted report identity", async () => {
    vi.mocked(API.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          workItemId: "work-next",
          clientSubmissionId: "submission-next",
          status: "claimed",
        },
      },
    });

    const first = await AuctioneerService.continueWorkItem("work-1", "report-accepted");
    const retry = await AuctioneerService.continueWorkItem("work-1", "report-accepted");

    expect(API.post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(API.post).mock.calls).toEqual([
      ["/auctioneer/work-items/work-1/continue", { reportId: "report-accepted" }],
      ["/auctioneer/work-items/work-1/continue", { reportId: "report-accepted" }],
    ]);
    expect(retry).toEqual(first);
    expect(retry.clientSubmissionId).toBe("submission-next");
  });

  it("propagates continuation failure without retrying or fetching another setup", async () => {
    const failure = {
      response: { status: 409, data: { code: "REPORT_NOT_ACCEPTED", message: "Report is not accepted." } },
    };
    vi.mocked(API.post).mockRejectedValueOnce(failure);

    await expect(
      AuctioneerService.continueWorkItem("work-1", "report-accepted")
    ).rejects.toBe(failure);

    expect(API.post).toHaveBeenCalledExactlyOnceWith(
      "/auctioneer/work-items/work-1/continue",
      { reportId: "report-accepted" }
    );
    expect(API.get).not.toHaveBeenCalled();
  });
});
