export type YouTubeVideo = {
  id: string; reportType: "asset" | "lotListing" | null; reportId: string | null; lotNumber: string;
  status: "pending_review" | "uploading" | "private" | "unlisted" | "public" | "needs_attention" | "data_removed";
  url: string | null; lastError: string | null; updatedAt: string | null; retryEligible: boolean;
  title: string; description: string; privacyStatus: "private" | "unlisted" | "public" | null;
  reviewRequired: boolean; reviewEligible: boolean;
  metadataOmitted: boolean;
};
export type YouTubeVideoPage = { items: YouTubeVideo[]; page: number; total: number; totalPages: number };
const invalid = () => new Error("Video status could not be verified. Refresh to try again.");
export const isYouTubeVideoId = (value: string) => /^[a-f0-9]{64}$/.test(value);
export function youtubeVideoQuery(params: URLSearchParams): string {
  if ([...params.keys()].some(key => key !== "page") || params.getAll("page").length > 1) throw invalid();
  const page = params.get("page") || "1";
  if (!/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10_000) throw invalid();
  return `page=${page}`;
}
export function youtubeVideoRetryBody(input: Record<string, unknown>): { updatedAt: string } {
  if (Object.keys(input).length !== 1 || typeof input.updatedAt !== "string" || input.updatedAt.length > 50 || !/^\d{4}-\d\d-\d\dT/.test(input.updatedAt) || !Number.isFinite(Date.parse(input.updatedAt))) throw new Error("Refresh this video before retrying publication.");
  return { updatedAt: input.updatedAt };
}
export type YouTubeReviewBody = { updatedAt: string; title: string; description: string; privacyStatus: NonNullable<YouTubeVideo["privacyStatus"]>; policyConsent: true };
const hasUnpairedSurrogate = (value: string) => [...value].some(character => character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff);
export function youtubeVideoReviewBody(input: Record<string, unknown>): YouTubeReviewBody {
  const keys = ["updatedAt", "title", "description", "privacyStatus", "policyConsent"];
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key)) || input.policyConsent !== true) throw new Error("Review this video and accept the privacy policy and YouTube terms.");
  const { updatedAt } = youtubeVideoRetryBody({ updatedAt: input.updatedAt });
  if (typeof input.title !== "string" || !input.title.trim() || [...input.title].length > 100 || /[<>\x00-\x1f\x7f]/.test(input.title) || hasUnpairedSurrogate(input.title)) throw new Error("Enter a title of 1–100 characters, without angle brackets or control characters.");
  if (typeof input.description !== "string" || new TextEncoder().encode(input.description).length > 5000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.description) || hasUnpairedSurrogate(input.description)) throw new Error("The description must be at most 5,000 UTF-8 bytes, without angle brackets or unsupported control characters.");
  if (!["private", "unlisted", "public"].includes(String(input.privacyStatus))) throw new Error("Choose a YouTube visibility setting.");
  return { updatedAt, title: input.title, description: input.description, privacyStatus: input.privacyStatus as YouTubeReviewBody["privacyStatus"], policyConsent: true };
}
export function parseYouTubeVideoPage(value: unknown): YouTubeVideoPage {
  if (!value || typeof value !== "object") throw invalid();
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.items) || data.items.length > 20 || !Number.isSafeInteger(data.page) || (data.page as number) < 1 || !Number.isSafeInteger(data.total) || (data.total as number) < 0 || !Number.isSafeInteger(data.totalPages) || (data.totalPages as number) < 0) throw invalid();
  const items = data.items.map((item): YouTubeVideo => {
    if (!item || typeof item !== "object") throw invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !isYouTubeVideoId(row.id)) throw invalid();
    if (row.status === "data_removed") {
      return { id: row.id, reportType: null, reportId: null, lotNumber: "", status: "data_removed", url: null, lastError: null,
        updatedAt: row.updatedAt == null ? null : youtubeVideoRetryBody({ updatedAt: row.updatedAt }).updatedAt, retryEligible: false,
        title: "", description: "", privacyStatus: null, reviewRequired: false, reviewEligible: false, metadataOmitted: false };
    }
    if (typeof row.id !== "string" || !isYouTubeVideoId(row.id) || !["asset", "lotListing"].includes(String(row.reportType)) || typeof row.reportId !== "string" || !/^[a-f\d]{24}$/i.test(row.reportId) || typeof row.lotNumber !== "string" || row.lotNumber.length > 200 || !["pending_review", "uploading", "private", "unlisted", "public", "needs_attention", "data_removed"].includes(String(row.status)) || typeof row.retryEligible !== "boolean") throw invalid();
    const updatedAt = youtubeVideoRetryBody({ updatedAt: row.updatedAt }).updatedAt;
    if (row.url !== null && (typeof row.url !== "string" || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(row.url) || !["public", "unlisted"].includes(String(row.status)))) throw invalid();
    if (row.lastError !== null && (typeof row.lastError !== "string" || row.lastError.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(row.lastError))) throw invalid();
    // Older servers can still be inspected, but absence of review capability never authorizes a mutation.
    const reviewRequired = row.reviewRequired === undefined ? false : row.reviewRequired;
    const reviewEligible = row.reviewEligible === undefined ? false : row.reviewEligible;
    const metadataOmitted = row.metadataOmitted === undefined ? false : row.metadataOmitted;
    if (typeof reviewRequired !== "boolean" || typeof reviewEligible !== "boolean" || typeof metadataOmitted !== "boolean") throw invalid();
    const title = row.title === undefined ? "" : row.title;
    const description = row.description === undefined ? "" : row.description;
    const privacyStatus = row.privacyStatus === undefined ? "private" : row.privacyStatus;
    if (typeof title !== "string" || title.length > 1000 || typeof description !== "string" || description.length > 10000 || !["private", "unlisted", "public"].includes(String(privacyStatus))) throw invalid();
    if (metadataOmitted && (title || description)) throw invalid();
    return { id: row.id, reportType: row.reportType as YouTubeVideo["reportType"], reportId: row.reportId, lotNumber: row.lotNumber, status: row.status as YouTubeVideo["status"], url: row.url as string | null, lastError: row.lastError as string | null, updatedAt, retryEligible: row.retryEligible, title, description, privacyStatus: privacyStatus as YouTubeVideo["privacyStatus"], reviewRequired, reviewEligible, metadataOmitted };
  });
  return { items, page: data.page as number, total: data.total as number, totalPages: data.totalPages as number };
}
