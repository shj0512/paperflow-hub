import { selectProjects, moveProject } from "./scripts/project-order.mjs";
import { recommendNextAction, resolveActionRecommendation } from "./scripts/action-rules.mjs";
import { buildStatusTransition } from "./scripts/status-engine.mjs";
import { initTodoBoard } from "./scripts/todo-board.mjs";

const DATA_URL = "./data/papers.json";
const STORAGE_KEY = "paperflow-draft-v1";
const MIGRATION_BACKUP_KEY = "paperflow-draft-pre-20261027-backup";
const REPO_EDIT_URL = "https://github.com/shj0512/paperflow-hub/edit/main/data/papers.json";

const defaultWritingSteps = [
  { key: "question", label: "问题提出中", status: "pending" },
  { key: "data", label: "数据处理中", status: "pending" },
  { key: "draft", label: "文本撰写中", status: "pending" },
  { key: "format", label: "格式修改中", status: "pending" }
];

const stageNames = {
  writing: "撰写阶段",
  submission: "投稿阶段",
  publication: "发表阶段"
};

const stageStatuses = {
  writing: [
    ["research_question", "问题提出中"],
    ["data_processing", "数据处理中"],
    ["manuscript_writing", "文本撰写中"],
    ["formatting", "格式修改中"]
  ],
  submission: [
    ["under_review", "Under Review"],
    ["revision_1", "1st Revision"],
    ["revision_2", "2nd Revision"],
    ["revision_3", "3rd Revision"],
    ["revision_resubmitted", "已修回"],
    ["decision_pending", "Decision Pending"],
    ["rejected", "拒稿"]
  ],
  publication: [
    ["forthcoming", "Forthcoming"],
    ["online_first", "Online First"],
    ["published", "已发表"],
    ["archived", "已归档"]
  ]
};

const priorityNames = { high: "High Priority", medium: "Medium Priority", low: "Low Priority" };
const revisionStatuses = new Set(["revision_1", "revision_2", "revision_3", "revision_resubmitted"]);
const reviewStatuses = new Set(["under_review", "decision_pending"]);
const externalWaitingStatuses = new Set(["under_review", "decision_pending", "revision_resubmitted"]);

