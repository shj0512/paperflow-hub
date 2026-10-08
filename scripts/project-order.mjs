// Projects only: the array order is the saved custom order and every tie-breaker.
const revisions = new Set(["revision_1", "revision_2", "revision_3", "revision_resubmitted"]);
export function matchesStageFilter(paper, stage) {
  if (stage === "writing" || stage === "publication" || stage === "submission") return paper.focusStage === stage;
  if (stage === "review") return paper.focusStage === "submission" && ["under_review", "decision_pending"].includes(paper.statusCode);
  if (stage === "revision") return paper.focusStage === "submission" && revisions.has(paper.statusCode);
  return true;
}

function compareDate(left, right, descending = false) {
  const a = Date.parse(left || "");
  const b = Date.parse(right || "");
  if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : 0;
  if (!Number.isFinite(b)) return -1;
  return descending ? b - a : a - b;
}

export function selectProjects(papers, { query = "", stage = "all", sort = "custom", statusLabel = () => "" } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  const priority = { high: 3, medium: 2, low: 1 };
  return papers.map((paper, index) => ({ paper, index }))
    .filter(({ paper }) => {
      const text = [paper.title, paper.shortCode, paper.authors, paper.currentVenue, paper.nextAction,
        ...(paper.tags || []), statusLabel(paper.focusStage, paper.statusCode)].filter(Boolean).join(" ").toLocaleLowerCase();
      return (!needle || text.includes(needle)) && matchesStageFilter(paper, stage);
    })
    .sort((a, b) => {
      let result = 0;
      if (sort === "priority") result = (priority[b.paper.priority] || 0) - (priority[a.paper.priority] || 0);
      if (sort === "deadline") result = compareDate(a.paper.nextDue, b.paper.nextDue);
      if (sort === "updated") result = compareDate(a.paper.updatedAt, b.paper.updatedAt, true);
      if (sort === "started") result = compareDate(a.paper.startedAt, b.paper.startedAt, true);
      return result || a.index - b.index;
    }).map(({ paper }) => paper);
}

export function moveProject(papers, movedId, targetId, after = false) {
  if (movedId === targetId || !papers.some(p => p.id === movedId) || !papers.some(p => p.id === targetId)) return [...papers];
  const result = papers.filter(p => p.id !== movedId);
  result.splice(result.findIndex(p => p.id === targetId) + (after ? 1 : 0), 0, papers.find(p => p.id === movedId));
  return result;
}
