import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuctioneerIncomingItem,
  AuctioneerWorkItemSetup,
} from "@/services/auctioneer";
import IncomingPage from "./page";

const mocks = vi.hoisted(() => ({
  getIncoming: vi.fn(),
  getStatus: vi.fn(),
  getIncomingSummary: vi.fn(),
  claim: vi.fn(),
  getSetup: vi.fn(),
  releaseClaim: vi.fn(),
  routerPush: vi.fn(),
  authUser: {
    _id: "user-1",
    email: "appraiser@example.com",
    username: "Alex Morgan",
  } as {
    _id: string;
    email: string;
    username: string;
  } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: vi.fn(),
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: mocks.authUser,
    loading: false,
  }),
}));

vi.mock("@/services/auctioneer", () => {
  const service = {
    getIncoming: mocks.getIncoming,
    getStatus: mocks.getStatus,
    getIncomingSummary: mocks.getIncomingSummary,
    claim: mocks.claim,
    getSetup: mocks.getSetup,
    releaseClaim: mocks.releaseClaim,
  };
  return {
    default: service,
    AuctioneerService: service,
  };
});

const availableItem: AuctioneerIncomingItem = {
  cycleKey: "cycle-100",
  contractId: "contract-100",
  contractNo: "CV-100",
  customerName: "Northfield Plant Ltd",
  eventId: "event-100",
  eventTitle: "Fleet dispersal",
  eventDate: "2026-08-12T10:00:00.000Z",
  location: "Leeds",
  kind: "scheduleA",
  lotCount: 14,
  status: "available",
};

const claimedItem: AuctioneerIncomingItem = {
  ...availableItem,
  cycleKey: "cycle-claimed",
  workItemId: "work-claimed",
  contractNo: "CV-200",
  status: "claimed",
  claimedByMe: true,
  claimedBy: {
    _id: "user-1",
    username: "Alex Morgan",
  },
  selectedReportType: "asset",
};

function setupFor(
  item: AuctioneerIncomingItem,
  reportType: "asset" | "lotListing" = "asset"
): AuctioneerWorkItemSetup {
  return {
    workItemId: item.workItemId || "work-100",
    cycleKey: item.cycleKey,
    kind: item.kind,
    reportType,
    contract: {
      id: item.contractId,
      contractNo: item.contractNo,
      customerName: item.customerName,
      eventId: item.eventId,
      eventTitle: item.eventTitle,
      eventDate: item.eventDate,
      location: item.location,
    },
    lots: [],
  };
}

