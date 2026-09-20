import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextType } from "@/context/AuthContext";
import { useAuthContext } from "@/context/AuthContext";
import { useColorMode } from "@/components/providers/ColorModeProvider";
import AppShell from "./AppShell";

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/incoming"),
  swr: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    function DeferredComponent() {
      return null;
    }
    return DeferredComponent;
  },
}));

vi.mock("swr", () => ({
  default: mocks.swr,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

vi.mock("@/components/providers/ColorModeProvider", () => ({
  useColorMode: vi.fn(),
}));

function authValue(
  roles: {
    isReportApprover?: boolean;
    isReleaseManager?: boolean;
  } = {}
): AuthContextType {
  return {
    user: {
      _id: "user-1",
      email: "appraiser@example.com",
      username: "Alex Morgan",
      ...roles,
    },
    sessionPresent: true,
    loading: false,
    error: null,
    loggingOut: false,
    deviceAccess: null,
    refresh: vi.fn(),
    login: vi.fn(),
    acceptAuthResponse: vi.fn(),
    registerDevice: vi.fn(),
    refreshDeviceStatus: vi.fn(),
    rerequestDevice: vi.fn(),
    logout: vi.fn(),
  };
}

describe("AppShell", () => {
  const toggleMode = vi.fn();
  const setMode = vi.fn();

  beforeEach(() => {
    toggleMode.mockReset();
    setMode.mockReset();
    window.localStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    mocks.pathname.mockReturnValue("/incoming");
    mocks.swr.mockReset();
    mocks.swr.mockReturnValue({
      data: { availableCount: 4, showBadge: true },
    });
    vi.mocked(useAuthContext).mockReturnValue(authValue());
    vi.mocked(useColorMode).mockReturnValue({
      mode: "light",
      resolvedTheme: "light",
      setMode,
      toggleMode,
    });
  });

  it("renders Incoming for a standard user and marks it active", () => {
    render(<AppShell>Queue content</AppShell>);

    expect(mocks.swr).toHaveBeenCalledWith(
      ["auctioneer/navigation-summary", "user-1"],
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: false })
    );
    const incoming = screen.getByRole("link", { name: /Incoming/ });
    expect(incoming).toHaveAttribute("href", "/incoming");
    expect(incoming).toHaveAttribute("aria-current", "page");
    expect(incoming).toHaveTextContent("4");
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Releases" })).not.toBeInTheDocument();
  });

  it("starts the summary request while a stored session identity resolves", () => {
    const resolvingSession = authValue();
    resolvingSession.user = null;
    vi.mocked(useAuthContext).mockReturnValue(resolvingSession);

    render(<AppShell>Queue content</AppShell>);

    expect(mocks.swr).toHaveBeenCalledWith(
      ["auctioneer/navigation-summary", "pending-session"],
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: false })
    );
  });

  it("pauses the summary request when no session is present", () => {
    const signedOut = authValue();
    signedOut.user = null;
    signedOut.sessionPresent = false;
    vi.mocked(useAuthContext).mockReturnValue(signedOut);

    render(<AppShell>Signed out queue</AppShell>);

    expect(mocks.swr).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: false })
    );
  });

  it("switches the navigation summary cache key with the authenticated user", () => {
    const rendered = render(<AppShell>First user queue</AppShell>);

    const secondUser = authValue();
    if (secondUser.user) secondUser.user._id = "user-2";
    vi.mocked(useAuthContext).mockReturnValue(secondUser);
    rendered.rerender(<AppShell>Second user queue</AppShell>);

    expect(mocks.swr).toHaveBeenCalledWith(
      ["auctioneer/navigation-summary", "user-2"],
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: false })
    );
  });

  it("renders each role-gated destination only for the matching role", () => {
    vi.mocked(useAuthContext).mockReturnValue(
      authValue({ isReportApprover: true, isReleaseManager: true })
    );

    render(<AppShell>Workspace</AppShell>);

    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute(
      "href",
      "/approvals"
    );
    expect(screen.getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "/releases"
    );
    expect(screen.getByRole("link", { name: /Incoming/ })).toBeInTheDocument();
  });

  it("preserves the enterprise desktop shell information hierarchy", () => {
    vi.mocked(useAuthContext).mockReturnValue(
      authValue({ isReportApprover: true, isReleaseManager: true })
    );

    render(<AppShell>Reference dashboard content</AppShell>);

    const sidebar = screen.getByRole("complementary", {
      name: "Primary navigation",
    });
    const navigation = within(sidebar);

    expect(
      navigation.getByRole("link", { name: /Asset Insight/i })
    ).toHaveAttribute("href", "/dashboard");
    expect(navigation.getByText("Enterprise workspace")).toBeInTheDocument();
    expect(navigation.getByText("Workspace")).toBeInTheDocument();
    expect(navigation.getByText("Review")).toBeInTheDocument();
    expect(navigation.getByText("Account")).toBeInTheDocument();

    for (const destination of [
      ["Dashboard", "/dashboard"],
      ["Incoming", "/incoming"],
      ["My Reports", "/reports"],
      ["Previews", "/previews"],
      ["Approvals", "/approvals"],
      ["Releases", "/releases"],
      ["Support", "/support"],
      ["Settings", "/settings"],
    ] as const) {
      expect(
        navigation.getByRole("link", { name: new RegExp(destination[0]) })
      ).toHaveAttribute("href", destination[1]);
    }

    expect(
      navigation.getByRole("button", { name: "Drafts" })
    ).toBeInTheDocument();
    expect(
      navigation.getByRole("button", { name: "Light theme" })
    ).toBeInTheDocument();
    expect(
      navigation.getByRole("button", { name: "Dark theme" })
    ).toBeInTheDocument();
    expect(navigation.getByText("Alex Morgan")).toBeInTheDocument();
    expect(navigation.getByText("appraiser@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle navigation width" })
    ).toBeInTheDocument();
    expect(screen.getByRole("search")).toContainElement(
      screen.getByRole("searchbox", {
        name: "Search reports, lots, and clients",
      })
    );
    expect(
      screen.getAllByRole("button", { name: "Open notifications" })
    ).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Contact support" })
    ).toHaveAttribute("href", "/support");
    expect(
      screen.getByRole("button", { name: "Sign out" })
    ).toBeInTheDocument();
    expect(screen.getByText("Reference dashboard content")).toBeInTheDocument();
  });

  it("keeps the Incoming destination but hides only its unavailable badge", () => {
    mocks.swr.mockReturnValue({
      data: { availableCount: 9, showBadge: false },
    });

    render(<AppShell>Queue content</AppShell>);

    expect(screen.getByRole("link", { name: "Incoming" })).toBeInTheDocument();
    expect(screen.queryByLabelText("9 available")).not.toBeInTheDocument();
  });

  it("pauses badge polling while the page is hidden or offline", () => {
    render(<AppShell>Queue content</AppShell>);
    const options = mocks.swr.mock.calls[0]?.[2] as {
      refreshInterval: () => number;
      refreshWhenHidden: boolean;
      refreshWhenOffline: boolean;
    };

    expect(options.refreshWhenHidden).toBe(false);
    expect(options.refreshWhenOffline).toBe(false);
    expect(options.refreshInterval()).toBe(60_000);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    expect(options.refreshInterval()).toBe(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    expect(options.refreshInterval()).toBe(0);
  });

  it("persists the collapsed desktop sidebar state", async () => {
    const { container } = render(<AppShell>Workspace</AppShell>);
    const shell = container.firstElementChild;

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle navigation width" })
    );

    expect(shell).toHaveAttribute("data-collapsed", "true");
    await waitFor(() =>
      expect(window.localStorage.getItem("cv-sidebar-collapsed")).toBe("true")
    );
    expect(screen.getByRole("link", { name: /Incoming/ })).toHaveAttribute(
      "title",
      "Incoming"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle navigation width" })
    );
    expect(shell).toHaveAttribute("data-collapsed", "false");
    expect(window.localStorage.getItem("cv-sidebar-collapsed")).toBe("false");
  });

  it("restores a previously collapsed sidebar", async () => {
    window.localStorage.setItem("cv-sidebar-collapsed", "true");
    const { container } = render(<AppShell>Workspace</AppShell>);

    await waitFor(() =>
      expect(container.firstElementChild).toHaveAttribute(
        "data-collapsed",
        "true"
      )
    );
    expect(
      screen.getByRole("button", { name: "Toggle navigation width" })
    ).toHaveAttribute("title", "Expand navigation");
  });

  it("opens and closes the mobile drawer with accessible controls", () => {
    const { container } = render(<AppShell>Workspace</AppShell>);
    const shell = container.firstElementChild;

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(shell).toHaveAttribute("data-mobile-open", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(shell).toHaveAttribute("data-mobile-open", "false");
  });

  it.each([
    ["light", "true", "false", "Use dark theme"],
    ["dark", "false", "true", "Use light theme"],
  ] as const)(
    "exposes a polished pressed-state theme group in %s mode",
    (resolvedTheme, lightPressed, darkPressed, mobileLabel) => {
      vi.mocked(useColorMode).mockReturnValue({
        mode: resolvedTheme,
        resolvedTheme,
        setMode,
        toggleMode,
      });

      render(<AppShell>Workspace</AppShell>);

      const themeGroup = screen.getByRole("group", { name: "Color theme" });
      const light = within(themeGroup).getByRole("button", {
        name: /^Light theme$/,
      });
      const dark = within(themeGroup).getByRole("button", {
        name: /^Dark theme$/,
      });

      expect(light).toHaveAttribute("aria-pressed", lightPressed);
      expect(light).toHaveAttribute("data-active", lightPressed);
      expect(dark).toHaveAttribute("aria-pressed", darkPressed);
      expect(dark).toHaveAttribute("data-active", darkPressed);
      expect(
        screen.getByRole("button", { name: mobileLabel })
      ).toBeInTheDocument();
    }
  );

  it("switches desktop and mobile themes through their intended controls", () => {
    render(<AppShell>Workspace</AppShell>);

    fireEvent.click(
      screen.getByRole("button", { name: /^Light theme$/ })
    );
    expect(setMode).toHaveBeenCalledWith("light");

    fireEvent.click(
      screen.getByRole("button", { name: /^Dark theme$/ })
    );
    expect(setMode).toHaveBeenCalledWith("dark");

    fireEvent.click(
      screen.getByRole("button", { name: /^Use dark theme$/ })
    );
    expect(toggleMode).toHaveBeenCalledTimes(1);
  });
});