const els = {
  lastUpdatedLabel: document.querySelector("#lastUpdatedLabel"),
  footerUpdatedLabel: document.querySelector("#footerUpdatedLabel"),
  focusContent: document.querySelector("#focusContent"),
  focusPriority: document.querySelector("#focusPriority"),
  metrics: document.querySelector("#metrics"),
  pipelineDistribution: document.querySelector("#pipelineDistribution"),
  overviewPipelineSelection: document.querySelector("#overviewPipelineSelection"),
  needsAttention: document.querySelector("#needsAttention"),
  paperList: document.querySelector("#paperList"),
  publicationArchive: document.querySelector("#publicationArchive"),
  publicationFilters: document.querySelector("#publicationFilters"),
  publicationCount: document.querySelector("#publicationCount"),
  otherProjectsList: document.querySelector("#otherProjectsList"),
  searchInput: document.querySelector("#searchInput"),
  stageFilter: document.querySelector("#stageFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  addPaperButton: document.querySelector("#addPaperButton"),
  headerAddPaperButton: document.querySelector("#headerAddPaperButton"),
  toggleManageButton: document.querySelector("#toggleManageButton"),
  editCodesButton: document.querySelector("#editCodesButton"),
  openToolsButton: document.querySelector("#openToolsButton"),
  headerPublishButton: document.querySelector("#headerPublishButton"),
  openAllPapersButton: document.querySelector("#openAllPapersButton"),
  allPapersDialog: document.querySelector("#allPapersDialog"),
  closeAllPapersButton: document.querySelector("#closeAllPapersButton"),
  allPapersList: document.querySelector("#allPapersList"),
  allPapersModeHint: document.querySelector("#allPapersModeHint"),
  paperDialog: document.querySelector("#paperDialog"),
  paperForm: document.querySelector("#paperForm"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  dialogHint: document.querySelector("#dialogHint"),
  savePaperButton: document.querySelector("#savePaperButton"),
  codesDialog: document.querySelector("#codesDialog"),
  codesForm: document.querySelector("#codesForm"),
  codesEditor: document.querySelector("#codesEditor"),
  toolsDialog: document.querySelector("#toolsDialog"),
  closeToolsButton: document.querySelector("#closeToolsButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  publishButton: document.querySelector("#publishButton"),
  resetButton: document.querySelector("#resetButton"),
  publishDialog: document.querySelector("#publishDialog"),
  closePublishButton: document.querySelector("#closePublishButton"),
  copyDataButton: document.querySelector("#copyDataButton"),
  githubEditLink: document.querySelector("#githubEditLink"),
  draftBanner: document.querySelector("#draftBanner"),
  draftPublishButton: document.querySelector("#draftPublishButton"),
  toast: document.querySelector("#toast")
};

let publishedData;
let data;
let isManageMode = false;
let hasLocalDraft = false;
let activePaperId = null;
let actionAutoValue = "";
let lastRecommendationValue = "";
let isCreatingPaper = false;
let newPaperDraft = null;
let toastTimer;
let selectedPipelineBucket = null;
let draggedPaperId = null;
let todoBoard;
let publicationFilter = "all";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromISO(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function signedDaysBetween(start, end) {
  const startDate = dateFromISO(start);
  const endDate = dateFromISO(end);
  if (!startDate || !endDate) return null;
  return Math.round((endDate - startDate) / 86400000);
}

function daysBetween(start, end) {
  const days = signedDaysBetween(start, end);
  return days === null ? null : Math.max(0, days);
}

function formatDate(value, fallback = "待补充") {
  const date = dateFromISO(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatEnglishDate(value, fallback = "Not set") {
  const date = dateFromISO(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatEnglishMonth(value, fallback = "—") {
  const date = dateFromISO(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

function formatMonth(value, fallback = "待补充") {
  const date = dateFromISO(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);
}

function durationText(start, end = todayISO()) {
  const days = daysBetween(start, end);
  return days === null ? "日期待校正" : `已历时 ${days} 天`;
}

function statusPeriodText(start, end) {
  const duration = daysBetween(start, end || todayISO());
  const range = `${formatDate(start)} — ${end ? formatDate(end) : "至今"}`;
  return duration === null ? range : `${range} · ${duration} 天`;
}

function statusLabel(stage, status) {
  if (stage === "submission" && status === "accepted") return "接收（历史记录）";
  return stageStatuses[stage]?.find(([value]) => value === status)?.[1] || "状态待设置";
}

function defaultStatusForStage(stage) {
  return stageStatuses[stage]?.[0]?.[0] || "";
}

function inferLegacyStatus(paper, stage) {
  if (paper.statusCode && stageStatuses[stage]?.some(([value]) => value === paper.statusCode)) return paper.statusCode;
  const source = `${paper.stageLabel || ""} ${paper.venueSummary || ""}`.toLocaleLowerCase();
  if (stage === "publication") {
    if (source.includes("online")) return "online_first";
    return source.includes("发表") || source.includes("published") ? "published" : "forthcoming";
  }
  if (stage === "submission") {
    if (source.includes("已修回") || source.includes("returned") || source.includes("resubmitted")) return "revision_resubmitted";
    if (source.includes("三轮") || source.includes("r3") || source.includes("3rd revision")) return "revision_3";
    if (source.includes("二轮") || source.includes("r2") || source.includes("2nd revision")) return "revision_2";
    if (source.includes("一轮") || source.includes("r1") || source.includes("major revision") || source.includes("1st revision")) return "revision_1";
    if (source.includes("reject") || source.includes("拒稿")) return "rejected";
    if (source.includes("accept") || source.includes("接收")) return "accepted";
    if (source.includes("decision pending")) return "decision_pending";
    return "under_review";
  }
  if (source.includes("polish") || source.includes("格式") || source.includes("润色")) return "formatting";
  if (source.includes("rewrite") || source.includes("writing") || source.includes("撰写") || source.includes("重写")) return "manuscript_writing";
  if (source.includes("数据") || source.includes("data")) return "data_processing";
  return "research_question";
}

function normalizeSubmissionStatus(status, paperStatus) {
  if (stageStatuses.submission.some(([value]) => value === status)) return status;
  if (status === "submitted") return "under_review";
  if (status === "revision") return paperStatus?.startsWith("revision_") ? paperStatus : "revision_1";
  if (status === "rejected") return status;
  if (status === "accepted") return "accepted";
  return "under_review";
}

function normalizeTimelineItem(item) {
  const rawStage = item.stage === "revision" ? "submission" : item.stage === "accepted" ? "publication" : item.stage;
  const stage = stageStatuses[rawStage] ? rawStage : "writing";
  const status = stageStatuses[stage].some(([value]) => value === item.status)
    ? item.status
    : inferLegacyStatus({ statusCode: item.status, stageLabel: item.label }, stage);
  return { ...item, stage, status, label: statusLabel(stage, status) };
}

function venueFromLegacy(paper) {
  if (paper.currentVenue != null) return paper.currentVenue;
  const journal = [...(paper.submissions || [])].reverse().find((item) => item.journal)?.journal;
  if (journal) return journal;
  const summary = String(paper.venueSummary || "");
  return summary.includes("·") ? summary.split("·")[0].trim() : "";
}

function normalizePaper(paper) {
  const rawStage = paper.focusStage === "revision" ? "submission" : paper.focusStage === "accepted" ? "publication" : paper.focusStage;
  let focusStage = stageStatuses[rawStage] ? rawStage : "writing";
  let statusCode = inferLegacyStatus(paper, focusStage);
  if (focusStage === "submission" && statusCode === "accepted") {
    focusStage = "publication";
    statusCode = inferLegacyStatus(paper, focusStage);
  }
  const writingByKey = new Map((paper.writing || []).map((item) => [item.key, item]));
  const writing = defaultWritingSteps.map((fallback) => ({ ...fallback, ...(writingByKey.get(fallback.key) || {}), label: fallback.label }));
  const submissions = (paper.submissions || []).map((item) => ({
    ...item,
    journal: item.journal || "",
    status: normalizeSubmissionStatus(item.status, statusCode),
    statusStartedAt: item.statusStartedAt || item.submittedAt || paper.statusStartedAt || paper.startedAt || "",
    statusEndedAt: item.statusEndedAt || item.decisionAt || ""
  }));
  const defaultPriority = focusStage === "publication" ? "low" : "medium";
  return {
    ...paper,
    focusStage,
    statusCode,
    stageLabel: statusLabel(focusStage, statusCode),
    statusStartedAt: paper.statusStartedAt || paper.startedAt || todayISO(),
    statusTimeline: Array.isArray(paper.statusTimeline) ? paper.statusTimeline.map(normalizeTimelineItem) : [],
    progress: clamp(paper.progress, 0, 100),
    priority: priorityNames[paper.priority] ? paper.priority : defaultPriority,
    pinned: Boolean(paper.pinned),
    nextAction: paper.nextAction || "",
    nextDue: paper.nextDue || "",
    currentVenue: venueFromLegacy(paper),
    lastActionAt: paper.lastActionAt || paper.updatedAt || paper.startedAt || "",
    updatedAt: paper.updatedAt || todayISO(),
    showOnRoadmap: paper.showOnRoadmap !== false,
    showInAttention: paper.showInAttention !== false,
    archived: paper.archived === true,
    milestones: Array.isArray(paper.milestones) ? paper.milestones : [],
    publication: paper.publication || null,
    tags: Array.isArray(paper.tags) ? paper.tags : [],
    links: Array.isArray(paper.links) ? paper.links : [],
    notes: paper.notes || "",
    writing,
    submissions
  };
}

function normalizePortfolio(value) {
  return { ...value, meta: { ...value.meta, version: Math.max(7, Number(value.meta?.version || 0)) }, papers: (value.papers || []).map(normalizePaper) };
}

function mergePublishedFields(draft, published) {
  const publishedById = new Map((published.papers || []).map((paper) => [paper.id, paper]));
  const removedIds = new Set(published.meta?.removedPaperIds || []);
  const existing = (draft.papers || []).filter((paper) => !removedIds.has(paper.id));
  const existingIds = new Set(existing.map((paper) => paper.id));
  // 旧版本草稿不丢弃：保留工作进度，只补入这一版正式新增的项目。
  for (const id of published.meta?.addedPaperIds || []) {
    if (!existingIds.has(id) && publishedById.has(id)) existing.push(deepClone(publishedById.get(id)));
  }
  const originalOther = new Map((draft.otherProjects || []).map((project) => [project.id, project]));
  return {
    ...draft,
    meta: { ...draft.meta, ...published.meta, lastUpdated: draft.meta?.lastUpdated || published.meta.lastUpdated },
    papers: existing.map((paper) => {
      const source = publishedById.get(paper.id) || {};
      return {
        ...paper,
        // 正式出版信息以核实过的站点数据为准，其余本机工作记录仍然保留。
        ...(source.archived ? { title: source.title, authors: source.authors, archived: true, publication: source.publication,
          links: source.links, currentVenue: source.currentVenue, venueSummary: source.venueSummary } : {}),
        nextAction: source.archived ? "" : paper.nextAction ?? source.nextAction ?? "",
        nextDue: paper.nextDue ?? source.nextDue ?? "",
        venueSummary: source.archived ? source.venueSummary : paper.venueSummary ?? source.venueSummary ?? "",
        currentVenue: source.archived ? source.currentVenue : paper.currentVenue ?? venueFromLegacy(source),
        notes: paper.notes ?? source.notes ?? ""
      };
    }),
    otherProjects: [...(published.otherProjects || []).map((project) => project.archived ? project : originalOther.get(project.id) || project),
      ...(draft.otherProjects || []).filter((project) => !(published.otherProjects || []).some((source) => source.id === project.id))]
  };
}

function isValidData(value) {
  return Boolean(value?.meta && Array.isArray(value.papers) && value.papers.every((paper) => paper.id && paper.title && paper.shortCode));
}

function createPaperId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `paper-${randomPart}`;
}

function createBlankPaper() {
  return normalizePaper({
    id: createPaperId(), title: "", shortCode: "", authors: "", focusStage: "writing", statusCode: "research_question",
    statusStartedAt: todayISO(), statusTimeline: [], milestones: [], progress: 0, priority: "medium", pinned: false, nextAction: "", nextDue: "",
    currentVenue: "", lastActionAt: todayISO(), startedAt: todayISO(), updatedAt: todayISO(), showOnRoadmap: true, showInAttention: true,
    submissions: [], writing: deepClone(defaultWritingSteps), tags: [], links: [], notes: ""
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function setDraftState(isDraft) {
  hasLocalDraft = isDraft;
  els.draftBanner.hidden = !(isDraft && isManageMode);
}

function saveLocalDraft() {
  data.meta.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setDraftState(true);
}

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  publishedData = normalizePortfolio(await response.json());
  const localDraft = localStorage.getItem(STORAGE_KEY);
  if (localDraft) {
    try {
      const parsed = JSON.parse(localDraft);
      if (isValidData(parsed) && Number(parsed.meta.version || 0) >= 6) {
        const needsMigration = Number(parsed.meta.version || 0) < Number(publishedData.meta.version || 0);
        if (needsMigration && !localStorage.getItem(MIGRATION_BACKUP_KEY)) {
          localStorage.setItem(MIGRATION_BACKUP_KEY, localDraft);
        }
        data = normalizePortfolio(needsMigration ? mergePublishedFields(parsed, publishedData) : parsed);
        if (needsMigration) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setDraftState(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  if (!data) data = deepClone(publishedData);
  if (!todoBoard) {
    todoBoard = initTodoBoard({
      root: document.querySelector("#dailyTodoBoard"),
      getPortfolio: () => data,
      notify: showToast
    });
  }
  renderAll();
}

function priorityWeight(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

function isReviewPaper(paper) {
  return paper.focusStage === "submission" && reviewStatuses.has(paper.statusCode);
}

function isRevisionPaper(paper) {
  return paper.focusStage === "submission" && revisionStatuses.has(paper.statusCode);
}

function deadlineInfo(paper) {
  if (!paper.nextDue) return { tone: "none", days: null, label: "No deadline" };
  const days = signedDaysBetween(todayISO(), paper.nextDue);
  if (days === null) return { tone: "none", days: null, label: "Date needs review" };
  if (days < 0) return { tone: "overdue", days, label: `${Math.abs(days)} days overdue` };
  if (days === 0) return { tone: "due-soon", days, label: "Due today" };
  if (days <= 14) return { tone: "due-soon", days, label: `${days} days remaining` };
  return { tone: "normal", days, label: `${days} days remaining` };
}

function waitingDays(paper) {
  return externalWaitingStatuses.has(paper.statusCode) ? daysBetween(paper.statusStartedAt, todayISO()) || 0 : 0;
}

function staleDays(paper) {
  return daysBetween(paper.lastActionAt || paper.updatedAt, todayISO()) || 0;
}

function focusScore(paper) {
  const due = deadlineInfo(paper);
  return [
    paper.pinned ? 1 : 0,
    due.tone === "overdue" ? 1 : 0,
    due.tone === "due-soon" ? 1 : 0,
    paper.priority === "high" ? 1 : 0,
    isRevisionPaper(paper) ? 1 : 0,
    waitingDays(paper),
    staleDays(paper)
  ];
}

function compareScore(a, b) {
  const left = focusScore(a);
  const right = focusScore(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

function getFocusPaper() {
  return data.papers.filter((paper) => !isArchivedPaper(paper)).sort(compareScore)[0] || null;
}

function isArchivedPaper(paper) {
  return paper.archived === true || (paper.focusStage === "publication" && ["published", "archived"].includes(paper.statusCode));
}

// Needs Attention retains its own ranking; Projects uses project-order.mjs.
function compareDeadline(a, b) {
  if (!a.nextDue && !b.nextDue) return compareScore(a, b);
  if (!a.nextDue) return 1;
  if (!b.nextDue) return -1;
  return String(a.nextDue).localeCompare(String(b.nextDue));
}

function renderAll() {
  renderHero();
  renderOverview();
  renderAttention();
  todoBoard?.render();
  renderPaperList();
  renderPublicationArchive();
  renderOtherProjects();
  renderAllPapersList();
  renderManageState();
}

function renderHero() {
  const updated = String(data.meta.manualUpdatedAt || data.meta.lastUpdated || todayISO()).slice(0, 10);
  els.lastUpdatedLabel.textContent = `Updated ${formatEnglishMonth(updated)}`;
  els.footerUpdatedLabel.textContent = `Last updated ${formatEnglishMonth(updated)}`;
  const paper = getFocusPaper();
  if (!paper) {
    els.focusPriority.textContent = "";
    els.focusContent.innerHTML = `<div class="empty-state">尚无论文项目。进入 Manage Mode 后可以新增。</div>`;
    return;
  }
  const due = deadlineInfo(paper);
  const waiting = waitingDays(paper);
  const action = paper.nextAction || (waiting ? `Waiting for external decision · ${waiting} days` : "Set the next action in Manage Mode");
  els.focusPriority.className = `focus-priority priority-${paper.priority}`;
  els.focusPriority.textContent = `${paper.pinned ? "Pinned · " : ""}${priorityNames[paper.priority]}`;
  els.focusContent.innerHTML = `
    <button class="focus-open" type="button" data-focus-open="${escapeHTML(paper.id)}">
      <span class="focus-code">${escapeHTML(paper.shortCode)}</span>
      <h2>${escapeHTML(paper.title)}</h2>
    </button>
    <p class="focus-status-line"><span class="status-dot ${statusTone(paper)}"></span>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}${paper.currentVenue ? ` · ${escapeHTML(paper.currentVenue)}` : ""}</p>
    <div class="focus-action"><span>NEXT ACTION</span><strong>${escapeHTML(action)}</strong></div>
    <div class="focus-deadline ${due.tone}">
      <span>${escapeHTML(deadlineText(paper, true))}</span>
      <strong>${paper.nextDue ? due.label : paper.priority === "high" ? "High priority" : ""}</strong>
    </div>
    <div class="focus-progress">
      <div><span>REFERENCE PROGRESS</span><strong>${clamp(paper.progress, 0, 100)}%</strong></div>
      <div class="progress-track"><span class="progress-fill" style="width:${clamp(paper.progress, 0, 100)}%"></span></div>
    </div>
  `;
}

function pipelineBucket(paper) {
  if (paper.focusStage === "writing") return "writing";
  if (paper.focusStage === "publication" || paper.statusCode === "accepted") return "published";
  if (revisionStatuses.has(paper.statusCode)) return "revision";
  return "submitted";
}

function getPipelineBuckets() {
  const buckets = { writing: [], submitted: [], revision: [], published: [] };
  data.papers.forEach((paper) => buckets[pipelineBucket(paper)].push(paper));
  return buckets;
}

function portfolioCounts() {
  const buckets = getPipelineBuckets();
  return {
    submitted: buckets.submitted.length,
    revision: buckets.revision.length,
    published: buckets.published.length,
    writing: buckets.writing.length
  };
}

function renderOverview() {
  const counts = portfolioCounts();
  const metrics = [
    ["撰写中", "WRITING", counts.writing, "writing"],
    ["投稿 / 审稿中", "SUBMITTED", counts.submitted, "submitted"],
    ["返修中", "REVISION", counts.revision, "revision"],
    ["已发表", "PUBLISHED", counts.published, "published"]
  ];
  els.metrics.innerHTML = metrics.map(([label, english, value, tone]) => `
    <button class="metric metric-${tone} ${selectedPipelineBucket === tone ? "active" : ""}" type="button" data-pipeline-bucket="${tone}" aria-expanded="${selectedPipelineBucket === tone}"><span>${label}</span><strong>${value}</strong><small>${english}</small></button>
  `).join("");

  const distribution = [
    ["Writing", counts.writing, "writing"], ["Submitted", counts.submitted, "submitted"], ["Revision", counts.revision, "revision"], ["Published", counts.published, "published"]
  ];
  const projectTotal = distribution.reduce((sum, [, value]) => sum + value, 0);
  const distributionBase = projectTotal || 1;
  els.pipelineDistribution.innerHTML = `
    <div class="distribution-heading"><strong>Pipeline Distribution</strong><span>${projectTotal} projects</span></div>
    <div class="distribution-bar">${distribution.map(([label, value, tone]) => `<button class="${tone} ${selectedPipelineBucket === tone ? "active" : ""}" style="width:${(value / distributionBase) * 100}%" type="button" data-pipeline-bucket="${tone}" aria-label="${label}: ${value} projects"></button>`).join("")}</div>
    <div class="distribution-labels">${distribution.map(([label, value, tone]) => `<button class="${selectedPipelineBucket === tone ? "active" : ""}" type="button" data-pipeline-bucket="${tone}"><i class="${tone}"></i>${label}<strong>${value}</strong></button>`).join("")}</div>
  `;
  renderPipelineSelection();
}

function attentionReason(paper) {
  const due = deadlineInfo(paper);
  const tone = due.tone === "overdue" || due.tone === "due-soon" ? due.tone : isRevisionPaper(paper) ? "revision" : "priority";
  return {
    tone,
    text: paper.nextAction || statusLabel(paper.focusStage, paper.statusCode),
    date: paper.nextDue ? `${formatEnglishDate(paper.nextDue)} · ${due.label}` : priorityNames[paper.priority]
  };
}

function renderAttention() {
  const order = new Map(data.papers.map((paper, index) => [paper.id, index]));
  const items = data.papers
    .filter((paper) => paper.showInAttention !== false && paper.focusStage !== "publication")
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || compareDeadline(a, b) || order.get(a.id) - order.get(b.id))
    .map((paper) => ({ paper, reason: attentionReason(paper) }))
    .slice(0, 4);
  if (!items.length) {
    els.needsAttention.innerHTML = `<div class="attention-empty">当前没有逾期、临近截止或长期停滞的项目。</div>`;
    return;
  }
  els.needsAttention.innerHTML = items.map(({ paper, reason }) => `
    <button class="attention-item ${reason.tone}" type="button" data-attention-id="${escapeHTML(paper.id)}">
      <span class="attention-line"></span>
      <strong>${escapeHTML(paper.shortCode)}</strong>
      <p>${escapeHTML(reason.text)}</p>
      <small>${escapeHTML(reason.date)}</small>
    </button>
  `).join("");
}

function renderPipelineSelection() {
  const buckets = getPipelineBuckets();
  const labels = { writing: ["Writing", "撰写阶段"], submitted: ["Submitted", "投稿 / 审稿阶段"], revision: ["Revision", "返修阶段"], published: ["Published", "已发表 / 已完成"] };
  const target = els.overviewPipelineSelection;
  const visible = Boolean(selectedPipelineBucket);
  target.hidden = !visible;
  if (!visible) {
    target.innerHTML = "";
    return;
  }
    const papers = buckets[selectedPipelineBucket] || [];
    const [english, chinese] = labels[selectedPipelineBucket];
    target.innerHTML = `
      <div class="pipeline-selection-heading">
        <div><span class="section-kicker">${english} PROJECTS</span><h3>${chinese} · ${papers.length} 篇</h3></div>
        <button type="button" data-close-pipeline-selection aria-label="关闭论文清单">×</button>
      </div>
      <div class="pipeline-paper-list">${papers.length ? papers.map((paper) => `
        <button class="pipeline-paper-item" type="button" data-pipeline-paper-id="${escapeHTML(paper.id)}">
          <span><strong>${escapeHTML(paper.shortCode)}</strong><small>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</small></span>
          <p>${escapeHTML(paper.title)}</p>
          <i aria-hidden="true">→</i>
        </button>
      `).join("") : `<div class="empty-state">当前没有处于该阶段的论文。</div>`}</div>
    `;
}

function togglePipelineSelection(bucket) {
  const closing = selectedPipelineBucket === bucket;
  selectedPipelineBucket = closing ? null : bucket;
  renderOverview();
}

function getFilteredPapers() {
  const source = data.papers.filter((paper) => els.stageFilter.value === "publication" ? paper.focusStage === "publication" : !isArchivedPaper(paper));
  return selectProjects(source, {
    query: els.searchInput.value, stage: els.stageFilter.value, sort: els.sortSelect.value, statusLabel
  });
}

function statusTone(paper) {
  if (paper.statusCode === "rejected") return "rejected";
  if (paper.focusStage === "publication" || paper.statusCode === "accepted") return "published";
  if (isRevisionPaper(paper)) return "revision";
  if (isReviewPaper(paper)) return "review";
  return "writing";
}

function cardActionText(paper) {
  if (paper.nextAction) return paper.nextAction;
  const waiting = waitingDays(paper);
  if (waiting) return `Waiting for external decision · ${waiting} days`;
  return "Next action not set";
}

function deadlineText(paper, withHint = false) {
  if (paper.nextDue) return `Due ${formatEnglishDate(paper.nextDue)} · ${deadlineInfo(paper).label}`;
  if (!paper.nextAction && waitingDays(paper)) return `Waiting ${waitingDays(paper)} days`;
  return withHint && isManageMode ? "Deadline not set · 点击项目设置" : "Deadline not set";
}

function renderPaperList() {
  const papers = getFilteredPapers();
  const activeCount = data.papers.filter((paper) => !isArchivedPaper(paper)).length;
  document.querySelector("#projectListHint").textContent = `${papers.length} / ${els.stageFilter.value === "publication" ? data.papers.filter((paper) => paper.focusStage === "publication").length : activeCount} projects · 已发表论文收录于 Publications；Sort 仅影响 Projects。${isManageMode && els.sortSelect.value === "custom" ? " 拖动卡片或使用 ↑ ↓ 保存自定义顺序。" : ""}`;
  if (!papers.length) {
    els.paperList.innerHTML = `<div class="empty-state">没有找到匹配的论文项目。</div>`;
    return;
  }
  els.paperList.innerHTML = papers.map(renderPaperCard).join("");
}

function renderPaperCard(paper) {
  const due = deadlineInfo(paper);
  const progress = clamp(paper.progress, 0, 100);
  const sortable = isManageMode && els.sortSelect.value === "custom";
  return `
    <article class="paper-card ${sortable ? "is-sortable" : ""}" data-paper-id="${escapeHTML(paper.id)}" data-sort-paper-id="${escapeHTML(paper.id)}" draggable="${sortable}">
      <div class="paper-info">
        <div class="paper-topline">${sortable ? `<span class="drag-handle" draggable="true" title="拖动排序" aria-hidden="true">⠿</span>` : ""}<span class="paper-code">${escapeHTML(paper.shortCode)}</span><span class="status-badge ${statusTone(paper)}">${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</span></div>
        <h3><button class="paper-title-button" type="button" data-open-paper-id="${escapeHTML(paper.id)}">${escapeHTML(paper.title)}</button></h3>
        <p class="paper-stage">${escapeHTML(stageNames[paper.focusStage])}</p>
        <p class="paper-venue">${escapeHTML(paper.currentVenue || "研究进行中")}</p>
        ${paper.milestones?.length ? `<p class="paper-milestone-quick">◷ ${escapeHTML(paper.milestones.length)} 个研究节点 · ${escapeHTML(paper.milestones.at(-1).label)}</p>` : ""}
      </div>
      <div class="paper-action">
        <span class="card-label">NEXT ACTION</span>
        <strong>${escapeHTML(cardActionText(paper))}</strong>
        <p class="deadline ${due.tone}">${escapeHTML(deadlineText(paper, true))}</p>
      </div>
      <div class="paper-progress">
        <span class="card-label">REFERENCE PROGRESS</span>
        <strong>${progress}%</strong>
        <div class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></div>
        <small>Started ${formatEnglishMonth(paper.startedAt)}</small>
      </div>
      <div class="paper-controls">
        ${isManageMode ? `<label class="card-priority-label"><span>Priority</span><select data-priority-id="${escapeHTML(paper.id)}" aria-label="${escapeHTML(paper.shortCode)} Priority">${optionsHtml(priorityNames, paper.priority)}</select></label>` : `<span class="priority-label priority-${paper.priority}"><i></i>${priorityNames[paper.priority]}</span>`}
        <small>Updated ${formatEnglishDate(paper.updatedAt)}</small>
        <div class="card-buttons">
          <button class="button ${isManageMode ? "button-primary" : ""}" type="button" data-open-paper-id="${escapeHTML(paper.id)}">${isManageMode ? "管理项目" : "查看项目"}</button>
          ${sortable ? `<div class="order-buttons"><button class="button" type="button" data-move-id="${escapeHTML(paper.id)}" data-move-direction="-1" aria-label="上移 ${escapeHTML(paper.shortCode)}">↑</button><button class="button" type="button" data-move-id="${escapeHTML(paper.id)}" data-move-direction="1" aria-label="下移 ${escapeHTML(paper.shortCode)}">↓</button></div>` : ""}
        </div>
      </div>
    </article>
  `;
}

function otherProjectTone(project) {
  if (project.status === "published") return "published";
  if (project.status === "minor_revision") return "revision";
  return "review";
}

function otherProjectStatus(project) {
  return { published: "Published", minor_revision: "Minor Revision", under_review: "Under Review" }[project.status] || "In Progress";
}

function getPublicationRecords() {
  const leads = data.papers.filter(isArchivedPaper).map((paper) => ({
    id: paper.id, role: "lead", year: Number(paper.publication?.year) || 0,
    title: paper.title, authors: paper.authors, venue: paper.currentVenue,
    citation: paper.publication?.citation || paper.venueSummary || "出版信息待补充",
    doi: paper.publication?.doi || "", url: paper.publication?.url || ""
  }));
  const collaborations = (data.otherProjects || []).filter((project) => project.status === "published").map((project) => ({
    id: project.id, role: "collaboration", year: Number(project.year) || 0,
    title: project.title, authors: project.authors, venue: project.venue,
    citation: project.citation || "出版信息待补充", doi: project.doi || "", url: project.url || ""
  }));
  return [...leads, ...collaborations].sort((a, b) => b.year - a.year || (a.role === "lead" ? -1 : 1) - (b.role === "lead" ? -1 : 1) || a.title.localeCompare(b.title, "zh-CN"));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? escapeHTML(url.href) : "";
  } catch { return ""; }
}

function citationText(paper) {
  const source = paper.citation.toLocaleLowerCase().includes(paper.venue.toLocaleLowerCase())
    ? paper.citation : `${paper.venue}, ${paper.citation}`;
  return `${paper.authors}. ${paper.title}. ${source}.${paper.doi ? ` DOI: ${paper.doi}` : ""}`;
}

function renderPublicationArchive() {
  const all = getPublicationRecords();
  const filterOptions = [["all", "全部成果", all.length], ["lead", "主导研究", all.filter((item) => item.role === "lead").length],
    ["collaboration", "合作研究", all.filter((item) => item.role === "collaboration").length]];
  els.publicationCount.textContent = String(all.length).padStart(2, "0");
  els.publicationFilters.innerHTML = filterOptions.map(([value, label, count]) => `
    <button type="button" class="publication-filter ${publicationFilter === value ? "active" : ""}" data-archive-filter="${value}" aria-pressed="${publicationFilter === value}">${label} <span>${count}</span></button>
  `).join("");
  const visible = all.filter((item) => publicationFilter === "all" || item.role === publicationFilter);
  if (!visible.length) {
    els.publicationArchive.innerHTML = `<div class="empty-state">此分类暂无已发表成果。</div>`;
    return;
  }
  const years = [...new Set(visible.map((item) => item.year))];
  els.publicationArchive.innerHTML = years.map((year) => {
    const entries = visible.filter((item) => item.year === year);
    return `<section class="publication-year-group" aria-label="${year || "待补充年份"} 年成果">
      <div class="publication-year-heading"><h3>${year || "年份待补充"}</h3><span>${entries.length} papers</span></div>
      <div class="publication-grid">${entries.map((item) => {
        const url = safeExternalUrl(item.url);
        const articleLink = url ? `<a class="publication-link" href="${url}" target="_blank" rel="noopener noreferrer">${item.doi ? "查看 DOI / 原文" : "期刊页面"} <span aria-hidden="true">↗</span></a>` : "";
        return `<article class="publication-card">
          <div class="publication-card-top"><span class="publication-role ${item.role}">${item.role === "lead" ? "主导研究" : "合作研究"}</span><span class="publication-card-year">${year || "—"}</span></div>
          <h4>${escapeHTML(item.title)}</h4>
          <p class="publication-authors">${escapeHTML(item.authors)}</p>
          <div class="publication-bibliography"><strong>${escapeHTML(item.venue || "期刊待补充")}</strong><span>${escapeHTML(item.citation)}</span>${item.doi ? `<small>DOI: ${escapeHTML(item.doi)}</small>` : ""}</div>
          <div class="publication-actions">${articleLink}${item.role === "lead" ? `<button type="button" data-archive-open="${escapeHTML(item.id)}">研究历程</button>` : ""}<button type="button" data-archive-copy="${escapeHTML(item.id)}">复制引用</button></div>
        </article>`;
      }).join("")}</div>
    </section>`;
  }).join("");
}

function renderOtherProjects() {
  const projects = Array.isArray(data.otherProjects) ? data.otherProjects.filter((project) => project.status !== "published") : [];
  if (!projects.length) {
    els.otherProjectsList.innerHTML = `<div class="empty-state">当前没有进行中的合作项目；已发表合作论文已移至 Publications。</div>`;
    return;
  }
  els.otherProjectsList.innerHTML = projects.map((project, index) => `
    <article class="other-project-card">
      <div class="other-project-topline">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span class="status-badge ${otherProjectTone(project)}">${otherProjectStatus(project)}</span>
      </div>
      <h3>${escapeHTML(project.title)}</h3>
      <p class="other-project-authors">${escapeHTML(project.authors)}</p>
      <div class="other-project-meta">
        <strong>${escapeHTML(project.venue || "Venue not set")}</strong>
        <span>${escapeHTML(project.citation || otherProjectStatus(project))}</span>
      </div>
    </article>
  `).join("");
}

function renderAllPapersList() {
  if (!data || !els.allPapersList) return;
  els.allPapersModeHint.textContent = isManageMode ? "Manage Mode · 拖动排序" : "Reading Mode";
  els.allPapersList.innerHTML = data.papers.map((paper, index) => `
    <article class="all-paper-item ${isManageMode ? "is-sortable" : ""}" data-sort-paper-id="${escapeHTML(paper.id)}" draggable="${isManageMode}">
      <span class="all-paper-index">${String(index + 1).padStart(2, "0")}</span>
      ${isManageMode ? `<span class="drag-handle" draggable="true" title="拖动排序" aria-hidden="true">⠿</span>` : ""}
      <button class="all-paper-open" type="button" data-all-paper-id="${escapeHTML(paper.id)}">
        <strong>${escapeHTML(paper.shortCode)}</strong>
        <span>${escapeHTML(paper.title)}</span>
      </button>
      <span class="status-badge ${statusTone(paper)}">${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</span>
      <span class="all-paper-arrow" aria-hidden="true">→</span>
    </article>
  `).join("");
}

function openAllPapers() {
  renderAllPapersList();
  showSingleDialog(els.allPapersDialog);
}

function reorderPapers(dragId, targetId, placeAfter = false) {
  if (!isManageMode || !dragId || !targetId || dragId === targetId) return;
  data.papers = moveProject(data.papers, dragId, targetId, placeAfter);
  draggedPaperId = null;
  saveLocalDraft();
  renderAll();
  showToast("论文顺序已更新");
}

function bindSortable(container, allowProjectSort = false) {
  container.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-sort-paper-id]");
    const allowed = isManageMode && (!allowProjectSort || els.sortSelect.value === "custom");
    if (!item || !allowed) return event.preventDefault();
    draggedPaperId = item.dataset.sortPaperId;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedPaperId);
  });
  container.addEventListener("dragover", (event) => {
    const item = event.target.closest("[data-sort-paper-id]");
    if (!draggedPaperId || !item || item.dataset.sortPaperId === draggedPaperId) return;
    event.preventDefault();
    container.querySelectorAll(".drop-before, .drop-after").forEach((node) => node.classList.remove("drop-before", "drop-after"));
    const after = event.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    item.classList.add(after ? "drop-after" : "drop-before");
  });
  container.addEventListener("drop", (event) => {
    const item = event.target.closest("[data-sort-paper-id]");
    if (!isManageMode || (allowProjectSort && els.sortSelect.value !== "custom") || !draggedPaperId || !item) return;
    event.preventDefault();
    reorderPapers(draggedPaperId, item.dataset.sortPaperId, item.classList.contains("drop-after"));
  });
  container.addEventListener("dragend", () => {
    draggedPaperId = null;
    container.querySelectorAll(".is-dragging, .drop-before, .drop-after").forEach((node) => node.classList.remove("is-dragging", "drop-before", "drop-after"));
  });
}

function renderManageState() {
  document.body.classList.toggle("manage-mode", isManageMode);
  els.toggleManageButton.textContent = isManageMode ? "Exit Manage" : "Manage";
  setDraftState(hasLocalDraft);
}

function statusOptionsHtml(stage, selected) {
  return (stageStatuses[stage] || []).map(([value, label]) => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");
}

function optionsHtml(options, selected) {
  return Object.entries(options).map(([value, label]) => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");
}

function renderStatusTimeline(paper) {
  const items = [
    ...(paper.statusTimeline || []).map((item) => ({ ...item, current: false })),
    { stage: paper.focusStage, status: paper.statusCode, label: statusLabel(paper.focusStage, paper.statusCode), startedAt: paper.statusStartedAt, endedAt: "", current: true }
  ];
  return items.map((item, index) => `
    <div class="status-timeline-item ${item.current ? "current" : ""}">
      <span class="timeline-marker">${String(index + 1).padStart(2, "0")}</span>
      <div><small>${escapeHTML(stageNames[item.stage] || "阶段记录")}${item.current ? " · 当前" : ""}</small><strong>${escapeHTML(item.label || statusLabel(item.stage, item.status))}</strong><p>${statusPeriodText(item.startedAt, item.endedAt)}</p></div>
    </div>
  `).join("");
}

function renderResearchMilestones(paper) {
  if (!paper.milestones?.length) return "";
  return `<section class="detail-section"><div class="milestone-section-title"><h3>研究里程碑</h3><span>以文件时间线为线索，可在 Manage Mode 校正</span></div>
    <div class="research-milestones">${paper.milestones.map((item, index) => `
      <div class="research-milestone">
        <span class="research-milestone-index">${String(index + 1).padStart(2, "0")}</span>
        <div><div class="research-milestone-head"><strong>${escapeHTML(item.label)}</strong><span class="milestone-evidence ${item.evidence === "estimated" ? "estimated" : ""}">${item.evidence === "estimated" ? "日期待确认" : item.evidence === "confirmed" ? "已确认" : "文件记录"}</span></div>
        <time>${formatDate(item.date)}${item.endDate ? ` — ${formatDate(item.endDate)}` : ""}</time>
        ${item.detail ? `<p>${escapeHTML(item.detail)}</p>` : ""}</div>
      </div>
    `).join("")}</div></section>`;
}

function statusWasUsed(paper, stage, status, index) {
  if (paper.focusStage === stage && paper.statusCode === status) return "current";
  if ((paper.statusTimeline || []).some((item) => item.stage === stage && item.status === status)) return "complete";
  if (stage === "writing" && paper.focusStage === "writing") {
    const currentIndex = stageStatuses.writing.findIndex(([value]) => value === paper.statusCode);
    if (currentIndex > index) return "complete";
  }
  if (stage === "writing" && paper.focusStage !== "writing") return "complete";
  return "pending";
}

function renderStageTracker(paper, stage) {
  return `<div class="stage-status-tracker ${stage}">${(stageStatuses[stage] || []).map(([value, label], index) => `
    <div class="stage-status-step ${statusWasUsed(paper, stage, value, index)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHTML(label)}</strong></div>
  `).join("")}</div>`;
}

function renderSubmissionHistory(items) {
  return items.map((item) => `<div class="history-item"><div><strong>${escapeHTML(item.journal)}</strong><span class="status-badge ${item.status === "rejected" ? "rejected" : item.status === "accepted" ? "published" : revisionStatuses.has(item.status) ? "revision" : "review"}">${escapeHTML(statusLabel("submission", item.status))}</span></div><p>${statusPeriodText(item.statusStartedAt, item.statusEndedAt)}</p></div>`).join("");
}

function renderLinks(links) {
  if (!links?.length) return "";
  return `<div class="paper-links">${links.map((item) => `<a href="${escapeHTML(item.url || item)}" target="_blank" rel="noreferrer">${escapeHTML(item.label || item.url || item)} ↗</a>`).join("")}</div>`;
}

function renderPaperDetails(paper) {
  const due = deadlineInfo(paper);
  return `
    ${isArchivedPaper(paper) && paper.publication ? `<section class="detail-section publication-detail"><span class="section-kicker">PUBLICATION RECORD</span><strong>${escapeHTML(paper.currentVenue)}</strong><p>${escapeHTML(paper.publication.citation || "")}</p>${paper.publication.doi ? `<small>DOI: ${escapeHTML(paper.publication.doi)}</small>` : ""}</section>` : ""}
    ${!isArchivedPaper(paper) ? `<section class="detail-section detail-action-panel">
      <div><span class="card-label">NEXT ACTION</span><strong>${escapeHTML(cardActionText(paper))}</strong><p class="deadline ${due.tone}">${paper.nextDue ? `Due ${formatEnglishDate(paper.nextDue)} · ${due.label}` : "Deadline not set"}</p></div>
      <div><span class="card-label">REFERENCE PROGRESS</span><strong class="detail-progress-value">${clamp(paper.progress, 0, 100)}%</strong></div>
    </section>` : ""}
    <section class="detail-section"><div class="detail-grid">
      <div class="detail-row"><span>当前状态</span><strong>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</strong></div>
      <div class="detail-row"><span>Priority</span><strong>${escapeHTML(priorityNames[paper.priority])}${paper.pinned ? " · Pinned" : ""}</strong></div>
      <div class="detail-row"><span>Current Venue</span><strong>${escapeHTML(paper.currentVenue || "待补充")}</strong></div>
      <div class="detail-row"><span>作者</span><strong>${escapeHTML(paper.authors || "待补充")}</strong></div>
      <div class="detail-row"><span>起始日</span><strong>${formatDate(paper.startedAt)}${paper.startDateEstimated ? "（待确认）" : ""}</strong></div>
      <div class="detail-row"><span>项目历时</span><strong>${durationText(paper.startedAt)}</strong></div>
    </div></section>
    ${renderResearchMilestones(paper)}
    <section class="detail-section"><h3>撰写阶段追踪</h3>${renderStageTracker(paper, "writing")}</section>
    <section class="detail-section"><h3>投稿阶段追踪</h3>${renderStageTracker(paper, "submission")}</section>
    <section class="detail-section"><h3>阶段时间线</h3><div class="status-timeline">${renderStatusTimeline(paper)}</div></section>
    <section class="detail-section"><h3>投稿线程</h3><div class="history-list">${renderSubmissionHistory(paper.submissions || []) || `<div class="empty-state">暂无投稿线程</div>`}</div></section>
    ${(paper.notes || paper.links?.length || paper.tags?.length) ? `<section class="detail-section"><h3>Notes & Links</h3>${paper.tags?.length ? `<div class="tag-list">${paper.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}</div>` : ""}${paper.notes ? `<p class="detail-notes">${escapeHTML(paper.notes)}</p>` : ""}${renderLinks(paper.links)}</section>` : ""}
  `;
}

function renderTimelineEditRow(item = {}, index = -1) {
  return `<div class="editable-item status-history-item" data-status-history-row data-history-index="${index}" data-history-id="${escapeHTML(item.id || "")}" data-history-stage="${escapeHTML(item.stage || "writing")}" data-history-status="${escapeHTML(item.status || defaultStatusForStage(item.stage || "writing"))}">
    <div class="history-status-name"><small>${escapeHTML(stageNames[item.stage] || "阶段记录")}</small><strong>${escapeHTML(item.label || statusLabel(item.stage, item.status))}</strong></div>
    <label><span>开始日</span><input data-field="startedAt" type="date" value="${escapeHTML(item.startedAt || "")}" /></label>
    <label><span>结束日</span><input data-field="endedAt" type="date" value="${escapeHTML(item.endedAt || "")}" /></label>
    <button class="remove-item" type="button" aria-label="删除状态记录">×</button>
  </div>`;
}

function renderMilestoneEditRow(item = {}, index = -1) {
  return `<div class="editable-item milestone-edit-row" data-milestone-row data-milestone-index="${index}" data-milestone-id="${escapeHTML(item.id || "")}">
    <label><span>日期</span><input data-field="date" type="date" value="${escapeHTML(item.date || "")}" required /></label>
    <label><span>结束日（可选）</span><input data-field="endDate" type="date" value="${escapeHTML(item.endDate || "")}" /></label>
    <label class="milestone-wide"><span>节点名称</span><input data-field="label" maxlength="100" value="${escapeHTML(item.label || "")}" required /></label>
    <label><span>记录性质</span><select data-field="evidence">${[["estimated", "日期待确认"], ["file", "文件记录"], ["confirmed", "已确认"]].map(([value, label]) => `<option value="${value}" ${item.evidence === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label class="milestone-wide"><span>来源 / 说明</span><input data-field="detail" maxlength="420" value="${escapeHTML(item.detail || "")}" placeholder="这一天有哪份文件或哪项进展？" /></label>
    <button class="remove-item" type="button" aria-label="删除里程碑">×</button>
  </div>`;
}

function renderSubmissionRow(item = {}, index = -1) {
  const currentStatus = normalizeSubmissionStatus(item.status, "under_review");
  const historicalAccepted = currentStatus === "accepted" ? `<option value="accepted" selected disabled>接收（历史记录）</option>` : "";
  return `<div class="editable-item submission-item" data-submission-index="${index}">
    <label><span>期刊 / 会议</span><input data-field="journal" value="${escapeHTML(item.journal || "")}" placeholder="Journal or conference" /></label>
    <label><span>当前状态</span><select data-field="status">${historicalAccepted}${statusOptionsHtml("submission", currentStatus)}</select></label>
    <label><span>状态开始日</span><input data-field="statusStartedAt" type="date" value="${escapeHTML(item.statusStartedAt || "")}" /></label>
    <label><span>状态结束日</span><input data-field="statusEndedAt" type="date" value="${escapeHTML(item.statusEndedAt || "")}" /></label>
    <button class="remove-item" type="button" aria-label="删除投稿线程">×</button>
  </div>`;
}

function linksToText(links = []) {
  return links.map((item) => `${item.label || "Link"} | ${item.url || item}`).join("\n");
}

function parseLinks(value) {
  return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...rest] = line.split("|");
    const url = rest.join("|").trim();
    return url ? { label: label.trim() || "Link", url } : { label: "Link", url: label.trim() };
  });
}

function renderEditForm(paper) {
  const timelineRows = (paper.statusTimeline || []).map(renderTimelineEditRow).join("");
  const milestoneRows = (paper.milestones || []).map(renderMilestoneEditRow).join("");
  const submissionRows = (paper.submissions || []).map(renderSubmissionRow).join("");
  return `
    <section class="detail-section daily-update"><h3>项目更新</h3>
      <div class="status-editor" id="statusEditor" data-original-stage="${escapeHTML(paper.focusStage)}" data-original-status="${escapeHTML(paper.statusCode)}" data-original-started-at="${escapeHTML(paper.statusStartedAt)}">
        <label class="form-field"><span>Current Stage</span><select name="focusStage" autofocus>${optionsHtml(stageNames, paper.focusStage)}</select></label>
        <label class="form-field"><span>Current Status</span><select name="statusCode">${statusOptionsHtml(paper.focusStage, paper.statusCode)}</select></label>
        <label class="form-field full"><span>Next Action</span><textarea name="nextAction" placeholder="What should happen next?" aria-describedby="actionRecommendationText">${escapeHTML(paper.nextAction)}</textarea></label>
        <div class="action-recommendation full" id="actionRecommendation" aria-live="polite"><p id="actionRecommendationText"></p><div><button class="button" id="applyActionButton" type="button">应用推荐</button><button class="button" id="keepActionButton" type="button">保留原内容</button></div></div>
        <label class="form-field"><span>Deadline / 截止日期</span><input name="nextDue" type="date" value="${escapeHTML(paper.nextDue)}" /><small>不自动设置日期；留空表示没有期限。</small></label>
        <label class="form-field"><span>Priority</span><select name="priority">${optionsHtml(priorityNames, paper.priority)}</select></label>
        <label class="form-field full"><span>Current Venue</span><input name="currentVenue" value="${escapeHTML(paper.currentVenue || "")}" /></label>
        <label class="form-field full"><span>Reference Progress (%)</span><div class="progress-input-row"><input name="progressRange" aria-label="Reference Progress slider" type="range" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" /><input name="progress" aria-label="Reference Progress percent" type="number" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" /></div></label>
        <label class="form-field"><span id="statusDateLabel">Current Status Start</span><input name="statusEffectiveAt" type="date" value="${escapeHTML(paper.statusStartedAt)}" max="${todayISO()}" required /></label>
        <p class="status-change-hint" id="statusChangeHint">状态变化后，所选日期会结束上一状态并开始新状态。</p>
      </div>
    </section>
    <details class="panel-disclosure" ${isCreatingPaper ? "open" : ""}><summary>Paper Information · 标题、作者与资料</summary><div class="form-grid">
      <label class="form-field full"><span>Paper Title</span><textarea name="title" required>${escapeHTML(paper.title)}</textarea></label>
      <label class="form-field full"><span>Authors · 用分号分隔</span><input name="authors" value="${escapeHTML(paper.authors || "")}" /></label>
      <label class="form-field"><span>Short Code · 最多 50 字符</span><input name="shortCode" maxlength="50" required value="${escapeHTML(paper.shortCode)}" /></label>
      <label class="form-field"><span>Start Date</span><input name="startedAt" type="date" value="${escapeHTML(paper.startedAt || "")}" required /></label>
      ${paper.startDateEstimated ? `<label class="check-field"><input name="startDateConfirmed" type="checkbox" /><span>项目启动日期已核实</span></label>` : ""}
      <label class="form-field full"><span>Notes</span><textarea name="notes">${escapeHTML(paper.notes || "")}</textarea></label>
      <label class="form-field full"><span>Tags · 逗号分隔</span><input name="tags" value="${escapeHTML((paper.tags || []).join(", "))}" /></label>
      <label class="form-field full"><span>Links · 每行使用 Label | URL</span><textarea name="links" placeholder="Manuscript | https://...">${escapeHTML(linksToText(paper.links))}</textarea></label>
    </div></details>
    <details class="panel-disclosure" ${paper.archived || paper.focusStage === "publication" ? "open" : ""}><summary>Publication Record · 发表信息</summary><div class="form-grid">
      <label class="form-field"><span>发表年份</span><input name="publicationYear" type="number" min="1900" max="2100" value="${escapeHTML(paper.publication?.year || "")}" placeholder="例如 2026" /></label>
      <label class="form-field"><span>DOI</span><input name="publicationDoi" value="${escapeHTML(paper.publication?.doi || "")}" placeholder="10.xxxx/xxxx" /></label>
      <label class="form-field full"><span>正式引用信息（卷、期、页码）</span><input name="publicationCitation" value="${escapeHTML(paper.publication?.citation || "")}" placeholder="期刊名称, 卷(期): 页码 (年份)" /></label>
      <label class="form-field full"><span>期刊 / DOI 页面 URL</span><input name="publicationUrl" type="url" value="${escapeHTML(paper.publication?.url || "")}" placeholder="https://doi.org/..." /></label>
    </div></details>
    <details class="panel-disclosure" ${paper.milestones?.length ? "open" : ""}><summary>Research Milestones · 研究里程碑 (${paper.milestones?.length || 0})</summary>
      <p class="field-help">独立于投稿状态历史，可记录项目启动、数据处理、初稿形成、修订等事件。根据截图填写的日期请按实际情况确认。</p>
      <div class="editable-history" id="milestoneRows">${milestoneRows}</div>
      <button class="add-row-button" id="addMilestoneButton" type="button">＋ 添加研究里程碑</button>
    </details>
    <details class="panel-disclosure"><summary>Status Timeline · 状态历史 (${paper.statusTimeline.length})</summary><p class="field-help">状态切换会自动归档；校正日期或删除错误记录后，保存时检查时间顺序。</p><div class="status-timeline">${renderStatusTimeline(paper)}</div><div class="editable-history" id="statusTimelineRows">${timelineRows || `<div class="empty-state timeline-empty">首次切换状态后将生成历史记录。</div>`}</div></details>
    <details class="panel-disclosure"><summary>Submission Threads · 投稿线程 (${paper.submissions.length})</summary><div class="editable-history" id="submissionRows">${submissionRows}</div><button class="add-row-button" id="addSubmissionButton" type="button">＋ Add Submission Thread</button></details>
    <details class="panel-disclosure"><summary>Advanced Settings · 显示与管理</summary><div class="advanced-options">
      <label class="check-field"><input name="pinned" type="checkbox" ${paper.pinned ? "checked" : ""} /><span>Pin as Current Focus</span></label>
      <label class="check-field"><input name="showInAttention" type="checkbox" ${paper.showInAttention !== false ? "checked" : ""} /><span>Show in Needs Attention</span></label>
      <button class="button button-danger" id="deletePaperButton" type="button" ${isCreatingPaper ? "hidden" : ""}>删除项目</button>
    </div></details>
  `;
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
}

function showSingleDialog(dialog) {
  closeDialogs();
  dialog.showModal();
  const body = dialog.querySelector(".dialog-body");
  if (body) body.scrollTop = 0;
}

function getActivePaper() {
  return isCreatingPaper ? newPaperDraft : data.papers.find(p => p.id === activePaperId);
}

function initializeActionRecommendation(paper) {
  actionAutoValue = paper.nextActionAuto || "";
  lastRecommendationValue = "";
  updateFullStatusUI();
  updateActionRecommendation();
}

function showActionRecommendation(applied) {
  const editor = els.dialogBody.querySelector("#statusEditor");
  if (!editor) return;
  const suggestion = recommendNextAction(editor.querySelector("[name='focusStage']").value, editor.querySelector("[name='statusCode']").value);
  editor.querySelector("#actionRecommendationText").textContent = `${applied ? "已自动填入，可继续编辑" : "已保留当前内容"} · 推荐：${suggestion || "暂无规则"}`;
  editor.querySelector("#applyActionButton").disabled = !suggestion;
}

function updateActionRecommendation() {
  const editor = els.dialogBody.querySelector("#statusEditor");
  const input = editor.querySelector("[name='nextAction']");
  const result = resolveActionRecommendation({ value: input.value, previousAuto: actionAutoValue,
    stage: editor.querySelector("[name='focusStage']").value, status: editor.querySelector("[name='statusCode']").value });
  lastRecommendationValue = input.value;
  input.value = result.value;
  actionAutoValue = result.autoValue;
  showActionRecommendation(result.applied);
}

function applyActionRecommendation() {
  const editor = els.dialogBody.querySelector("#statusEditor");
  const suggestion = recommendNextAction(editor.querySelector("[name='focusStage']").value, editor.querySelector("[name='statusCode']").value);
  if (!suggestion) return;
  lastRecommendationValue = editor.querySelector("[name='nextAction']").value;
  editor.querySelector("[name='nextAction']").value = actionAutoValue = suggestion;
  showActionRecommendation(true);
}

function openPaper(paperId) {
  const paper = data.papers.find((item) => item.id === paperId);
  if (!paper) return;
  activePaperId = paper.id;
  isCreatingPaper = false;
  newPaperDraft = null;
  const editing = isManageMode;
  els.dialogKicker.textContent = editing ? `${paper.shortCode} · MANAGE PROJECT` : `${paper.shortCode} · PAPER DETAILS`;
  els.dialogTitle.textContent = paper.title;
  els.dialogHint.textContent = editing ? "保存到当前设备草稿 · Publish 后才会公开" : "阅读模式";
  els.savePaperButton.hidden = !editing;
  els.dialogBody.innerHTML = editing ? renderEditForm(paper) : renderPaperDetails(paper);
  if (isManageMode) initializeActionRecommendation(paper);
  showSingleDialog(els.paperDialog);
}

function openNewPaper() {
  if (!isManageMode) return;
  const paper = createBlankPaper();
  isCreatingPaper = true;
  newPaperDraft = paper;
  activePaperId = paper.id;
  els.dialogKicker.textContent = "NEW PAPER";
  els.dialogTitle.textContent = "新增论文项目";
  els.dialogHint.textContent = "创建后保存为当前设备草稿，再通过 Publish 正式发布";
  els.savePaperButton.hidden = false;
  els.dialogBody.innerHTML = renderEditForm(paper);
  initializeActionRecommendation(paper);
  showSingleDialog(els.paperDialog);
}

function collectStatusTimeline() {
  return [...els.dialogBody.querySelectorAll("[data-status-history-row]")].map((row) => ({
    ...getActivePaper()?.statusTimeline?.[Number(row.dataset.historyIndex)],
    id: row.dataset.historyId || `timeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    stage: row.dataset.historyStage,
    status: row.dataset.historyStatus,
    label: statusLabel(row.dataset.historyStage, row.dataset.historyStatus),
    startedAt: row.querySelector("[data-field='startedAt']")?.value || "",
    endedAt: row.querySelector("[data-field='endedAt']")?.value || ""
  }));
}

function collectMilestones() {
  return [...els.dialogBody.querySelectorAll("[data-milestone-row]")].map((row) => {
    const item = {
      id: row.dataset.milestoneId || `milestone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      date: row.querySelector("[data-field='date']").value,
      endDate: row.querySelector("[data-field='endDate']").value,
      label: row.querySelector("[data-field='label']").value.trim(),
      evidence: row.querySelector("[data-field='evidence']").value,
      detail: row.querySelector("[data-field='detail']").value.trim()
    };
    if (!item.date || !item.label) throw new Error("请填写里程碑名称和日期");
    if (item.endDate && item.endDate < item.date) throw new Error("里程碑结束日不能早于开始日");
    return item;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function collectSubmissionRows() {
  return [...els.dialogBody.querySelectorAll("#submissionRows .submission-item")].map((row) => ({
    ...getActivePaper()?.submissions?.[Number(row.dataset.submissionIndex)],
    journal: row.querySelector("[data-field='journal']")?.value.trim() || "",
    status: row.querySelector("[data-field='status']")?.value || "under_review",
    statusStartedAt: row.querySelector("[data-field='statusStartedAt']")?.value || "",
    statusEndedAt: row.querySelector("[data-field='statusEndedAt']")?.value || ""
  })).filter((item) => item.journal);
}

function updateFullStatusUI(resetDate = false) {
  const editor = els.dialogBody.querySelector("#statusEditor");
  if (!editor) return;
  const stage = editor.querySelector("[name='focusStage']").value;
  const status = editor.querySelector("[name='statusCode']").value;
  const changed = stage !== editor.dataset.originalStage || status !== editor.dataset.originalStatus;
  const dateInput = editor.querySelector("[name='statusEffectiveAt']");
  if (resetDate) dateInput.value = changed ? todayISO() : editor.dataset.originalStartedAt;
  editor.querySelector("#statusDateLabel").textContent = changed ? "New Status Effective Date" : "Current Status Start";
  editor.querySelector("#statusChangeHint").textContent = changed
    ? `保存后将结束“${statusLabel(editor.dataset.originalStage, editor.dataset.originalStatus)}”，并从所选日期开始“${statusLabel(stage, status)}”。`
    : "状态未切换；修改日期将校正当前状态的开始日。";
}

function handleFullStageChange() {
  const editor = els.dialogBody.querySelector("#statusEditor");
  if (!editor) return;
  const stageSelect = editor.querySelector("[name='focusStage']");
  const statusSelect = editor.querySelector("[name='statusCode']");
  const selected = stageSelect.value === editor.dataset.originalStage ? editor.dataset.originalStatus : defaultStatusForStage(stageSelect.value);
  statusSelect.innerHTML = statusOptionsHtml(stageSelect.value, selected);
  updateFullStatusUI(true);
  updateActionRecommendation();
}

function saveFullPaper(event) {
  event.preventDefault();
  if (!isManageMode || !activePaperId) return;
  const paper = isCreatingPaper ? newPaperDraft : data.papers.find((item) => item.id === activePaperId);
  if (!paper) return;
  const form = new FormData(els.paperForm);
  const title = form.get("title").trim();
  const shortCode = form.get("shortCode").trim();
  if (!title || !shortCode) return showToast("请填写论文标题和简称");
  if (data.papers.some((item) => item.id !== paper.id && item.shortCode.trim().toLocaleLowerCase() === shortCode.toLocaleLowerCase())) return showToast("论文简称不能重复");

  const previousStage = paper.focusStage;
  const previousStatus = paper.statusCode;
  const nextStage = form.get("focusStage");
  const nextStatus = form.get("statusCode");
  const effectiveAt = form.get("statusEffectiveAt") || todayISO();
  const changed = !isCreatingPaper && (previousStage !== nextStage || previousStatus !== nextStatus);
  let transition;
  let milestones;
  try {
    transition = buildStatusTransition({
      timeline: collectStatusTimeline(), previousStage, previousStatus, previousStartedAt: paper.statusStartedAt,
      nextStage, nextStatus, effectiveAt, previousLabel: statusLabel(previousStage, previousStatus),
      projectStartedAt: form.get("startedAt"), today: todayISO(), archivePrevious: !isCreatingPaper
    });
    for (const thread of collectSubmissionRows()) {
      if (thread.statusEndedAt && (!thread.statusStartedAt || thread.statusEndedAt < thread.statusStartedAt)) throw new Error("投稿线程结束日不能早于开始日");
    }
    milestones = collectMilestones();
  } catch (error) { return showToast(error.message); }

  paper.title = title;
  paper.shortCode = shortCode;
  paper.authors = form.get("authors").trim();
  paper.startedAt = form.get("startedAt");
  paper.startDateEstimated = Boolean(paper.startDateEstimated && form.get("startDateConfirmed") !== "on");
  paper.milestones = milestones;
  paper.currentVenue = form.get("currentVenue").trim();
  paper.notes = form.get("notes").trim();
  paper.tags = form.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean);
  paper.links = parseLinks(form.get("links"));
  const publicationYear = String(form.get("publicationYear") || "").trim();
  const publicationCitation = String(form.get("publicationCitation") || "").trim();
  const publicationDoi = String(form.get("publicationDoi") || "").trim();
  const publicationUrl = String(form.get("publicationUrl") || "").trim();
  paper.publication = publicationYear || publicationCitation || publicationDoi || publicationUrl
    ? { year: publicationYear ? Number(publicationYear) : null, citation: publicationCitation, doi: publicationDoi, url: publicationUrl }
    : null;
  paper.focusStage = nextStage;
  paper.statusCode = nextStatus;
  paper.archived = nextStage === "publication" && ["published", "archived"].includes(nextStatus);
  paper.stageLabel = statusLabel(nextStage, nextStatus);
  paper.statusStartedAt = transition.currentStartedAt;
  paper.statusTimeline = transition.timeline;
  paper.priority = form.get("priority");
  paper.progress = clamp(form.get("progress"), 0, 100);
  paper.nextAction = form.get("nextAction").trim();
  if (actionAutoValue && paper.nextAction === actionAutoValue) paper.nextActionAuto = actionAutoValue;
  else delete paper.nextActionAuto;
  paper.nextDue = form.get("nextDue");
  paper.pinned = form.get("pinned") === "on";
  paper.showInAttention = form.get("showInAttention") === "on";
  paper.submissions = collectSubmissionRows();
  paper.lastActionAt = todayISO();
  paper.updatedAt = new Date().toISOString();
  if (isCreatingPaper) data.papers.push(paper);
  saveLocalDraft();
  renderAll();
  els.paperDialog.close();
  showToast(isCreatingPaper ? "新论文项目已创建" : changed ? "项目已保存，上一状态已归档" : "项目更新已保存到本机草稿");
  isCreatingPaper = false;
  newPaperDraft = null;
}

function deleteActivePaper() {
  if (!isManageMode || isCreatingPaper || !activePaperId) return;
  const paper = data.papers.find((item) => item.id === activePaperId);
  if (!paper || !window.confirm(`确定删除“${paper.title}”吗？发布前可通过恢复已发布版本撤销。`)) return;
  data.papers = data.papers.filter((item) => item.id !== activePaperId);
  saveLocalDraft();
  renderAll();
  els.paperDialog.close();
  showToast("论文项目已从本机草稿删除");
}

function addSubmissionRow() {
  const target = els.dialogBody.querySelector("#submissionRows");
  if (target) target.insertAdjacentHTML("beforeend", renderSubmissionRow({ statusStartedAt: todayISO() }));
}

function addMilestoneRow() {
  const target = els.dialogBody.querySelector("#milestoneRows");
  if (target) target.insertAdjacentHTML("beforeend", renderMilestoneEditRow({ date: todayISO(), evidence: "confirmed" }));
}

function openViewOptions() {
  if (!isManageMode) {
    showToast("进入 Manage Mode 后可修改项目显示设置");
    return;
  }
  els.codesEditor.innerHTML = data.papers.map((paper) => `
    <div class="code-editor-row"><span>${escapeHTML(paper.title)}</span><input data-code-paper-id="${escapeHTML(paper.id)}" value="${escapeHTML(paper.shortCode)}" maxlength="50" required aria-label="论文简称" /><label class="check-field"><input type="checkbox" data-attention-paper-id="${escapeHTML(paper.id)}" ${paper.showInAttention !== false ? "checked" : ""} /><span>Needs Attention</span></label></div>
  `).join("");
  showSingleDialog(els.codesDialog);
}

function saveViewOptions(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return els.codesDialog.close();
  if (!isManageMode) return;
  const inputs = [...els.codesEditor.querySelectorAll("[data-code-paper-id]")];
  const codes = inputs.map((input) => input.value.trim());
  if (codes.some((code) => !code) || new Set(codes.map((code) => code.toLocaleLowerCase())).size !== codes.length) return showToast("简称不能为空且不能重复");
  inputs.forEach((input) => {
    const paper = data.papers.find((item) => item.id === input.dataset.codePaperId);
    if (paper) paper.shortCode = input.value.trim();
  });
  els.codesEditor.querySelectorAll("[data-attention-paper-id]").forEach((input) => {
    const paper = data.papers.find((item) => item.id === input.dataset.attentionPaperId);
    if (paper) paper.showInAttention = input.checked;
  });
  saveLocalDraft();
  renderAll();
  els.codesDialog.close();
  showToast("项目显示设置已保存");
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paperflow-backup-${todayISO()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("数据备份已导出");
}

async function importData(file) {
  if (!isManageMode) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidData(parsed)) throw new Error("数据结构不完整");
    data = normalizePortfolio(Number(parsed.meta.version || 0) < publishedData.meta.version
      ? mergePublishedFields(parsed, publishedData) : parsed);
    saveLocalDraft();
    renderAll();
    els.toolsDialog.close();
    showToast("数据已导入为本机草稿");
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  } finally {
    els.importInput.value = "";
  }
}

function openPublishDialog() {
  if (!isManageMode) return;
  els.toolsDialog.close();
  els.githubEditLink.href = REPO_EDIT_URL;
  showSingleDialog(els.publishDialog);
}

async function copyCurrentData() {
  if (!isManageMode) return;
  const text = JSON.stringify(data, null, 2) + "\n";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("当前数据已复制，可粘贴到 GitHub 编辑页");
}

function resetDraft() {
  if (!isManageMode) return;
  if (!window.confirm("确定清除当前设备草稿并恢复 GitHub 已发布版本吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  data = deepClone(publishedData);
  setDraftState(false);
  renderAll();
  els.toolsDialog.close();
  showToast("已恢复已发布版本");
}

function handleDialogClick(event) {
  const remove = event.target.closest(".remove-item");
  if (!isManageMode) return;
  if (event.target.closest("#applyActionButton")) return applyActionRecommendation();
  if (event.target.closest("#deletePaperButton")) return deleteActivePaper();
  if (event.target.closest("#keepActionButton")) { if (actionAutoValue) els.dialogBody.querySelector("[name=nextAction]").value = lastRecommendationValue; actionAutoValue = ""; showActionRecommendation(false); return; }
  if (remove) return remove.closest(".editable-item")?.remove();
  if (event.target.closest("#addSubmissionButton")) addSubmissionRow();
  if (event.target.closest("#addMilestoneButton")) addMilestoneRow();
}

function handlePipelineClick(event) {
  const close = event.target.closest("[data-close-pipeline-selection]");
  if (close) {
    selectedPipelineBucket = null;
    renderOverview();
    return;
  }
  const paperTarget = event.target.closest("[data-pipeline-paper-id]");
  if (paperTarget) {
    openPaper(paperTarget.dataset.pipelinePaperId);
    return;
  }
  const bucketTarget = event.target.closest("[data-pipeline-bucket]");
  if (bucketTarget) togglePipelineSelection(bucketTarget.dataset.pipelineBucket);
}

function bindEvents() {
  els.toggleManageButton.addEventListener("click", () => {
    closeDialogs();
    isManageMode = !isManageMode;
    renderAll();
    showToast(isManageMode ? "Manage Mode 已开启" : "已返回 Reading Mode");
  });
  els.addPaperButton.addEventListener("click", openNewPaper);
  els.headerAddPaperButton.addEventListener("click", openNewPaper);
  els.openToolsButton.addEventListener("click", () => isManageMode && showSingleDialog(els.toolsDialog));
  els.headerPublishButton.addEventListener("click", openPublishDialog);
  els.openAllPapersButton.addEventListener("click", openAllPapers);
  els.closeAllPapersButton.addEventListener("click", () => els.allPapersDialog.close());
  els.editCodesButton.addEventListener("click", openViewOptions);
  els.metrics.addEventListener("click", handlePipelineClick);
  els.pipelineDistribution.addEventListener("click", handlePipelineClick);
  els.overviewPipelineSelection.addEventListener("click", handlePipelineClick);
  els.searchInput.addEventListener("input", renderPaperList);
  els.stageFilter.addEventListener("change", renderPaperList);
  els.sortSelect.addEventListener("change", renderPaperList);
  els.publicationFilters.addEventListener("click", (event) => {
    const target = event.target.closest("[data-archive-filter]");
    if (!target) return;
    publicationFilter = target.dataset.archiveFilter;
    renderPublicationArchive();
  });
  els.publicationArchive.addEventListener("click", async (event) => {
    const open = event.target.closest("[data-archive-open]");
    if (open) return openPaper(open.dataset.archiveOpen);
    const copy = event.target.closest("[data-archive-copy]");
    if (!copy) return;
    const item = getPublicationRecords().find((record) => record.id === copy.dataset.archiveCopy);
    if (!item) return;
    try {
      await navigator.clipboard.writeText(citationText(item));
      showToast("引用信息已复制");
    } catch { showToast("浏览器不允许复制，请打开论文详情查看引用信息"); }
  });
  els.focusContent.addEventListener("click", (event) => {
    const target = event.target.closest("[data-focus-open]");
    if (target) openPaper(target.dataset.focusOpen);
  });
  els.needsAttention.addEventListener("click", (event) => {
    const target = event.target.closest("[data-attention-id]");
    if (target) openPaper(target.dataset.attentionId);
  });
  els.paperList.addEventListener("click", (event) => {
    const move = event.target.closest("[data-move-id]");
    if (move && isManageMode && els.sortSelect.value === "custom") {
      const visible = getFilteredPapers();
      const index = visible.findIndex(p => p.id === move.dataset.moveId);
      const direction = Number(move.dataset.moveDirection);
      const target = visible[index + direction];
      if (target) {
        reorderPapers(move.dataset.moveId, target.id, direction > 0);
        els.paperList.querySelector(`[data-move-id="${CSS.escape(move.dataset.moveId)}"][data-move-direction="${direction}"]`)?.focus();
      }
      return;
    }
    if (event.target.closest("select, input, a, .drag-handle")) return;
    const card = event.target.closest("[data-paper-id]");
    if (card && !draggedPaperId) openPaper(card.dataset.paperId);
  });
  els.allPapersList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-all-paper-id]");
    if (!target) return;
    els.allPapersDialog.close();
    openPaper(target.dataset.allPaperId);
  });
  bindSortable(els.paperList, true);
  bindSortable(els.allPapersList);
  els.paperForm.addEventListener("submit", saveFullPaper);
  els.paperDialog.addEventListener("close", () => {
    if (document.querySelector("dialog[open]")) return;
    const opener = els.paperList.querySelector(`[data-open-paper-id="${CSS.escape(activePaperId || "")}"]`);
    (opener || els.toggleManageButton).focus({ preventScroll: true });
  });
  els.paperForm.addEventListener("invalid", event => {
    const disclosure = event.target.closest("details");
    if (disclosure) disclosure.open = true;
  }, true);
  els.codesForm.addEventListener("submit", saveViewOptions);
  els.dialogBody.addEventListener("click", handleDialogClick);
  els.paperForm.querySelectorAll("[data-close-paper]").forEach(button => button.addEventListener("click", () => els.paperDialog.close()));
  els.paperList.addEventListener("change", (event) => {
    const id = event.target.dataset.priorityId;
    if (!isManageMode || !id || !priorityNames[event.target.value]) return;
    const paper = data.papers.find(p => p.id === id);
    if (!paper) return;
    paper.priority = event.target.value;
    paper.lastActionAt = todayISO();
    paper.updatedAt = new Date().toISOString();
    saveLocalDraft();
    renderAll();
    els.paperList.querySelector(`[data-priority-id="${CSS.escape(id)}"]`)?.focus();
    showToast("优先级已保存到本机草稿");
  });
  els.dialogBody.addEventListener("input", (event) => {
    if (event.target.name === "focusStage") handleFullStageChange();
    if (event.target.name === "statusCode") { updateFullStatusUI(true); updateActionRecommendation(); }
    if (event.target.name === "nextAction") { actionAutoValue = ""; showActionRecommendation(false); }
    if (event.target.name === "progressRange") els.dialogBody.querySelector("[name='progress']").value = event.target.value;
    if (event.target.name === "progress") els.dialogBody.querySelector("[name='progressRange']").value = clamp(event.target.value, 0, 100);
  });
  els.closeToolsButton.addEventListener("click", () => els.toolsDialog.close());
  els.exportButton.addEventListener("click", exportData);
  els.importInput.addEventListener("change", (event) => event.target.files[0] && importData(event.target.files[0]));
  els.publishButton.addEventListener("click", openPublishDialog);
  els.resetButton.addEventListener("click", resetDraft);
  els.closePublishButton.addEventListener("click", () => els.publishDialog.close());
  els.copyDataButton.addEventListener("click", copyCurrentData);
  els.draftPublishButton.addEventListener("click", openPublishDialog);
  [els.paperDialog, els.codesDialog, els.toolsDialog, els.publishDialog, els.allPapersDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
}

bindEvents();
loadData().catch((error) => {
  console.error(error);
  els.paperList.innerHTML = `<div class="empty-state">数据暂时无法加载，请刷新页面或检查 data/papers.json。</div>`;
  showToast("论文数据加载失败");
});
