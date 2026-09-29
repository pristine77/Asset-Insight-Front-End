# YouTube privacy controls and production checklist

The public privacy pages accompany the review, revocation and cleanup controls.
Verify the public contact and site URLs for your deployment. Publishing source
does not constitute deployment, Google approval or channel connection.

## Public pages

Exactly `/privacy` and `/terms/youtube` are public for anonymous, pending-device
and authenticated visitors. Protected report routes and neighboring paths remain
gated. Both are static server components without API calls, YouTube embeds or new
tracking. The security-data notice remains alongside the YouTube disclosures.

The notice describes shared administrator authority, encrypted credentials,
original video/audio/embedded metadata transfer, explicit per-video review and
Private/Unlisted/Public selection. Google Privacy, YouTube Terms, account-access
revocation and Studio links remain directly accessible without signing in.

Admin connection consent is not upload permission. Explicit report submission
only prepares a review record. A separate administrator video review authorizes
upload, with initial private visibility; public/unlisted changes still require
the current report to be approved and released. Original report media/ZIPs are
unchanged. Excel keeps its original columns without a YouTube column; stored
video links remain available in admin. Existing files are not regenerated.

Revoke/erase controls stop future authorized work, request provider revocation
where possible, and remove the integration's cached credentials/channel/video
data in bounded maintenance. Pending work and uncertain provider outcomes are
not shown as completed. Manual confirmation of external Google revocation is
distinct from provider-confirmed revocation. Minimal suppression and operation
receipts remain. Historical report provenance, generated files, downloaded
copies, original media and YouTube-hosted videos are not silently rewritten or
deleted. Broader removal requests use the public contact. See backend
`docs/youtube-connection.md` for precise behavior and operational limitations.

## Rollout checklist

1. Deploy backend API and report workers together, then admin and web. No new
   packages, migrations or automatic report regeneration are required. Keep all
   four optional YouTube settings consistent across API/workers; do not rotate
   encryption keys as part of this change.
2. Verify anonymous and pending-device HTTP 200 and readable content at
   `https://assetinsightvaluator.com/privacy` and
   `https://assetinsightvaluator.com/terms/youtube`.
3. Save those exact URLs in the existing Google project's Branding settings;
   preserve the client ID, callback and scope. Do not publish a localhost URL.
4. Review Google production/verification requirements and provide genuine domain
   ownership and demo evidence. Pause for user authorization at Google consent
   or compliance declarations. Publishing the OAuth audience, sensitive-scope
   verification and YouTube's public-upload audit are separate requirements.
5. With explicit authorization, test one non-customer clip end to end. Local
   mocked tests do not prove Google grant, quota, channel access or public-upload
   eligibility. Do not upload customer originals as a smoke test.

Complete and record each rollout step for your own environment. Keep callback
logs free of authorization queries and referrers. No production operations or
Google activation are performed by synchronizing these repositories.

## Verification

Proxy tests cover anonymous, pending-device, access-cookie and refresh-cookie
readers and retained protected-path redirects. Static content tests check consent,
contact and accurate cleanup/visibility distinctions. The public-route E2E matrix
includes both pages. Record executed commands and browser checks at handoff;
added tests alone are not evidence of a passing run.

Executed locally on 29 September 2026 with environment-file reads and external
network access blocked: web typecheck, lint, production build and all 990 tests
passed; admin verification and all 90 policy tests passed; the frozen YouTube
backend integration/workflow gate passed all 190 tests, with backend typecheck,
build and report-workflow policy checks also passing.

These figures describe upstream checks. Re-run the independent backend and
frontend verification commands for this sanitized distribution before rollout.

Isolated production-browser checks covered exact per-video metadata, all three
visibility choices, fresh consent and reset-on-edit, accepted-versus-completed
status, cancelled removal, pending provider revocation after local cleanup,
manual external-revocation acknowledgement, keyboard dismissal/focus, narrow
320px layouts and dark mode. Public pages returned HTTP 200 for anonymous and
pending-device readers; protected neighboring paths still redirected. Keyboard
navigation between privacy and feature terms passed in both directions. Pointer
link activation could not be certified in the in-app browser; direct navigation,
link targets and keyboard activation passed. No live Google or customer media
was used. The test-only admin and API fixtures are not production evidence.

## References

- [Google OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Required YouTube functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [YouTube upload restrictions](https://developers.google.com/youtube/v3/docs/videos/insert)
