import assert from 'node:assert/strict';
import { selectProjects, moveProject } from './project-order.mjs';
const papers = [
  {id:'low-pinned', priority:'low', pinned:true, nextDue:'2026-01-01', updatedAt:'2026-09-01', startedAt:'2025-02-01', focusStage:'writing', title:'Alpha'},
  {id:'medium-a', priority:'medium', nextDue:'', updatedAt:'2026-10-01', startedAt:'2025-01-01', focusStage:'writing', title:'Alpha'},
  {id:'high-a', priority:'high', nextDue:'2026-10-20', updatedAt:'2026-10-02T09:00:00Z', startedAt:'2026-01-01', focusStage:'submission', statusCode:'under_review', title:'Alpha'},
  {id:'medium-b', priority:'medium', nextDue:'2026-10-20', updatedAt:'2026-10-01', startedAt:'2025-01-01', focusStage:'submission', statusCode:'revision_1', title:'Beta'},
  {id:'high-b', priority:'high', nextDue:'', updatedAt:'2026-10-02T10:00:00Z', startedAt:'2026-02-01', focusStage:'writing', title:'Alpha'},
];
const ids = (options, source=papers) => selectProjects(source, options).map(p=>p.id);
const original = structuredClone(papers);
assert.deepEqual(ids({sort:'priority'}), ['high-a','high-b','medium-a','medium-b','low-pinned']);
assert.deepEqual(ids({sort:'deadline'}), ['low-pinned','high-a','medium-b','medium-a','high-b']);
assert.deepEqual(ids({sort:'updated'}), ['high-b','high-a','medium-a','medium-b','low-pinned']);
assert.deepEqual(ids({sort:'started'}), ['high-b','high-a','low-pinned','medium-a','medium-b']);
assert.deepEqual(ids({query:' alpha ',stage:'writing',sort:'priority'}), ['high-b','medium-a','low-pinned']);
assert.deepEqual(ids({stage:'review'}), ['high-a']);
assert.deepEqual(ids({stage:'revision'}), ['medium-b']);
assert.deepEqual(ids({stage:'submission',sort:'priority'}), ['high-a','medium-b']);
assert.deepEqual(papers, original, 'Sorting must not mutate custom order');
const reordered = moveProject(papers, 'high-b', 'low-pinned');
assert.deepEqual(reordered.map(p=>p.id), ['high-b','low-pinned','medium-a','high-a','medium-b']);
ids({sort:'deadline'}, reordered);
ids({sort:'priority'}, reordered);
assert.deepEqual(ids({sort:'custom'}, JSON.parse(JSON.stringify(reordered))), reordered.map(p=>p.id));
assert.deepEqual(moveProject(papers, 'missing', 'high-a'), papers);
const changed = reordered.filter(p=>p.id!=='medium-a').concat({id:'new',priority:'high'});
assert.deepEqual(ids({sort:'priority'}, changed), ['high-b','high-a','new','medium-b','low-pinned']);
assert.deepEqual(ids({sort:'updated'}, [{id:'missing'},{id:'invalid',updatedAt:'invalid'},{id:'dated',updatedAt:'2026-01-01'}]),['dated','missing','invalid']);
console.log('Project sorting: 5 modes, stable ties, combined filters, immutable custom order, reorder persistence and CRUD passed.');
