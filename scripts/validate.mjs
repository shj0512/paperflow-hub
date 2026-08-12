import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../data/papers.json", import.meta.url), "utf8");
const data = JSON.parse(raw);
const requiredWritingKeys = ["question", "data", "draft", "format"];

if (!data.meta || !Array.isArray(data.papers) || data.papers.length !== 9) {
  throw new Error("Expected metadata and exactly 9 papers.");
}

const ids = new Set();
const codes = new Set();

for (const paper of data.papers) {
  if (!paper.id || !paper.shortCode || !paper.title || !paper.authors) throw new Error("Every paper needs id, shortCode, title and authors.");
  if (ids.has(paper.id)) throw new Error(`Duplicate paper id: ${paper.id}`);
  if (codes.has(paper.shortCode)) throw new Error(`Duplicate short code: ${paper.shortCode}`);
  if (!Number.isFinite(paper.progress) || paper.progress < 0 || paper.progress > 100) {
    throw new Error(`Invalid progress for ${paper.id}`);
  }
  const keys = (paper.writing || []).map((step) => step.key);
  for (const key of requiredWritingKeys) {
    if (!keys.includes(key)) throw new Error(`${paper.id} is missing writing step ${key}`);
  }
  ids.add(paper.id);
  codes.add(paper.shortCode);
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

for (const expected of ["roadmapChart", "paperList", "paperDialog", "toolsDialog"]) {
  if (!html.includes(`id=\"${expected}\"`)) throw new Error(`Missing interface mount: ${expected}`);
}
if (!js.includes("saveLocalDraft")) throw new Error("Management persistence is missing.");
if (!css.includes("--sky-100")) throw new Error("Theme variables are missing.");

console.log(`Validated ${data.papers.length} papers, ${ids.size} unique ids, and all interface mounts.`);
