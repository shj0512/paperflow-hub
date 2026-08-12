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
