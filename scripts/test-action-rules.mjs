import assert from 'node:assert/strict';
import { actionRules, recommendNextAction, resolveActionRecommendation } from './action-rules.mjs';
for (const [stage, statuses] of Object.entries(actionRules)) for (const status of Object.keys(statuses)) {
  assert.ok(recommendNextAction(stage,status));
  assert.equal(resolveActionRecommendation({stage,status,value:''}).applied,true);
}
const writing = recommendNextAction('writing','manuscript_writing');
const review = recommendNextAction('submission','under_review');
assert.equal(resolveActionRecommendation({stage:'submission',status:'under_review',value:writing,previousAuto:writing}).value,review);
assert.deepEqual(resolveActionRecommendation({stage:'submission',status:'under_review',value:'我的自定义行动',previousAuto:writing}), {recommendation:review,applied:false,value:'我的自定义行动',autoValue:''});
assert.equal(resolveActionRecommendation({stage:'submission',status:'under_review',value:writing}).value,writing, 'Legacy text is manual even if equal to a rule');
assert.equal(resolveActionRecommendation({stage:'submission',status:'under_review',value:'已手动编辑',previousAuto:writing}).autoValue,'');
assert.equal(resolveActionRecommendation({stage:'unknown',status:'unknown',value:''}).value,'');
const paper = {nextAction:review,nextActionAuto:review,nextDue:'2026-11-01'};
const restored=JSON.parse(JSON.stringify(paper));
const result=resolveActionRecommendation({value:restored.nextAction,previousAuto:restored.nextActionAuto,stage:'submission',status:'revision_1'});
assert.equal(result.value,recommendNextAction('submission','revision_1'));
assert.equal(paper.nextDue,'2026-11-01');
console.log('Action rules: all 15 states, auto replacement, legacy/manual protection, unknown states and JSON round-trip passed.');
