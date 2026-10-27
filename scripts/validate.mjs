import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../data/papers.json", import.meta.url), "utf8");
const data = JSON.parse(raw);
const requiredWritingKeys = ["question", "data", "draft", "format"];

if (!data.meta || !Array.isArray(data.papers)) {
  throw new Error("Expected metadata and a papers array.");
}

const ids = new Set();
const codes = new Set();

for (const paper of data.papers) {
  if (!paper.id || !paper.shortCode || !paper.title || !paper.authors) throw new Error("Every paper needs id, shortCode, title and authors.");
  if (ids.has(paper.id)) throw new Error(`Duplicate paper id: ${paper.id}`);
  if (codes.has(paper.shortCode)) throw new Error(`Duplicate short code: ${paper.shortCode}`);
  if (paper.shortCode.length > 50) throw new Error(`Short code is longer than 50 characters: ${paper.id}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paper.startedAt)) throw new Error(`Missing or invalid start date: ${paper.id}`);
  if (!Number.isFinite(paper.progress) || paper.progress < 0 || paper.progress > 100) {
    throw new Error(`Invalid progress for ${paper.id}`);
  }
  const keys = (paper.writing || []).map((step) => step.key);
  for (const key of requiredWritingKeys) {
    if (!keys.includes(key)) throw new Error(`${paper.id} is missing writing step ${key}`);
  }
  ids.add(paper.id);
  codes.add(paper.shortCode);
  for (const milestone of paper.milestones || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(milestone.date || "") || !milestone.label) throw new Error(`Invalid research milestone: ${paper.id}`);
    if (milestone.endDate && milestone.endDate < milestone.date) throw new Error(`Invalid milestone interval: ${paper.id}`);
  }
}

if (ids.has("mic2025-success")) throw new Error("MIC2025 should be removed from the portfolio.");
const newProject = data.papers.find((paper) => paper.id === "curvilinear-mediation");
if (!newProject || newProject.milestones?.length < 3 || newProject.startDateEstimated !== true) {
  throw new Error("The new mediation methodology project requires its evidence-qualified research timeline.");
}
const published = data.papers.filter((paper) => paper.archived);
const collaborativePublished = (data.otherProjects || []).filter((paper) => paper.status === "published");
if (published.length !== 3 || collaborativePublished.length !== 2) throw new Error("Expected five archived publications (3 main, 2 collaborative).");
if ([...published, ...collaborativePublished].some((paper) => !paper.publication?.url && !paper.url)) {
  throw new Error("Archived publications should link to a verified publisher or DOI page.");
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

for (const expected of ["portfolioOverview", "metrics", "pipelineDistribution", "overviewPipelineSelection", "needsAttention", "paperList", "publicationArchive", "publicationFilters", "otherProjectsList", "allPapersDialog", "allPapersList", "paperDialog", "toolsDialog"]) {
  if (!html.includes(`id=\"${expected}\"`)) throw new Error(`Missing interface mount: ${expected}`);
}
if (!js.includes("saveLocalDraft")) throw new Error("Management persistence is missing.");
if (!js.includes("buildStatusTransition")) throw new Error("Automatic status timeline persistence is missing.");
for (const field of ["nextAction", "nextDue", "currentVenue", "priority", "pinned", "showInAttention"]) {
  if (!js.includes(field)) throw new Error(`Missing supported paper field: ${field}`);
}
for (const label of ["NEXT ACTION", "REFERENCE PROGRESS", "NEEDS ATTENTION", "PORTFOLIO OVERVIEW", "ALL PAPERS"]) {
  if (!html.includes(label) && !js.includes(label)) throw new Error(`Missing required interface label: ${label}`);
}
for (const bucket of ["writing", "submitted", "revision", "published"]) {
  if (!js.includes(`${bucket}: []`) || !js.includes(`\"${bucket}\"`)) throw new Error(`Missing interactive pipeline bucket: ${bucket}`);
}
if (js.includes('["accepted", "Accepted",')) throw new Error("Accepted must not be rendered as a standalone pipeline stage.");
if (js.includes('["accepted", "接收"]')) throw new Error("Accepted must not be selectable in the submission workflow.");
if (!js.includes("data.papers.forEach((paper) => buckets[pipelineBucket(paper)].push(paper))")) throw new Error("Pipeline counts must include every paper.");
if (!js.includes("reorderPapers")) throw new Error("Custom paper ordering is missing.");
if (!Array.isArray(data.otherProjects) || data.otherProjects.length !== 4) throw new Error("Expected four independent Other Projects.");
if (!js.includes("renderOtherProjects")) throw new Error("Other Projects rendering is missing.");
if (!js.includes("renderPublicationArchive") || !js.includes("renderResearchMilestones")) throw new Error("Archive or research milestone views are missing.");
if (js.includes("Waiting for external decision\", date: `Waiting")) throw new Error("Needs Attention must not display waiting-day counters.");
if (!css.includes("--blue-100")) throw new Error("Theme variables are missing.");

console.log(`Validated ${data.papers.length} papers, ${ids.size} unique ids, and all interface mounts. Project count may change in management mode.`);
