/** Provider URLs and transport diagnostics are not user-facing recovery instructions. */
export function auctioneerErrorMessage(error: unknown, fallback: string): string {
  const value = error as {
    message?: unknown;
    response?: { status?: number; data?: { message?: unknown; error?: { message?: unknown } } };
  } | null;
  const status = value?.response?.status;
  const message =
    value?.response?.data?.message ?? value?.response?.data?.error?.message ?? value?.message;
  if (
    typeof message === 'string' &&
    message.trim() &&
    message.length < 500 &&
    !/https?:\/\/|localhost|127\.\d+\.\d+\.\d+|\[::1\]|status code|fetch failed|network error|timeout|ECONN|ENOTFOUND|<!doctype|<html|stack trace|is not a function|TypeError|SyntaxError/i.test(
      message
    )
  ) {
    return message.trim();
  }
  if (status === 401)
    return 'Your session has expired. Sign in again to load your assigned contracts.';
  if (status === 403)
    return 'Your account no longer has access to this work. Refresh Incoming or contact your administrator.';
  if (status === 409)
    return 'This assignment has changed. Refresh Incoming before continuing. Your saved reports and photos have not been removed.';
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (typeof message === 'string' && /could not reach|fetch failed/i.test(message))
  ) {
    return 'The server could not connect to Auctioneer. Retry shortly; if this continues, contact your administrator. Your saved reports and photos are unchanged.';
  }
  return fallback;
}
