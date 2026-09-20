import type { LucideIcon } from "lucide-react";
import {
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { AuthUser } from "@/services/auth";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
  visible?: (user: AuthUser | null) => boolean;
};

export const PRIMARY_NAVIGATION: readonly NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Incoming",
    href: "/incoming",
    icon: Inbox,
  },
  {
    label: "My Reports",
    href: "/reports",
    icon: FileText,
    match: (pathname) => pathname === "/reports" || pathname.startsWith("/reports/") || pathname.startsWith("/salvage/status/"),
  },
  {
    label: "Proposal Valuations",
    href: "/proposal-valuations",
    icon: ChartNoAxesColumnIncreasing,
    visible: (user) => Boolean(user?.proposalValuationEnabled),
  },
  {
    label: "Previews",
    href: "/previews",
    icon: FileCheck2,
    match: (pathname) => pathname === "/previews" || pathname.startsWith("/previews/") || pathname.startsWith("/salvage/preview/"),
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: ClipboardCheck,
    visible: (user) => Boolean(user?.isReportApprover),
  },
  {
    label: "Releases",
    href: "/releases",
    icon: ShieldCheck,
    visible: (user) => Boolean(user?.isReleaseManager),
  },
] as const;

export const SECONDARY_NAVIGATION: readonly NavItem[] = [
  {
    label: "Support",
    href: "/support",
    icon: LifeBuoy,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
] as const;

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.match
    ? item.match(pathname)
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/incoming": "Incoming",
  "/reports": "My Reports",
  "/proposal-valuations": "Proposal Valuation",
  "/previews": "Previews",
  "/approvals": "Approvals",
  "/releases": "Releases",
  "/support": "Support",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/create/asset": "Asset Report",
  "/create/lot-listing": "Lot Listing",
  "/salvage/status": "Salvage progress",
  "/salvage/preview": "Salvage preview",
};
