import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import YoutubeTermsPage from "./page";

describe("YouTube feature terms", () => {
  it("provides public terms, privacy, revocation, and contact without authentication", () => {
    render(<YoutubeTermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "YouTube feature terms" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YouTube Terms of Service" })).toHaveAttribute("href", "https://www.youtube.com/t/terms");
    expect(screen.getByRole("link", { name: "Asset Insight privacy notice" })).toHaveAttribute("href", "/privacy#youtube-privacy");
    expect(screen.getByText(/you agree to be bound by/)).toBeInTheDocument();
    expect(screen.getByText(/These controls do not delete uploaded YouTube videos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "manom8193@gmail.com" })).toHaveAttribute("href", "mailto:manom8193@gmail.com");
  });
});
