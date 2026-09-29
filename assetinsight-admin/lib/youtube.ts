export type YouTubeStatus = {
  configured: boolean;
  configurationIssue: string | null;
  connected: boolean;
  needsReconnect: boolean;
  revision: number;
  channel: { id: string; title: string; url: string } | null;
  connectedAt: string | null;
  privacyStatus: "public" | "private";
  canConnect: boolean;
  canAcknowledgeRevocation: boolean;
  dataCleanup: { status: "not_requested" | "pending" | "completed"; requestedAt: string | null; completedAt: string | null; reason: string | null };
  revocation: { status: "not_requested" | "pending" | "completed" | "unavailable" | "needs_attention" | "manually_confirmed"; requestedAt: string | null; completedAt: string | null; manuallyConfirmedAt: string | null };
};
export type YouTubeCallback = { code: string; state: string };
const invalid = () => new Error("YouTube connection details could not be verified. Refresh and try again.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw invalid();
  return value;
}
export function parseYouTubeStatus(value: unknown): YouTubeStatus {
  const data = object(value);
  if (typeof data.configured !== "boolean" || typeof data.connected !== "boolean" || typeof data.needsReconnect !== "boolean" || !["public", "private"].includes(String(data.privacyStatus)) || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0) throw invalid();
  let channel: YouTubeStatus["channel"] = null;
  if (data.channel !== null) {
    const item = object(data.channel);
    const id = text(item.id, 100);
    if (!/^UC[\w-]{22}$/.test(id)) throw invalid();
    channel = { id, title: text(item.title, 300), url: `https://www.youtube.com/channel/${id}` };
  }
  if (data.connected !== Boolean(channel)) throw invalid();
  const connectedAt = data.connectedAt == null ? null : text(data.connectedAt, 50);
  if (connectedAt && !Number.isFinite(Date.parse(connectedAt))) throw invalid();
  function lifecycleDate(value: unknown): string | null {
    if (value == null) return null;
    const result = text(value, 50);
    if (!Number.isFinite(Date.parse(result))) throw invalid();
    return result;
  }
  const cleanup = data.dataCleanup === undefined ? { status: "not_requested" } : object(data.dataCleanup);
  const revocation = data.revocation === undefined ? { status: "not_requested" } : object(data.revocation);
  if (!["not_requested", "pending", "completed"].includes(String(cleanup.status)) || !["not_requested", "pending", "completed", "unavailable", "needs_attention", "manually_confirmed"].includes(String(revocation.status)) || (data.canConnect !== undefined && typeof data.canConnect !== "boolean") || (data.canAcknowledgeRevocation !== undefined && typeof data.canAcknowledgeRevocation !== "boolean")) throw invalid();
  return {
    configured: data.configured,
    configurationIssue: data.configurationIssue == null ? null : text(data.configurationIssue, 1000),
    connected: data.connected,
    needsReconnect: data.needsReconnect,
    revision: data.revision as number,
    channel,
    connectedAt,
    privacyStatus: data.privacyStatus as YouTubeStatus["privacyStatus"],
    canConnect: data.canConnect === true,
    canAcknowledgeRevocation: data.canAcknowledgeRevocation === true,
    dataCleanup: { status: cleanup.status as YouTubeStatus["dataCleanup"]["status"], requestedAt: lifecycleDate(cleanup.requestedAt), completedAt: lifecycleDate(cleanup.completedAt), reason: cleanup.reason == null ? null : text(cleanup.reason, 500) },
    revocation: { status: revocation.status as YouTubeStatus["revocation"]["status"], requestedAt: lifecycleDate(revocation.requestedAt), completedAt: lifecycleDate(revocation.completedAt), manuallyConfirmedAt: lifecycleDate(revocation.manuallyConfirmedAt) },
  };
}
export function youtubeConnectBody(value: Record<string, unknown>): { policyConsent: true } {
  if (Object.keys(value).length !== 1 || value.policyConsent !== true) throw new Error("Review and accept the YouTube terms and privacy policy before connecting.");
  return { policyConsent: true };
}
export function youtubeCompleteBody(value: Record<string, unknown>): YouTubeCallback {
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, "code") || !Object.hasOwn(value, "state")) throw invalid();
  const code = text(value.code, 4096);
  const state = text(value.state, 256);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(state)) throw invalid();
  return { code, state };
}
export function youtubeDisconnectBody(value: Record<string, unknown>): { revision: number } {
  if (Object.keys(value).length !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) throw new Error("Refresh the channel connection before disconnecting.");
  return { revision: value.revision as number };
}
export function youtubeEraseBody(value: Record<string, unknown>): { revision: number; confirm: true } {
  if (Object.keys(value).length !== 2 || value.confirm !== true || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) throw new Error("Refresh the connection and confirm removal before continuing.");
  return { revision: value.revision as number, confirm: true };
}
export function parseYouTubeCallback(search: string): YouTubeCallback {
  const params = new URLSearchParams(search);
  if (params.has("error")) throw new Error("Google authorization was not completed. Return to YouTube settings to start again.");
  if (params.getAll("code").length !== 1 || params.getAll("state").length !== 1) throw new Error("This connection link is incomplete or expired. Start again from YouTube settings.");
  return youtubeCompleteBody({ code: params.get("code"), state: params.get("state") });
}
export function parseYouTubeAuthorization(value: unknown, adminOrigin?: string): { authorizationUrl: string; expiresAt: string } {
  const data = object(value);
  const authorizationUrl = text(data.authorizationUrl, 8192);
  const url = new URL(authorizationUrl);
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash) throw invalid();
  if (["state", "response_type", "redirect_uri"].some(key => url.searchParams.getAll(key).length !== 1) || !/^[A-Za-z0-9_-]{32,256}$/.test(url.searchParams.get("state") || "") || url.searchParams.get("response_type") !== "code") throw invalid();
  const redirect = new URL(url.searchParams.get("redirect_uri") || "");
  if (redirect.pathname !== "/youtube/callback" || redirect.search || redirect.hash || redirect.username || redirect.password || (adminOrigin && redirect.origin !== adminOrigin)) throw invalid();
  const expiresAt = text(data.expiresAt, 50);
  if (!Number.isFinite(Date.parse(expiresAt))) throw invalid();
  return { authorizationUrl, expiresAt };
}
