import assert from "node:assert/strict";
import { buildStatusTransition } from "./status-engine.mjs";

const result = buildStatusTransition({
  timeline: [],
  previousStage: "writing",
  previousStatus: "research_question",
  previousStartedAt: "2026-08-01",
  nextStage: "writing",
  nextStatus: "data_processing",
  effectiveAt: "2026-08-04",
  previousLabel: "问题提出中"
});

assert.equal(result.changed, true);
assert.equal(result.currentStartedAt, "2026-08-04");
assert.deepEqual(
  { ...result.timeline[0], id: "stable-for-test" },
  {
    id: "stable-for-test",
    stage: "writing",
    status: "research_question",
    label: "问题提出中",
    startedAt: "2026-08-01",
    endedAt: "2026-08-04"
  }
);

console.log("Status transition archived 2026-08-01 — 2026-08-04 and started data processing on 2026-08-04.");

const base = {timeline:[],previousStage:'writing',previousStatus:'manuscript_writing',previousStartedAt:'2026-08-01',nextStage:'submission',nextStatus:'under_review',effectiveAt:'2026-08-04',projectStartedAt:'2026-01-01',today:'2026-10-08'};
const crossStage=buildStatusTransition(base);
assert.equal(crossStage.timeline.length,1);
const unchanged=buildStatusTransition({...base,timeline:crossStage.timeline,previousStage:'submission',previousStatus:'under_review',previousStartedAt:'2026-08-04'});
assert.equal(unchanged.changed,false);
assert.equal(unchanged.timeline.length,1,'Repeated save must not archive again');
assert.throws(()=>buildStatusTransition({...base,effectiveAt:'2026-07-01'}));
assert.throws(()=>buildStatusTransition({...base,effectiveAt:'2027-01-01'}));
assert.throws(()=>buildStatusTransition({...base,effectiveAt:'2026-02-30'}));
assert.throws(()=>buildStatusTransition({...base,timeline:[{startedAt:'2026-01-01',endedAt:''}]}));
assert.throws(()=>buildStatusTransition({...base,timeline:[{startedAt:'2026-01-01',endedAt:'2026-08-02'}]}));
assert.throws(()=>buildStatusTransition({...base,nextStage:'writing',nextStatus:'manuscript_writing',effectiveAt:'2025-12-01'}));
assert.equal(buildStatusTransition({...base,archivePrevious:false}).timeline.length,0,'New projects do not archive a placeholder state');
const {readFile}=await import('node:fs/promises');
const {validateStatusDates}=await import('./status-engine.mjs');
for (const p of JSON.parse(await readFile(new URL('../data/papers.json',import.meta.url),'utf8')).papers) validateStatusDates({timeline:p.statusTimeline,currentStartedAt:p.statusStartedAt,projectStartedAt:p.startedAt,today:'2026-10-08'});
console.log('Timeline: cross-stage, duplicate-save prevention, invalid/overlapping/future dates, new projects and real-data compatibility passed.');
