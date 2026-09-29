"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, Divider, Link, Paper, Stack, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { parseYouTubeVideoPage, type YouTubeVideo, type YouTubeVideoPage, type YouTubeReviewBody } from "@/lib/youtubeVideos";
import type { YouTubeStatus } from "@/lib/youtube";
import YouTubeReviewDialog from "@/app/components/youtube/YouTubeReviewDialog";

const labels = { pending_review: "Review required", uploading: "Uploading", private: "Private", unlisted: "Unlisted", public: "Public", needs_attention: "Needs attention", data_removed: "Data removed" } as const;
export default function YouTubeVideos({ channel, connectionRevision, connectionReady }: { channel: YouTubeStatus["channel"]; connectionRevision: number; connectionReady: boolean }) {
  const [data, setData] = useState<YouTubeVideoPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [review, setReview] = useState<{ video: YouTubeVideo; channel: NonNullable<YouTubeStatus["channel"]>; connectionRevision: number } | null>(null);
  const read = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    setLoading(true); setFresh(false); setError(""); setReview(null);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/admin/youtube/videos?page=${page}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Video status is unavailable. Refresh to try again.");
      const value = parseYouTubeVideoPage(await response.json());
      if (mounted.current && read.current === controller) { setData(value); setCheckedAt(new Date()); setFresh(true); }
    } catch (cause) {
      if (mounted.current && read.current === controller) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The video status check timed out. Refresh to try again.");
    } finally { window.clearTimeout(timeout); if (mounted.current && read.current === controller) setLoading(false); }
  }, [page]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; read.current?.abort(); read.current = null; }; }, [load, connectionRevision]);
  async function retry(video: YouTubeVideo) {
    if (pending.current || !fresh || !video.retryEligible) return;
    pending.current = true; setBusyId(video.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/youtube/videos/${video.id}/retry-publication`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatedAt: video.updatedAt }), signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("Publication retry was not accepted. Refresh and check the report release and channel connection.");
      if (mounted.current) { setNotice("Publication retry requested. Refresh video status to see the confirmed outcome."); await load(); }
    } catch (cause) {
      if (mounted.current) { setFresh(false); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The retry response could not be confirmed. Refresh before trying again."); }
    } finally { pending.current = false; if (mounted.current) setBusyId(""); }
  }
  async function submitReview(body: YouTubeReviewBody) {
    if (pending.current || !fresh || !review || !connectionReady || review.connectionRevision !== connectionRevision || review.channel.id !== channel?.id) return;
    pending.current = true; setBusyId(review.video.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/youtube/videos/${review.video.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "The YouTube review was not accepted. Refresh and review the current video before trying again.");
      if (mounted.current) { setReview(null); setNotice("Reviewed YouTube request accepted. Refresh to check the upload and visibility outcome. Report files are unchanged; YouTube links are not added to Excel."); await load(); }
    } catch (cause) {
      if (mounted.current) { setFresh(false); setReview(null); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The review response could not be confirmed. Refresh before trying again; do not start another upload."); }
    } finally { pending.current = false; if (mounted.current) setBusyId(""); }
  }
  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }} aria-busy={loading || Boolean(busyId)}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
      <Typography component="h2" variant="h6" fontSize={18}>Video publication</Typography>
      <Button size="small" color="inherit" startIcon={<RefreshCw size={15} />} disabled={loading || Boolean(busyId)} onClick={() => void load()}>Refresh videos</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" mb={1.5}>Review required means no new video bytes are sent until an administrator reviews its channel, title, description and visibility. Public and Unlisted mean confirmed by YouTube. Requested visibility may still be waiting for release or Google eligibility.</Typography>
    {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
    {notice ? <Alert severity="info" sx={{ mb: 1.5 }}>{notice}</Alert> : null}
    {loading && !data ? <Typography role="status" color="text.secondary">Loading video status…</Typography> : data?.items.length === 0 ? <Typography color="text.secondary" variant="body2">No report videos have been prepared for YouTube.</Typography> : null}
    <Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0 }} divider={<Divider component="li" aria-hidden />}>
      {data?.items.map(video => <Box component="li" key={video.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 110px minmax(0,1.6fr) auto" }, gap: { xs: 1, md: 2 }, py: 1.5, alignItems: "start", minWidth: 0 }}>
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}><Typography fontWeight={650} variant="body2">{video.status === "data_removed" ? "Removal record" : video.lotNumber ? `Lot ${video.lotNumber}` : "Report video"}</Typography>{video.title ? <Typography variant="body2">{video.title}</Typography> : null}{video.metadataOmitted ? <Typography variant="body2" color="text.secondary">Proposed text is too long; enter replacement YouTube text in review.</Typography> : null}{video.reportId ? <Typography variant="caption" color="text.secondary" display="block">{video.reportType === "asset" ? "Asset" : "Lot Listing"} · {video.reportId}</Typography> : null}</Box>
        <Chip size="small" variant="outlined" sx={{ justifySelf: "start", color: "text.primary" }} color={video.status === "needs_attention" ? "warning" : video.status === "public" ? "success" : "default"} label={labels[video.status]} />
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}><Typography variant="body2">{video.lastError || (video.status === "public" ? "Public visibility confirmed." : video.status === "unlisted" ? "Available to anyone with the link." : video.status === "private" ? "Private on YouTube." : video.status === "pending_review" ? "Waiting for administrator review before upload." : video.status === "data_removed" ? "Stored YouTube data removed." : "Status will update after processing.")}</Typography>{video.status === "needs_attention" && !video.retryEligible ? <Typography variant="caption" color="text.secondary">If an upload outcome is uncertain, check YouTube Studio before attempting another upload.</Typography> : null}<Typography variant="caption" color="text.secondary" display="block">Updated {video.updatedAt ? new Date(video.updatedAt).toLocaleString() : "Not recorded"}</Typography></Box>
        <Stack gap={1} alignItems="flex-start">{video.url ? <Link href={video.url} color="inherit" rel="noopener noreferrer" target="_blank" fontSize={14}>Open video</Link> : null}{video.reviewEligible ? <Button size="small" color="inherit" variant="outlined" disabled={!fresh || Boolean(busyId) || !connectionReady || !channel} onClick={() => { if (channel) setReview({ video, channel, connectionRevision }); }}>{video.reviewRequired ? "Review video" : "Edit YouTube settings"}</Button> : null}{video.retryEligible && !video.reviewRequired ? <Button size="small" color="inherit" variant="outlined" disabled={!fresh || Boolean(busyId) || !connectionReady} onClick={() => void retry(video)}>{busyId === video.id ? "Requesting…" : "Retry reviewed request"}</Button> : null}</Stack>
      </Box>)}
    </Stack>
    <Stack mt={1.5} gap={1} direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between">
      <Typography variant="caption" color="text.secondary">Last checked: {checkedAt ? checkedAt.toLocaleString() : "Not yet checked"}{!fresh && checkedAt ? " · Previous snapshot" : ""}{data ? ` · ${data.total} videos` : ""}</Typography>
      {data && data.totalPages > 1 ? <Stack direction="row" alignItems="center" gap={1}><Button size="small" color="inherit" disabled={loading || Boolean(busyId) || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Typography variant="caption">{data.page} / {data.totalPages}</Typography><Button size="small" color="inherit" disabled={loading || Boolean(busyId) || page >= data.totalPages} onClick={() => setPage(value => value + 1)}>Next</Button></Stack> : null}
    </Stack>
    {review ? <YouTubeReviewDialog key={`${review.video.id}:${review.video.updatedAt}`} video={review.video} channelTitle={review.channel.title} channelUrl={review.channel.url} busy={Boolean(busyId)} fresh={fresh && connectionReady && review.connectionRevision === connectionRevision && review.channel.id === channel?.id} onClose={() => setReview(null)} onConfirm={submitReview} /> : null}
  </Paper>;
}
