import { NextResponse, type NextRequest } from "next/server";
import { proxyJsonWithAdminAuth } from "@/lib/adminProxy";
import { PreviewResubmitRequestError, readPreviewMutationJson } from "@/lib/previewResubmitRequest";
import { isYouTubeVideoId, youtubeVideoReviewBody, type YouTubeReviewBody } from "@/lib/youtubeVideos";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isYouTubeVideoId(id)) return NextResponse.json({ message: "Invalid video reference." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  let body: YouTubeReviewBody;
  try { body = youtubeVideoReviewBody(await readPreviewMutationJson(request, 32_768)); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid review request." }, { status: error instanceof PreviewResubmitRequestError ? error.status : 400, headers: { "Cache-Control": "no-store" } }); }
  try {
    const response = await proxyJsonWithAdminAuth(request, `/api/admin/youtube/videos/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), replayAfterRefresh: false });
    const headers = new Headers(response.headers); headers.set("Cache-Control", "no-store");
    // Acceptance is a request receipt, not proof of upload or visibility.
    return NextResponse.json(response.ok ? { accepted: true } : { message: response.status === 409 ? "This video or channel has changed. Refresh and review the current details before trying again." : response.status === 401 ? "Your admin session expired. Sign in again, then refresh and review this video." : "The YouTube review was not accepted. Refresh and check the title, description, report and channel before trying again." }, { status: response.status, headers });
  } catch { return NextResponse.json({ message: "The YouTube review response could not be confirmed. Refresh video status before trying again; do not start another upload." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
