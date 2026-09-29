import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseYouTubeStatus, parseYouTubeAuthorization, parseYouTubeCallback, youtubeConnectBody, youtubeCompleteBody, youtubeDisconnectBody, youtubeEraseBody } from '../lib/youtube.ts';
import { readPreviewMutationJson } from '../lib/previewResubmitRequest.ts';
import { parseYouTubeVideoPage, youtubeVideoQuery, youtubeVideoRetryBody, youtubeVideoReviewBody } from '../lib/youtubeVideos.ts';

const state = 'a'.repeat(64);
const status = { configured: true, configurationIssue: null, connected: true, needsReconnect: false, revision: 1, channel: { id: 'UC' + 'a'.repeat(22), title: 'Example channel', url: 'https://malicious.example' }, connectedAt: '2026-09-28T12:00:00Z', privacyStatus: 'public', accessToken: 'never-browser' };
test('status projects only safe fields and a canonical channel URL', () => {
  const result = parseYouTubeStatus(status);
  assert.equal(result.channel.url, `https://www.youtube.com/channel/${status.channel.id}`);
  assert.equal('accessToken' in result, false);
  assert.equal(parseYouTubeStatus({ ...status, channel: { ...status.channel, title: 'x'.repeat(300) } }).channel.title.length, 300);
  assert.equal(parseYouTubeStatus({ ...status, connected: false, channel: null, revision: 0, connectedAt: null }).channel, null);
  assert.equal(result.canConnect, false);
  assert.equal(parseYouTubeStatus({ ...status, privacyStatus: 'private', canConnect: true }).canConnect, true);
  for (const bad of [{ revision: -1 }, { connected: 'true' }, { connected: false }, { channel: { id: 'evil', title: 'X' } }, { privacyStatus: 'unknown' }, { connectedAt: 'never' }, { canConnect: 'true' }]) assert.throws(() => parseYouTubeStatus({ ...status, ...bad }));
});
test('mutations have strict keys, consent and revision checks', () => {
  assert.deepEqual(youtubeConnectBody({ policyConsent: true }), { policyConsent: true });
  assert.deepEqual(youtubeCompleteBody({ code: 'google-code', state }), { code: 'google-code', state });
  assert.deepEqual(youtubeDisconnectBody({ revision: 2 }), { revision: 2 });
  for (const bad of [{}, { policyConsent: false }, { publicationConsent: true }, { policyConsent: true, channel: 'injected' }]) assert.throws(() => youtubeConnectBody(bad));
  for (const bad of [{ code: 'x', state: 'short' }, { code: 'x\nsecret', state }, { code: 'x', state, accessToken: 'x' }, { code: 'x'.repeat(4097), state }]) assert.throws(() => youtubeCompleteBody(bad));
  for (const bad of [{ revision: 0 }, { revision: '1' }, { revision: 1, channel: 'x' }]) assert.throws(() => youtubeDisconnectBody(bad));
});
test('callbacks do not reflect provider errors and reject repeated parameters', () => {
  assert.deepEqual(parseYouTubeCallback(`?code=abc&state=${state}&scope=ignored`), { code: 'abc', state });
  for (const query of [`?code=a&code=b&state=${state}`, `?code=a&state=${state}&state=${state}`, '?error=secret-provider-detail', '?code=a']) assert.throws(() => parseYouTubeCallback(query), error => !error.message.includes('secret-provider-detail'));
});
test('authorization navigation only accepts Google and the exact current callback origin', () => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('state', state); url.searchParams.set('response_type', 'code'); url.searchParams.set('redirect_uri', 'https://admin.example/youtube/callback');
  const value = { authorizationUrl: url.href, expiresAt: '2026-09-28T12:10:00Z' };
  assert.equal(parseYouTubeAuthorization(value, 'https://admin.example').authorizationUrl, url.href);
  for (const bad of [url.href.replace('accounts.google.com', 'evil.example'), url.href.replace('/v2/auth', '/wrong')]) assert.throws(() => parseYouTubeAuthorization({ ...value, authorizationUrl: bad }));
  assert.throws(() => parseYouTubeAuthorization(value, 'https://different.example'));
  url.searchParams.set('state', 'short'); assert.throws(() => parseYouTubeAuthorization({ ...value, authorizationUrl: url.href }));
});
test('cookie mutations require same-origin JSON and a streaming size bound', async () => {
  const request = (body, headers = {}) => new Request('https://admin.example/api/admin/youtube/connect', { method: 'POST', headers: { Origin: 'https://admin.example', 'content-type': 'application/json', ...headers }, body });
  assert.deepEqual(await readPreviewMutationJson(request('{"policyConsent":true}'), 1024), { policyConsent: true });
  await assert.rejects(readPreviewMutationJson(request('{}', { Origin: 'https://evil.example' }), 1024), { status: 403 });
  await assert.rejects(readPreviewMutationJson(request('{}', { 'content-type': 'text/plain' }), 1024), { status: 415 });
  await assert.rejects(readPreviewMutationJson(request(JSON.stringify({ data: 'x'.repeat(2048) })), 1024), { status: 413 });
});
test('privacy actions require exact fresh revision and affirmative confirmation', () => {
  for (const revision of [0, 1, 20]) assert.deepEqual(youtubeEraseBody({ revision, confirm: true }), { revision, confirm: true });
  for (const bad of [{}, { revision: 1 }, { revision: -1, confirm: true }, { revision: '1', confirm: true }, { revision: 1, confirm: false }, { revision: 1, confirm: true, videos: 'delete' }]) assert.throws(() => youtubeEraseBody(bad));
});
test('data cleanup and Google revocation remain separate, safe status projections', () => {
  const value = { ...status, canConnect: false, dataCleanup: { status: 'completed', requestedAt: '2026-09-29T12:00:00Z', completedAt: '2026-09-29T12:01:00Z', reason: 'admin_request', providerBody: 'secret' }, revocation: { status: 'needs_attention', requestedAt: '2026-09-29T12:00:00Z', completedAt: null, token: 'secret' } };
  const parsed = parseYouTubeStatus(value);
  assert.equal(parsed.dataCleanup.status, 'completed'); assert.equal(parsed.revocation.status, 'needs_attention');
  assert.equal(parsed.canAcknowledgeRevocation, false);
  const manuallyConfirmedAt = '2026-09-29T12:03:00Z';
  const confirmed = parseYouTubeStatus({ ...value, canAcknowledgeRevocation: true, revocation: { status: 'manually_confirmed', manuallyConfirmedAt } });
  assert.equal(confirmed.revocation.status, 'manually_confirmed'); assert.equal(confirmed.revocation.manuallyConfirmedAt, manuallyConfirmedAt);
  assert.equal('providerBody' in parsed.dataCleanup, false); assert.equal('token' in parsed.revocation, false);
  for (const patch of [{ dataCleanup: { status: 'unknown' } }, { revocation: { status: 'failed', completedAt: null } }, { dataCleanup: { status: 'pending', requestedAt: 'never' } }]) assert.throws(() => parseYouTubeStatus({ ...value, ...patch }));
});
test('video review retains exact text with Unicode character and UTF-8 byte limits', () => {
  const body = { updatedAt: '2026-09-29T12:00:00.000Z', title: '  Lot 12 · Reviewed title  ', description: 'Line one\nLine two\tTest', privacyStatus: 'private', policyConsent: true };
  assert.deepEqual(youtubeVideoReviewBody(body), body);
  for (const privacyStatus of ['private', 'unlisted', 'public']) assert.equal(youtubeVideoReviewBody({ ...body, privacyStatus }).privacyStatus, privacyStatus);
  assert.equal(youtubeVideoReviewBody({ ...body, title: '🚚'.repeat(100), description: '🚚'.repeat(1250) }).description.length, 2500);
  for (const patch of [{ title: '🚚'.repeat(101) }, { title: ' ' }, { title: '<title>' }, { title: 'title\nline' }, { title: '\ud800' }, { description: '🚚'.repeat(1251) }, { description: '<private>' }, { description: 'bad\0' }, { description: '\udfff' }, { privacyStatus: 'hidden' }, { policyConsent: false }, { updatedAt: 'yesterday' }, { sourceUrl: 'do-not-forward' }]) assert.throws(() => youtubeVideoReviewBody({ ...body, ...patch }));
});
test('review DTO adds capabilities without exposing stored source or assuming legacy authority', () => {
  const video = { id: 'a'.repeat(64), reportId: 'b'.repeat(24), reportType: 'lotListing', lotNumber: '12', status: 'pending_review', url: null, lastError: null, updatedAt: '2026-09-29T12:00:00Z', retryEligible: false, title: 'Lot 12', description: 'Exact text', privacyStatus: 'private', reviewRequired: true, reviewEligible: true, sourceUrl: 'secret' };
  const page = value => parseYouTubeVideoPage({ items: [value], page: 1, total: 1, totalPages: 1 }).items[0];
  assert.equal(page(video).reviewEligible, true); assert.equal('sourceUrl' in page(video), false);
  const legacy = { ...video }; delete legacy.reviewEligible; delete legacy.reviewRequired;
  assert.equal(page(legacy).reviewEligible, false);
  assert.equal(page(legacy).metadataOmitted, false);
  assert.equal(page({ ...video, title: '', description: '', metadataOmitted: true }).reviewEligible, true);
  assert.throws(() => page({ ...video, metadataOmitted: true }));
  assert.throws(() => page({ ...video, metadataOmitted: 'yes' }));
  for (const status of ['pending_review', 'unlisted', 'data_removed']) assert.equal(page({ ...video, status }).status, status);
  const removed = page({ ...video, status: 'data_removed', reportType: null, reportId: null, privacyStatus: null });
  assert.equal(removed.reportId, null); assert.equal(removed.title, ''); assert.equal(removed.privacyStatus, null); assert.equal(removed.reviewEligible, false);
  assert.equal(page({ ...video, status: 'data_removed', updatedAt: null }).updatedAt, null);
  for (const patch of [{ reviewEligible: 'yes' }, { privacyStatus: 'everyone' }, { description: 'x'.repeat(10001) }, { title: {} }]) assert.throws(() => page({ ...video, ...patch }));
});
test('review and privacy mutations remain bounded single-attempt BFF requests', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const route = source('../app/api/admin/youtube/videos/[id]/review/route.ts');
  assert.match(route, /readPreviewMutationJson\(request, 32_768\)/);
  assert.match(route, /youtubeVideoReviewBody/); assert.match(route, /replayAfterRefresh: false/);
  for (const action of ['revoke', 'erase-data', 'acknowledge-revocation']) assert.match(source(`../app/api/admin/youtube/${action}/route.ts`), /youtubeProxy/);
  const review = source('../app/components/youtube/YouTubeReviewDialog.tsx');
  assert.match(review, /useState\(false\)/); assert.match(review, /setConsent\(false\)/);
  assert.match(review, /www\.youtube\.com\/t\/terms/); assert.match(review, /assetinsightvaluator\.com\/privacy/);
  assert.match(review, /video\.metadataOmitted/); assert.match(review, /original report text will remain unchanged/);
  assert.doesNotMatch(review, /maxLength|\.slice\(/);
  const settings = source('../app/components/youtube/YouTubeSettings.tsx');
  assert.match(settings, /policyConsent: true/); assert.doesNotMatch(settings, /publicationConsent: true/);
  assert.match(settings, /!eraseConfirmed/); assert.match(settings, /myaccount\.google\.com\/connections/);
  assert.match(settings, /fetch\("\/api\/admin\/youtube\/revoke"/);
  assert.match(settings, /!acknowledgeConfirmed/); assert.match(settings, /!status\.canAcknowledgeRevocation/);
  assert.match(settings, /not a Google-verified revocation response/);
});
test('YouTube guidance retains the original Excel layout without regeneration advice', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const settings = source('../app/components/youtube/YouTubeSettings.tsx');
  assert.match(settings, /Excel keeps its original column layout without a YouTube column/);
  for (const file of ['YouTubeSettings', 'YouTubeVideos', 'YouTubeReviewDialog']) {
    const text = source(`../app/components/youtube/${file}.tsx`);
    assert.doesNotMatch(text, /regenerate[^.]*Excel links|regenerate[^.]*YouTube links in Excel|link may appear in report Excel exports/i);
  }
});
test('route and UI boundaries preserve roles, single attempts and credential stripping', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(source('../lib/requireOperationalAdminPage.ts'), /\["admin", "superadmin"\]/);
  assert.match(source('../lib/youtubeProxy.ts'), /replayAfterRefresh: action === "status"/);
  assert.match(source('../lib/adminProxy.ts'), /init\.replayAfterRefresh === false/);
  assert.match(source('../app/youtube/page.tsx'), /requireOperationalAdminPage/);
  assert.match(source('../app/youtube/callback/page.tsx'), /requireOperationalAdminPage/);
  const callback = source('../app/components/youtube/YouTubeCallback.tsx');
  assert.match(callback, /history\.replaceState/); assert.match(callback, /credentials\.current = null/);
  assert.doesNotMatch(callback, /localStorage|sessionStorage|console\./);
  assert.match(source('../app/components/common/AdminNavbarV2.tsx'), /href: "\/youtube"/);
  assert.match(source('../middleware.ts'), /renderUrl\.search = ""/);
});
test('video inventory is bounded, scoped and public links require a confirmed public status', () => {
  const video = { id: 'a'.repeat(64), reportId: 'b'.repeat(24), reportType: 'asset', lotNumber: '12A', status: 'public', url: 'https://www.youtube.com/watch?v=abcDEF123_-', lastError: null, updatedAt: '2026-09-28T12:00:00.000Z', retryEligible: false, sourceUrl: 'private-original' };
  const page = { items: [video], page: 1, total: 1, totalPages: 1 };
  assert.equal('sourceUrl' in parseYouTubeVideoPage(page).items[0], false);
  for (const patch of [{ status: 'private' }, { url: 'https://evil.example' }, { id: 'a'.repeat(24) }, { reportType: 'salvage' }, { updatedAt: 'bad' }]) assert.throws(() => parseYouTubeVideoPage({ ...page, items: [{ ...video, ...patch }] }));
  assert.throws(() => parseYouTubeVideoPage({ ...page, items: Array(21).fill(video) }));
  assert.equal(youtubeVideoQuery(new URLSearchParams('page=2')), 'page=2');
  for (const query of ['page=0', 'page=1&page=2', 'limit=100', 'reportId=abc']) assert.throws(() => youtubeVideoQuery(new URLSearchParams(query)));
  assert.deepEqual(youtubeVideoRetryBody({ updatedAt: video.updatedAt }), { updatedAt: video.updatedAt });
  assert.throws(() => youtubeVideoRetryBody({ updatedAt: video.updatedAt, privacyStatus: 'public' }));
});
