"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { youtubeVideoReviewBody, type YouTubeVideo, type YouTubeReviewBody } from "@/lib/youtubeVideos";

const consequences = {
  private: "Private: only the channel owner and people they specifically share with in YouTube can watch. This action uploads the video to Google.",
  unlisted: "Unlisted: anyone with the link can watch and share it. The link is available to authorized administrators after confirmation by YouTube. This is not private.",
  public: "Public: anyone can watch, search for and share this video. Its title and description will be visible on the channel and YouTube.",
} as const;

export default function YouTubeReviewDialog({ video, channelTitle, channelUrl, busy, fresh, onClose, onConfirm }: {
  video: YouTubeVideo; channelTitle: string; channelUrl: string; busy: boolean; fresh: boolean;
  onClose: () => void; onConfirm: (body: YouTubeReviewBody) => Promise<void>;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [privacyStatus, setPrivacyStatus] = useState<NonNullable<YouTubeVideo["privacyStatus"]>>(video.privacyStatus || "private");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const titleLength = [...title].length;
  const descriptionBytes = new TextEncoder().encode(description).length;
  const initialUpload = video.status === "pending_review";
  async function confirm() {
    if (busy || !fresh || !consent) return;
    try {
      const body = youtubeVideoReviewBody({ updatedAt: video.updatedAt, title, description, privacyStatus, policyConsent: true });
      setError(""); await onConfirm(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review the video details before continuing."); }
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} fullWidth maxWidth="sm" aria-labelledby="youtube-review-title">
    <DialogTitle id="youtube-review-title">{initialUpload ? "Review YouTube upload" : "Review YouTube video"}</DialogTitle>
    <DialogContent><Stack gap={2} sx={{ pt: 0.5 }}>
      <Typography variant="body2">{video.lotNumber ? `Lot ${video.lotNumber}` : "Report video"} · {video.reportType === "asset" ? "Asset" : "Lot Listing"}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>Destination channel: <Link href={channelUrl} target="_blank" rel="noopener noreferrer">{channelTitle}</Link></Typography>
      <Alert severity="info">Review the exact text below. It may include confidential source details: remove any contact details, private notes or claim information that should not be shared with viewers. Authorized Asset Insight administrators can inspect this shared-channel metadata.</Alert>
      {video.metadataOmitted ? <Alert severity="warning">The proposed report text is too long to show in this review. It has not been shortened or sent to YouTube. Enter a replacement YouTube title and description below; the original report text will remain unchanged.</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {!fresh ? <Alert severity="warning">The video or channel status changed. Close this review, refresh and review again. Nothing will be sent from this form.</Alert> : null}
      <TextField label="YouTube title" value={title} disabled={busy} onChange={event => { setTitle(event.target.value); setConsent(false); }} error={titleLength > 100} helperText={`${titleLength}/100 characters. Text is never shortened automatically.`} fullWidth />
      <TextField label="YouTube description" value={description} disabled={busy} onChange={event => { setDescription(event.target.value); setConsent(false); }} error={descriptionBytes > 5000} helperText={`${descriptionBytes.toLocaleString()}/5,000 UTF-8 bytes. Line breaks are retained.`} fullWidth multiline minRows={4} maxRows={10} />
      <TextField select label="YouTube visibility" value={privacyStatus} disabled={busy} onChange={event => { setPrivacyStatus(event.target.value as NonNullable<YouTubeVideo["privacyStatus"]>); setConsent(false); }} fullWidth><MenuItem value="private">Private</MenuItem><MenuItem value="unlisted">Unlisted</MenuItem><MenuItem value="public">Public</MenuItem></TextField>
      <Alert severity={privacyStatus === "private" ? "info" : "warning"}>{consequences[privacyStatus]} {privacyStatus !== "private" ? "Visibility changes wait for report approval and release; Google may impose additional restrictions." : ""}</Alert>
      <FormControlLabel sx={{ alignItems: "flex-start", ml: -1, mr: 0 }} control={<Checkbox checked={consent} disabled={busy || !fresh} onChange={event => setConsent(event.target.checked)} />} label={<Typography variant="body2" pt={1}>I have the required rights and authorization to send this video and the exact title and description above to YouTube on this shared channel with the selected visibility. I agree to the <Link href="https://assetinsightvaluator.com/terms/youtube" target="_blank" rel="noopener noreferrer">integration terms</Link>, <Link href="https://assetinsightvaluator.com/privacy#youtube-privacy" target="_blank" rel="noopener noreferrer">privacy policy</Link> and <Link href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</Link>.</Typography>} />
      <Typography color="text.secondary" variant="caption">This submits a request, not a guarantee of upload or visibility. Existing report files and original media are unchanged. YouTube links are not added to Excel.</Typography>
    </Stack></DialogContent>
    <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}><Button color="inherit" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="contained" sx={{ bgcolor: "primary.dark" }} disabled={busy || !fresh || !consent || titleLength > 100 || descriptionBytes > 5000} onClick={() => void confirm()}>{busy ? "Sending request…" : initialUpload ? "Send reviewed video to YouTube" : "Apply reviewed YouTube settings"}</Button></DialogActions>
  </Dialog>;
}
