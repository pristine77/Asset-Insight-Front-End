# Asset and Lot Listing video links

Videos remain originals in R2 and the existing report media ZIP. The optional
backend YouTube integration is configured through the admin application, not
through appraiser credentials or browser uploads to Google. See the backend's
`docs/youtube-connection.md` for Google setup, publication and retry safeguards.
The public privacy notice and outstanding Google production gates
are tracked in `docs/youtube-privacy-review.md`; a working connection alone does
not establish policy compliance or public-upload approval.

Web Asset mixed lots send a `video_count` for every lot, including zero, and the
direct manifest maps each clip to its source `lotIndex`. Existing Lot Listing
and native mappings are unchanged. Explicit malformed/inconsistent counts fail
before upload. Legacy callers without counts remain unassigned rather than
guessing which lot owns a video.

Uploading media, saving a draft or submitting a report does not upload to
YouTube. An explicit reviewed report submission prepares metadata for a separate
admin video review. The administrator edits the title/description, chooses
Private/Unlisted/Public and explicitly consents before transfer. Files finish
without waiting for this optional step. Existing approval and release rules
govern public/unlisted visibility. Confirmed public/unlisted links are available
in the admin video list. Excel retains the original auction-import layout:
Asset has 18 columns ending with Schedule A; Lot Listing has 17 ending with
Condition Report. No YouTube column or link is added during initial generation
or regeneration. Existing files are not automatically rewritten or recovered.
PDF/DOCX layouts, stored links and video originals remain unchanged. No direct
Auctioneer API video field is added.

Backend/workers must be updated before admin/web. Existing mobile transport
works without a new binary. No historical upload, production mutation, new
package, deployment or push is implied by this change.
