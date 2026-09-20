import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "cv_access_token";
const REFRESH_COOKIE = "cv_refresh_token";
const DEVICE_PENDING_COOKIE = "cv_device_pending";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/welcome" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
    || pathname.startsWith("/device-access")
  );
}

function isAuthPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  );
}

function getSessionState(request: NextRequest) {
  const hasAccessToken = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);
  const hasRefreshToken = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  return hasAccessToken || hasRefreshToken;
}

function getSafeNextPath(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");

  if (!next || !next.startsWith("/") || next.startsWith("//") || isAuthPath(next)) {
    return "/dashboard";
  }

  return next;
}

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const hasSession = getSessionState(request);
  const hasDeviceRequest = Boolean(request.cookies.get(DEVICE_PENDING_COOKIE)?.value);

  if (hasDeviceRequest && !hasSession && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/device-access", request.url));
  }

  if (pathname.startsWith("/device-access") && hasSession && !hasDeviceRequest) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath(pathname) && hasSession) {
    return NextResponse.redirect(new URL(getSafeNextPath(request), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
