import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/services/auth";
import {
  isNavItemActive,
  PRIMARY_NAVIGATION,
  SECONDARY_NAVIGATION,
} from "./navigation";

function visibleLabels(user: AuthUser | null) {
  return [...PRIMARY_NAVIGATION, ...SECONDARY_NAVIGATION]
    .filter((item) => !item.visible || item.visible(user))
    .map((item) => item.label);
}

const basicUser: AuthUser = {
  _id: "user-basic",
  email: "appraiser@example.com",
};

describe("centralized app navigation", () => {
  it("maps Salvage progress and preview to the correct report navigation", () => {
    const reports = PRIMARY_NAVIGATION.find((item) => item.href === "/reports")!;
    const previews = PRIMARY_NAVIGATION.find((item) => item.href === "/previews")!;
    expect(isNavItemActive(reports, "/salvage/status/report-1")).toBe(true);
    expect(isNavItemActive(previews, "/salvage/preview/report-1")).toBe(true);
    expect(isNavItemActive(reports, "/salvage/preview/report-1")).toBe(false);
  });
  it.each([
    ["an unresolved session", null],
    ["a standard user", basicUser],
    [
      "an approver",
      { ...basicUser, _id: "user-approver", isReportApprover: true },
    ],
    [
      "a release manager",
      { ...basicUser, _id: "user-release", isReleaseManager: true },
    ],
    [
      "a user with every role",
      {
        ...basicUser,
        _id: "user-all-roles",
        isReportApprover: true,
        isReleaseManager: true,
      },
    ],
  ] satisfies Array<[string, AuthUser | null]>)(
    "keeps Incoming visible for %s",
    (_label, user) => {
      expect(visibleLabels(user)).toContain("Incoming");
    }
  );

  it("gates approvals and releases independently by role", () => {
    expect(visibleLabels(basicUser)).not.toContain("Approvals");
    expect(visibleLabels(basicUser)).not.toContain("Releases");

    expect(
      visibleLabels({ ...basicUser, isReportApprover: true })
    ).toContain("Approvals");
    expect(
      visibleLabels({ ...basicUser, isReportApprover: true })
    ).not.toContain("Releases");

    expect(
      visibleLabels({ ...basicUser, isReleaseManager: true })
    ).toContain("Releases");
    expect(
      visibleLabels({ ...basicUser, isReleaseManager: true })
    ).not.toContain("Approvals");
  });

  it("shows Proposal Valuations only for enabled accounts", () => {
    expect(visibleLabels(basicUser)).not.toContain("Proposal Valuations");
    expect(
      visibleLabels({ ...basicUser, proposalValuationEnabled: true })
    ).toContain("Proposal Valuations");
  });

  it("matches nested routes without activating similarly named routes", () => {
    const incoming = PRIMARY_NAVIGATION.find(
      (item) => item.href === "/incoming"
    );
    const reports = PRIMARY_NAVIGATION.find(
      (item) => item.href === "/reports"
    );
    const proposalValuations = PRIMARY_NAVIGATION.find(
      (item) => item.href === "/proposal-valuations"
    );

    expect(incoming).toBeDefined();
    expect(reports).toBeDefined();
    expect(proposalValuations).toBeDefined();
    expect(isNavItemActive(incoming!, "/incoming")).toBe(true);
    expect(isNavItemActive(incoming!, "/incoming/work-item-1")).toBe(true);
    expect(isNavItemActive(incoming!, "/incoming-archive")).toBe(false);
    expect(isNavItemActive(reports!, "/reports/report-1")).toBe(true);
    expect(
      isNavItemActive(proposalValuations!, "/proposal-valuations/report-1")
    ).toBe(true);
  });
});