const swrTestConfig = {
  provider: () => new Map(),
  dedupingInterval: 0,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

function IncomingHarness() {
  return (
    <SWRConfig
      value={swrTestConfig}
    >
      <IncomingPage />
    </SWRConfig>
  );
}

function renderIncoming() {
  return render(<IncomingHarness />);
}

async function selectContract(contractNo: string) {
  const review = await screen.findByRole("button", {
    name: `Review ${contractNo}`,
  });
  fireEvent.click(review);
  const panel = screen.getByRole("complementary", {
    name: "Selected contract",
  });
  await waitFor(() => expect(panel).toHaveAttribute("data-open", "true"));
  return panel;
}

describe("Incoming", () => {
  beforeEach(() => {
    mocks.getIncoming.mockReset();
    mocks.getStatus.mockReset();
    mocks.getIncomingSummary.mockReset();
    mocks.claim.mockReset();
    mocks.getSetup.mockReset();
    mocks.releaseClaim.mockReset();
    mocks.routerPush.mockReset();
    window.sessionStorage.clear();
    mocks.authUser = {
      _id: "user-1",
      email: "appraiser@example.com",
      username: "Alex Morgan",
    };

    mocks.getIncoming.mockResolvedValue([availableItem]);
    mocks.getStatus.mockResolvedValue({
      enabled: true,
      configured: true,
      reachable: true,
    });
    mocks.claim.mockResolvedValue(setupFor(availableItem));
    mocks.getSetup.mockResolvedValue(setupFor(claimedItem));
    mocks.releaseClaim.mockResolvedValue(undefined);
  });

  it("shows a lightweight loading state until the queue and status resolve", async () => {
    let resolveIncoming!: (items: AuctioneerIncomingItem[]) => void;
    let resolveStatus!: (status: {
      enabled: boolean;
      configured: boolean;
    }) => void;
    mocks.getIncoming.mockReturnValue(
      new Promise<AuctioneerIncomingItem[]>((resolve) => {
        resolveIncoming = resolve;
      })
    );
    mocks.getStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );

    renderIncoming();
    expect(
      screen.getByRole("status", { name: "" })
    ).toHaveTextContent(/Loading incoming contracts/);

    await act(async () => {
      resolveIncoming([]);
      resolveStatus({ enabled: true, configured: true });
    });
    expect(await screen.findByText("No assigned lots")).toBeInTheDocument();
    expect(mocks.getIncoming).toHaveBeenCalledWith();
  });

  it("renders an empty queue without hiding the workspace", async () => {
    mocks.getIncoming.mockResolvedValue([]);
    renderIncoming();

    expect(await screen.findByRole("heading", { name: "Incoming" })).toBeInTheDocument();
    expect(screen.getByText("No assigned lots")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No Auctioneer lots are currently assigned to your account."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("does not load assigned work until an authenticated user ID exists", async () => {
    mocks.authUser = null;

    renderIncoming();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.getIncoming).not.toHaveBeenCalled();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it("renders every proposal row returned by the incoming items contract", async () => {
    mocks.getIncoming.mockResolvedValue([
      {
        ...availableItem,
        cycleKey: "proposal:825291",
        contractId: "contract-825291",
        contractNo: "825291",
        eventTitle: "ProposalInAssetInsight",
        kind: "unknown",
        lotCount: 0,
      },
      {
        ...availableItem,
        cycleKey: "proposal:825295",
        contractId: "contract-825295",
        contractNo: "825295",
        eventTitle: "ProposalInAssetInsight",
        kind: "scheduleA",
      },
    ]);

    renderIncoming();

    expect(
      await screen.findByRole("button", { name: "Review 825291" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Review 825295" })
    ).toBeVisible();
    expect(screen.getAllByText("ProposalInAssetInsight")).toHaveLength(2);
    expect(mocks.getIncoming).toHaveBeenCalledWith();
  });

  it("drops the previous user's rows while the next user's queue loads", async () => {
    let resolveSecondUser!: (items: AuctioneerIncomingItem[]) => void;
    mocks.getIncoming
      .mockResolvedValueOnce([availableItem])
      .mockReturnValueOnce(
        new Promise<AuctioneerIncomingItem[]>((resolve) => {
          resolveSecondUser = resolve;
        })
      );

    const rendered = renderIncoming();
    expect(
      await screen.findByRole("button", { name: "Review CV-100" })
    ).toBeVisible();

    mocks.authUser = {
      _id: "user-2",
      email: "second@example.com",
      username: "Second User",
    };
    rendered.rerender(<IncomingHarness />);

    await waitFor(() => expect(mocks.getIncoming).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("button", { name: "Review CV-100" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Loading incoming contracts/)).toBeInTheDocument();
    expect(
      mocks.getIncoming.mock.calls.every((args) => args.length === 0)
    ).toBe(true);

    await act(async () => {
      resolveSecondUser([]);
    });
    expect(await screen.findByText("No assigned lots")).toBeInTheDocument();
  });

  it.each([
    [
      { enabled: false, configured: true },
      "Incoming is currently disabled by your administrator.",
    ],
    [
      { enabled: true, configured: false },
      "Incoming needs an Auctioneer connection before contracts can be loaded.",
    ],
  ])(
    "explains an unavailable integration",
    async (status, message) => {
      mocks.getIncoming.mockResolvedValue([]);
      mocks.getStatus.mockResolvedValue(status);
      renderIncoming();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByText("Incoming is not configured")).toBeInTheDocument();
    }
  );

  it("surfaces a reachable-status failure as an actionable error", async () => {
    mocks.getIncoming.mockRejectedValue(new Error("network down"));
    mocks.getStatus.mockResolvedValue({
      enabled: true,
      configured: true,
      reachable: false,
      message: "Auctioneer is temporarily offline.",
    });
    renderIncoming();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Auctioneer is temporarily offline."
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("selects a report type and claims an available contract", async () => {
    mocks.claim.mockResolvedValue(setupFor(availableItem, "lotListing"));
    renderIncoming();
    const panel = await selectContract("CV-100");

    const lotListing = within(panel).getByRole("radio", {
      name: /Lot listing/,
    });
    fireEvent.click(lotListing);
    expect(lotListing).toHaveAttribute("aria-checked", "true");
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Claim and create report",
      })
    );

    await waitFor(() =>
      expect(mocks.claim).toHaveBeenCalledWith("cycle-100", "lotListing")
    );
    await waitFor(() =>
      expect(mocks.routerPush).toHaveBeenCalledWith("/create/lot-listing")
    );
    expect(
      JSON.parse(
        window.sessionStorage.getItem("cv:report-form-handoff:v1") || "null"
      )
    ).toMatchObject({
      version: 1,
      kind: "lot-listing",
      returnTo: "/incoming",
      auctioneer: { reportType: "lotListing" },
    });
  });

  it("refreshes the queue and explains a claim conflict", async () => {
    mocks.claim.mockRejectedValue({
      response: { status: 409, data: { message: "already claimed" } },
    });
    renderIncoming();
    const panel = await selectContract("CV-100");

    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Claim and create report",
      })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another user claimed this contract first. The queue has been refreshed."
    );
    expect(mocks.getIncoming.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("resumes a work item already claimed by the current user", async () => {
    mocks.getIncoming.mockResolvedValue([claimedItem]);
    renderIncoming();
    const panel = await selectContract("CV-200");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Resume report" })
    );

    await waitFor(() =>
      expect(mocks.getSetup).toHaveBeenCalledWith("work-claimed")
    );
    expect(mocks.routerPush).toHaveBeenCalledWith("/create/asset");
    expect(
      JSON.parse(
        window.sessionStorage.getItem("cv:report-form-handoff:v1") || "null"
      )
    ).toMatchObject({
      version: 1,
      kind: "asset",
      returnTo: "/incoming",
      auctioneer: { reportType: "asset" },
    });
  });

  it("releases a claimed work item and immediately refreshes", async () => {
    mocks.getIncoming.mockResolvedValue([claimedItem]);
    renderIncoming();
    const panel = await selectContract("CV-200");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Release claim" })
    );

    await waitFor(() =>
      expect(mocks.releaseClaim).toHaveBeenCalledWith("work-claimed")
    );
    expect(mocks.getIncoming.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("opens an existing report rather than recreating it", async () => {
    mocks.getIncoming.mockResolvedValue([
      {
        ...claimedItem,
        status: "report_created",
      },
    ]);
    renderIncoming();
    const panel = await selectContract("CV-200");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Open report" })
    );

    expect(mocks.routerPush).toHaveBeenCalledWith("/reports");
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
