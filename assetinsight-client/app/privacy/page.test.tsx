import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata } from "./page";

describe("public privacy notice", () => {
  it("renders device and YouTube disclosures without authentication or a consent form", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Asset Insight privacy notice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Device and network security data" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "YouTube and Google data" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(metadata.description).toContain("YouTube");
    expect(screen.getByText(/New report Excel files do not include a YouTube column/)).toBeInTheDocument();
    expect(screen.queryByText(/include confirmed YouTube links in report Excel files/)).not.toBeInTheDocument();
  });

  it("provides direct policy, revocation and video-management links", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "Google Privacy Policy" })).toHaveAttribute("href", "https://policies.google.com/privacy");
    expect(screen.getByRole("link", { name: "YouTube Terms of Service" })).toHaveAttribute("href", "https://www.youtube.com/t/terms");
    expect(screen.getByRole("link", { name: "Revoke access in Google account permissions" })).toHaveAttribute("href", "https://security.google.com/settings/security/permissions");
    expect(screen.getByRole("link", { name: "Manage published videos in YouTube Studio" })).toHaveAttribute("href", "https://studio.youtube.com/");
    expect(screen.getByRole("link", { name: "Back to Asset Insight" })).toHaveAttribute("href", "/");
  });

  it("distinguishes local disconnect, public publication and retained receipts", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/requests Google permission revocation/)).toBeInTheDocument();
    expect(screen.getByText(/Public videos, titles, and descriptions can be viewed and found by anyone/)).toBeInTheDocument();
    expect(screen.getByText(/minimal suppression and administrative receipts/)).toBeInTheDocument();
    expect(screen.getByText(/does not rewrite historical report submission provenance/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "manom8193@gmail.com" })).toHaveAttribute("href", "mailto:manom8193@gmail.com");
    expect(screen.getByRole("link", { name: "Asset Insight YouTube feature terms" })).toHaveAttribute("href", "/terms/youtube");
  });
});
