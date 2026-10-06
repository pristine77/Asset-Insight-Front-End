import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ACTIVITY_LABELS, activityQuery, activityRemoval, activityIdValid, logoLabel, parseActivityPage, parseActivityDetail, parseActivityLotPage } from '../lib/reportActivity.ts';
test('offline review opens have a distinct searchable label, never a submission label', () => {
 assert.equal(ACTIVITY_LABELS.draft_opened, 'Draft opened for review');
 assert.equal(new URLSearchParams(activityQuery(new URLSearchParams('action=draft_opened'))).get('action'), 'draft_opened');
});
const id='a'.repeat(64);
const row={id,owner:{id:'a'.repeat(24),name:'Example',email:'test@example.test'},source:'web',reportType:'asset',contract:'93530',latestCounts:{lots:1,photos:2,mainPhotos:1,extraPhotos:1},revision:2};
test('last received native version is optional, bounded and labelled without inventing old versions',()=>{
 const page=lastReportedApp=>({data:{items:[{...row,lastReportedApp}],total:1,page:1,limit:25}});
 const version={appVersion:'1.0.1 (build 73)',source:'android',receivedAt:'2026-10-02T12:00:00Z'};
 assert.deepEqual(parseActivityPage(page(version)).items[0].lastReportedApp,version);
 assert.equal(parseActivityPage(page(null)).items[0].lastReportedApp,null);
 for(const change of [{appVersion:73},{appVersion:'x'.repeat(81)},{source:'guessed'},{receivedAt:'bad'}])assert.throws(()=>parseActivityPage(page({...version,...change})));
});
test('per-lot pages preserve numbers and unknown availability without inventing zeros', () => {
 const item={id,lotNumber:'X',position:4,photos:13,mainPhotos:10,extraPhotos:3,missingPhotos:null};
 const data={items:[item],total:43,page:1,limit:10,source:'report',asOf:null};
 assert.equal(parseActivityLotPage({data}).items[0].lotNumber,'X');
 assert.equal(parseActivityLotPage({data}).items[0].missingPhotos,null);
 for(const changes of [{photos:14},{extraPhotos:undefined},{mainPhotos:-1},{missingPhotos:14},{lotNumber:5}]) assert.throws(()=>parseActivityLotPage({data:{...data,items:[{...item,...changes}]}}));
 for(const changes of [{source:'unavailable'},{source:'guessed'},{asOf:'not-date'},{limit:101},{page:0}]) assert.throws(()=>parseActivityLotPage({data:{...data,...changes}}));
 assert.equal(parseActivityLotPage({data:{...data,source:'unavailable',total:0,items:[]}}).source,'unavailable');
 const route=readFileSync(new URL('../app/api/admin/report-activity/[id]/lots/route.ts',import.meta.url),'utf8');
 assert.match(route,/proxyJsonWithAdminAuth/); assert.match(route,/activityQuery/); assert.match(route,/no-store/);
});
test('unknown logo evidence is never shown as Off',()=>{assert.equal(logoLabel(null),'Not recorded');assert.equal(logoLabel(),'Not recorded');assert.equal(logoLabel(false),'Off');assert.equal(logoLabel(true),'On');});
test('bounded search, filters and identities',()=>{
 assert.equal(activityIdValid(id),true);assert.equal(activityIdValid('a'.repeat(24)),false);
 const query=new URLSearchParams(activityQuery(new URLSearchParams('search=93530%20%26%20B&action=preview_saved&role=superadmin')));
 assert.equal(query.get('search'),'93530 & B');assert.equal(query.has('role'),false);
 for(const q of ['page=0','limit=101','page=1&page=2','reportType=salvage','source=forged','from=2026-02-30','from=2026-09-19&to=2026-09-18'])assert.throws(()=>activityQuery(new URLSearchParams(q)));
});
test('removal accepts only reviewed revisions',()=>{assert.deepEqual(activityRemoval({revision:2}),{revision:2});for(const b of [{},{revision:-1},{revision:'2'},{revision:2,owner:'forged'}])assert.throws(()=>activityRemoval(b));});
test('malformed counts do not become zero and baselines keep unknown counts',()=>{
 const page=item=>({data:{items:[item],total:1,page:1,limit:25}});
 assert.equal(parseActivityPage(page({...row,latestCounts:null})).items[0].latestCounts,null);
 for(const counts of [{lots:1,photos:5,mainPhotos:1,extraPhotos:1},{lots:1,photos:0,mainPhotos:undefined,extraPhotos:0}])assert.throws(()=>parseActivityPage(page({...row,latestCounts:counts})));
});
test('preview links must remain local, exact and permission checked',()=>{
 const detail={...row,canViewValues:true,canOpenPreview:true,canRemove:true,reportExists:true,previewPath:'/preview-reports'};
 assert.equal(parseActivityDetail({data:detail}).previewPath,'/preview-reports');
 assert.equal(parseActivityDetail({data:{...detail,previewPath:'/reports/'+'b'.repeat(24)+'/data'}}).canOpenPreview,true);
 for(const path of ['https://example.test','//example.test','/reports/../data'])assert.throws(()=>parseActivityDetail({data:{...detail,previewPath:path}}));
});
test('admin BFF preserves auth boundary and guarded removal',()=>{
 const route=readFileSync(new URL('../app/api/admin/report-activity/[id]/route.ts',import.meta.url),'utf8');
 assert.match(route,/proxyJsonWithAdminAuth/);assert.match(route,/readPreviewMutationJson\(request, 1024\)/);assert.match(route,/activityRemoval/);
 const legacy=readFileSync(new URL('../app/offline-captures/page.tsx',import.meta.url),'utf8');assert.match(legacy,/report-activity\?tab=captures/);
});
