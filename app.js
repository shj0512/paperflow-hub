import { buildStatusTransition } from "./scripts/status-engine.mjs";

const DATA_URL = "./data/papers.json";
const STORAGE_KEY = "paperflow-draft-v1";
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
    ["rejected", "拒稿"],
    ["accepted", "接收"]
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
  pipelineChart: document.querySelector("#pipelineChart"),
  pipelineSelection: document.querySelector("#pipelineSelection"),
  paperList: document.querySelector("#paperList"),
  searchInput: document.querySelector("#searchInput"),
  stageFilter: document.querySelector("#stageFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  addPaperButton: document.querySelector("#addPaperButton"),
  headerAddPaperButton: document.querySelector("#headerAddPaperButton"),
  toggleManageButton: document.querySelector("#toggleManageButton"),
  editCodesButton: document.querySelector("#editCodesButton"),
  openToolsButton: document.querySelector("#openToolsButton"),
  headerPublishButton: document.querySelector("#headerPublishButton"),
  quickDialog: document.querySelector("#quickDialog"),
  quickForm: document.querySelector("#quickForm"),
  quickTitle: document.querySelector("#quickTitle"),
  quickBody: document.querySelector("#quickBody"),
  paperDialog: document.querySelector("#paperDialog"),
  paperForm: document.querySelector("#paperForm"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  dialogHint: document.querySelector("#dialogHint"),
  savePaperButton: document.querySelector("#savePaperButton"),
  deletePaperButton: document.querySelector("#deletePaperButton"),
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
let quickPaperId = null;
let isCreatingPaper = false;
let newPaperDraft = null;
let toastTimer;
let selectedPipelineBucket = null;
let selectedPipelineSource = null;

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
  if (["rejected", "accepted"].includes(status)) return status;
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
  if (paper.currentVenue) return paper.currentVenue;
  const journal = [...(paper.submissions || [])].reverse().find((item) => item.journal)?.journal;
  if (journal) return journal;
  const summary = String(paper.venueSummary || "");
  return summary.includes("·") ? summary.split("·")[0].trim() : "";
}

function normalizePaper(paper) {
  const rawStage = paper.focusStage === "revision" ? "submission" : paper.focusStage === "accepted" ? "publication" : paper.focusStage;
  const focusStage = stageStatuses[rawStage] ? rawStage : "writing";
  const statusCode = inferLegacyStatus(paper, focusStage);
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
    tags: Array.isArray(paper.tags) ? paper.tags : [],
    links: Array.isArray(paper.links) ? paper.links : [],
    notes: paper.notes || "",
    writing,
    submissions
  };
}

function normalizePortfolio(value) {
  return { ...value, meta: { ...value.meta, version: Math.max(4, Number(value.meta?.version || 0)) }, papers: (value.papers || []).map(normalizePaper) };
}

function mergePublishedFields(draft, published) {
  const publishedById = new Map((published.papers || []).map((paper) => [paper.id, paper]));
  return {
    ...draft,
    papers: (draft.papers || []).map((paper) => {
      const source = publishedById.get(paper.id) || {};
      return {
        ...paper,
        nextAction: paper.nextAction || source.nextAction || "",
        nextDue: paper.nextDue || source.nextDue || "",
        venueSummary: paper.venueSummary || source.venueSummary || "",
        currentVenue: paper.currentVenue || venueFromLegacy(source),
        notes: paper.notes || source.notes || ""
      };
    })
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
    statusStartedAt: todayISO(), statusTimeline: [], progress: 0, priority: "medium", pinned: false, nextAction: "", nextDue: "",
    currentVenue: "", lastActionAt: todayISO(), startedAt: todayISO(), updatedAt: todayISO(), showOnRoadmap: true,
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
      if (isValidData(parsed) && Number(parsed.meta.version || 0) >= 3) {
        data = normalizePortfolio(mergePublishedFields(parsed, publishedData));
        setDraftState(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  if (!data) data = deepClone(publishedData);
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
  return [...data.papers].sort(compareScore)[0] || null;
}

function renderAll() {
  renderHero();
  renderOverview();
  renderAttention();
  renderPipeline();
  renderPaperList();
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
      <span>${paper.nextDue ? `Due ${formatEnglishDate(paper.nextDue)}` : !paper.nextAction && waiting ? `Waiting ${waiting} days` : "Deadline not set"}</span>
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
  data.papers.filter((paper) => paper.showOnRoadmap !== false).forEach((paper) => buckets[pipelineBucket(paper)].push(paper));
  Object.values(buckets).forEach((papers) => papers.sort(compareScore));
  return buckets;
}

function portfolioCounts() {
  const buckets = getPipelineBuckets();
  return {
    active: buckets.writing.length + buckets.submitted.length + buckets.revision.length,
    review: data.papers.filter((paper) => paper.showOnRoadmap !== false && isReviewPaper(paper)).length,
    submitted: buckets.submitted.length,
    revision: buckets.revision.length,
    published: buckets.published.length,
    writing: buckets.writing.length
  };
}

function renderOverview() {
  const counts = portfolioCounts();
  const metrics = [
    ["进行中", "ACTIVE", counts.active, "active"],
    ["审稿中", "UNDER REVIEW", counts.review, "review"],
    ["返修中", "REVISION", counts.revision, "revision"],
    ["已发表", "PUBLISHED", counts.published, "published"]
  ];
  els.metrics.innerHTML = metrics.map(([label, english, value, tone]) => `
    <div class="metric metric-${tone}"><span>${label}</span><strong>${value}</strong><small>${english}</small></div>
  `).join("");

  const distribution = [
    ["Writing", counts.writing, "writing"], ["Submitted", counts.submitted, "submitted"], ["Revision", counts.revision, "revision"], ["Published", counts.published, "published"]
  ];
  const projectTotal = distribution.reduce((sum, [, value]) => sum + value, 0);
  const distributionBase = projectTotal || 1;
  els.pipelineDistribution.innerHTML = `
    <div class="distribution-heading"><strong>Pipeline Distribution</strong><span>${projectTotal} projects</span></div>
    <div class="distribution-bar">${distribution.map(([label, value, tone]) => `<button class="${tone} ${selectedPipelineBucket === tone ? "active" : ""}" style="width:${(value / distributionBase) * 100}%" type="button" data-pipeline-bucket="${tone}" data-pipeline-source="overview" aria-label="${label}: ${value} projects"></button>`).join("")}</div>
    <div class="distribution-labels">${distribution.map(([label, value, tone]) => `<button class="${selectedPipelineBucket === tone ? "active" : ""}" type="button" data-pipeline-bucket="${tone}" data-pipeline-source="overview"><i class="${tone}"></i>${label}<strong>${value}</strong></button>`).join("")}</div>
  `;
  renderPipelineSelection();
}

function attentionReason(paper) {
  const due = deadlineInfo(paper);
  if (due.tone === "overdue") return { score: 1000 + Math.abs(due.days), tone: "overdue", text: due.label, date: formatEnglishDate(paper.nextDue) };
  if (due.tone === "due-soon") return { score: 900 - due.days, tone: "due-soon", text: due.label, date: formatEnglishDate(paper.nextDue) };
  if (paper.priority === "high") return { score: 800, tone: "priority", text: "High priority project", date: paper.nextDue ? formatEnglishDate(paper.nextDue) : "Action required" };
  if (isRevisionPaper(paper)) return { score: 700, tone: "revision", text: `${statusLabel(paper.focusStage, paper.statusCode)} in progress`, date: paper.nextDue ? formatEnglishDate(paper.nextDue) : "No deadline set" };
  const waiting = waitingDays(paper);
  if (waiting >= 30) return { score: 600 + waiting, tone: "waiting", text: `Waiting for external decision`, date: `Waiting ${waiting} days` };
  const stale = staleDays(paper);
  if (stale >= 30) return { score: 500 + stale, tone: "stale", text: "No recent project update", date: `${stale} days` };
  return null;
}

function renderAttention() {
  const items = data.papers
    .map((paper) => ({ paper, reason: attentionReason(paper) }))
    .filter((item) => item.reason)
    .sort((a, b) => b.reason.score - a.reason.score || compareScore(a.paper, b.paper))
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

function renderPipeline() {
  const buckets = getPipelineBuckets();
  const revisionCounts = [1, 2, 3].map((round) => buckets.revision.filter((paper) => paper.statusCode === `revision_${round}`).length);
  const returnedCount = buckets.revision.filter((paper) => paper.statusCode === "revision_resubmitted").length;
  const stages = [
    ["writing", "Writing", "撰写", buckets.writing.length, ""],
    ["submitted", "Submitted", "投稿 / 审稿", buckets.submitted.length, ""],
    ["revision", "Revision", "返修", buckets.revision.length, [...revisionCounts.map((count, index) => count ? `R${index + 1}: ${count}` : ""), returnedCount ? `Returned: ${returnedCount}` : ""].filter(Boolean).join(" · ")],
    ["published", "Published", "发表", buckets.published.length, ""]
  ];
  els.pipelineChart.innerHTML = stages.map(([tone, label, chinese, value, note], index) => `
    <button class="pipeline-stage ${tone} ${value ? "has-projects" : ""} ${selectedPipelineBucket === tone ? "active" : ""}" type="button" data-pipeline-bucket="${tone}" data-pipeline-source="pipeline" aria-expanded="${selectedPipelineBucket === tone && selectedPipelineSource === "pipeline"}">
      <span class="pipeline-marker"></span>
      <div><small>${escapeHTML(chinese)}</small><strong>${label}</strong><b>${value}</b>${note ? `<p>${escapeHTML(note)}</p>` : ""}</div>
      ${index < stages.length - 1 ? `<i class="pipeline-arrow" aria-hidden="true">→</i>` : ""}
    </button>
  `).join("");
  renderPipelineSelection();
}

function renderPipelineSelection() {
  const buckets = getPipelineBuckets();
  const labels = { writing: ["Writing", "撰写阶段"], submitted: ["Submitted", "投稿 / 审稿阶段"], revision: ["Revision", "返修阶段"], published: ["Published", "已发表 / 已完成"] };
  [
    [els.overviewPipelineSelection, "overview"],
    [els.pipelineSelection, "pipeline"]
  ].forEach(([target, source]) => {
    const visible = selectedPipelineBucket && selectedPipelineSource === source;
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
  });
}

function togglePipelineSelection(bucket, source) {
  const closing = selectedPipelineBucket === bucket && selectedPipelineSource === source;
  selectedPipelineBucket = closing ? null : bucket;
  selectedPipelineSource = closing ? null : source;
  renderOverview();
  renderPipeline();
}

function matchesStageFilter(paper, filter) {
  if (filter === "all") return true;
  if (filter === "writing") return paper.focusStage === "writing";
  if (filter === "review") return isReviewPaper(paper);
  if (filter === "revision") return isRevisionPaper(paper);
  if (filter === "publication") return paper.focusStage === "publication";
  return true;
}

function compareDeadline(a, b) {
  if (!a.nextDue && !b.nextDue) return compareScore(a, b);
  if (!a.nextDue) return 1;
  if (!b.nextDue) return -1;
  return String(a.nextDue).localeCompare(String(b.nextDue));
}

function getFilteredPapers() {
  const query = els.searchInput.value.trim().toLocaleLowerCase();
  const filter = els.stageFilter.value;
  const papers = data.papers.filter((paper) => {
    const haystack = [paper.title, paper.shortCode, paper.authors, paper.currentVenue, paper.nextAction, ...(paper.tags || []), statusLabel(paper.focusStage, paper.statusCode)]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return (!query || haystack.includes(query)) && matchesStageFilter(paper, filter);
  });
  const sort = els.sortSelect.value;
  return papers.sort((a, b) => {
    if (sort === "deadline") return compareDeadline(a, b);
    if (sort === "updated") return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    if (sort === "started") return String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
    return compareScore(a, b);
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

function renderPaperList() {
  const papers = getFilteredPapers();
  if (!papers.length) {
    els.paperList.innerHTML = `<div class="empty-state">没有找到匹配的论文项目。</div>`;
    return;
  }
  els.paperList.innerHTML = papers.map(renderPaperCard).join("");
}

function renderPaperCard(paper) {
  const due = deadlineInfo(paper);
  const progress = clamp(paper.progress, 0, 100);
  return `
    <article class="paper-card" data-paper-id="${escapeHTML(paper.id)}">
      <div class="paper-info">
        <div class="paper-topline"><span class="paper-code">${escapeHTML(paper.shortCode)}</span><span class="status-badge ${statusTone(paper)}">${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</span></div>
        <h3>${escapeHTML(paper.title)}</h3>
        <p class="paper-venue">${escapeHTML(paper.currentVenue || "Venue not set")}</p>
      </div>
      <div class="paper-action">
        <span class="card-label">NEXT ACTION</span>
        <strong>${escapeHTML(cardActionText(paper))}</strong>
        <p class="deadline ${due.tone}">${paper.nextDue ? `Due ${formatEnglishDate(paper.nextDue)} · ${due.label}` : !paper.nextAction && waitingDays(paper) ? `Waiting ${waitingDays(paper)} days` : "Deadline not set"}</p>
      </div>
      <div class="paper-progress">
        <span class="card-label">REFERENCE PROGRESS</span>
        <strong>${progress}%</strong>
        <div class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></div>
        <small>Started ${formatEnglishMonth(paper.startedAt)}</small>
      </div>
      <div class="paper-controls">
        <span class="priority-label priority-${paper.priority}"><i></i>${priorityNames[paper.priority]}</span>
        <small>Updated ${formatEnglishDate(paper.updatedAt)}</small>
        <div class="card-buttons">
          <button class="button card-details" type="button" data-details-id="${escapeHTML(paper.id)}">Details</button>
          <button class="button button-primary card-update" type="button" data-quick-id="${escapeHTML(paper.id)}">Update</button>
          <button class="button card-full-edit" type="button" data-full-edit-id="${escapeHTML(paper.id)}">Full Edit</button>
        </div>
      </div>
    </article>
  `;
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

function openQuickUpdate(paperId) {
  if (!isManageMode) return;
  const paper = data.papers.find((item) => item.id === paperId);
  if (!paper) return;
  quickPaperId = paper.id;
  els.quickTitle.textContent = paper.shortCode;
  els.quickBody.innerHTML = `
    <p class="quick-paper-title">${escapeHTML(paper.title)}</p>
    <div class="quick-grid" id="quickStatusEditor" data-original-stage="${escapeHTML(paper.focusStage)}" data-original-status="${escapeHTML(paper.statusCode)}" data-original-started-at="${escapeHTML(paper.statusStartedAt)}">
      <label class="form-field full"><span>Status · ${escapeHTML(stageNames[paper.focusStage])}</span><select name="quickStatus">${statusOptionsHtml(paper.focusStage, paper.statusCode)}</select></label>
      <label class="form-field"><span>Effective Date</span><input name="quickEffectiveAt" type="date" value="${escapeHTML(paper.statusStartedAt || todayISO())}" required /></label>
      <label class="form-field"><span>Priority</span><select name="quickPriority">${optionsHtml(priorityNames, paper.priority)}</select></label>
      <label class="form-field full"><span>Next Action</span><textarea name="quickNextAction" placeholder="What should happen next?">${escapeHTML(paper.nextAction)}</textarea></label>
      <label class="form-field"><span>Due Date</span><input name="quickNextDue" type="date" value="${escapeHTML(paper.nextDue)}" /></label>
      <p class="status-change-hint full" id="quickStatusHint">修改状态后，Effective Date 将作为新状态开始日，并自动结束上一状态。</p>
    </div>
  `;
  els.quickDialog.showModal();
}

function saveQuickUpdate(event) {
  event.preventDefault();
  if (!isManageMode || !quickPaperId) return;
  const paper = data.papers.find((item) => item.id === quickPaperId);
  if (!paper) return;
  const form = new FormData(els.quickForm);
  const nextStatus = form.get("quickStatus");
  const effectiveAt = form.get("quickEffectiveAt") || todayISO();
  const statusChanged = nextStatus !== paper.statusCode;
  if (statusChanged && signedDaysBetween(paper.statusStartedAt, effectiveAt) < 0) {
    showToast("新状态开始日不能早于当前状态开始日");
    return;
  }
  const transition = buildStatusTransition({
    timeline: paper.statusTimeline,
    previousStage: paper.focusStage,
    previousStatus: paper.statusCode,
    previousStartedAt: paper.statusStartedAt,
    nextStage: paper.focusStage,
    nextStatus,
    effectiveAt,
    previousLabel: statusLabel(paper.focusStage, paper.statusCode)
  });
  paper.statusCode = nextStatus;
  paper.stageLabel = statusLabel(paper.focusStage, nextStatus);
  paper.statusStartedAt = transition.currentStartedAt;
  paper.statusTimeline = transition.timeline;
  paper.nextAction = form.get("quickNextAction").trim();
  paper.nextDue = form.get("quickNextDue");
  paper.priority = form.get("quickPriority");
  paper.lastActionAt = todayISO();
  paper.updatedAt = todayISO();
  saveLocalDraft();
  renderAll();
  els.quickDialog.close();
  showToast(statusChanged ? "状态已更新，上一阶段已自动归档" : "项目行动信息已更新");
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
    <section class="detail-section detail-action-panel">
      <div><span class="card-label">NEXT ACTION</span><strong>${escapeHTML(cardActionText(paper))}</strong><p class="deadline ${due.tone}">${paper.nextDue ? `Due ${formatEnglishDate(paper.nextDue)} · ${due.label}` : "Deadline not set"}</p></div>
      <div><span class="card-label">REFERENCE PROGRESS</span><strong class="detail-progress-value">${clamp(paper.progress, 0, 100)}%</strong></div>
    </section>
    <section class="detail-section"><div class="detail-grid">
      <div class="detail-row"><span>当前状态</span><strong>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</strong></div>
      <div class="detail-row"><span>Priority</span><strong>${escapeHTML(priorityNames[paper.priority])}${paper.pinned ? " · Pinned" : ""}</strong></div>
      <div class="detail-row"><span>Current Venue</span><strong>${escapeHTML(paper.currentVenue || "待补充")}</strong></div>
      <div class="detail-row"><span>作者</span><strong>${escapeHTML(paper.authors || "待补充")}</strong></div>
      <div class="detail-row"><span>起始日</span><strong>${formatDate(paper.startedAt)}</strong></div>
      <div class="detail-row"><span>项目历时</span><strong>${durationText(paper.startedAt)}</strong></div>
    </div></section>
    <section class="detail-section"><h3>撰写阶段追踪</h3>${renderStageTracker(paper, "writing")}</section>
    <section class="detail-section"><h3>投稿阶段追踪</h3>${renderStageTracker(paper, "submission")}</section>
    <section class="detail-section"><h3>阶段时间线</h3><div class="status-timeline">${renderStatusTimeline(paper)}</div></section>
    <section class="detail-section"><h3>投稿线程</h3><div class="history-list">${renderSubmissionHistory(paper.submissions || []) || `<div class="empty-state">暂无投稿线程</div>`}</div></section>
    ${(paper.notes || paper.links?.length || paper.tags?.length) ? `<section class="detail-section"><h3>Notes & Links</h3>${paper.tags?.length ? `<div class="tag-list">${paper.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}</div>` : ""}${paper.notes ? `<p class="detail-notes">${escapeHTML(paper.notes)}</p>` : ""}${renderLinks(paper.links)}</section>` : ""}
  `;
}

function renderTimelineEditRow(item = {}) {
  return `<div class="editable-item status-history-item" data-status-history-row data-history-id="${escapeHTML(item.id || "")}" data-history-stage="${escapeHTML(item.stage || "writing")}" data-history-status="${escapeHTML(item.status || defaultStatusForStage(item.stage || "writing"))}">
    <div class="history-status-name"><small>${escapeHTML(stageNames[item.stage] || "阶段记录")}</small><strong>${escapeHTML(item.label || statusLabel(item.stage, item.status))}</strong></div>
    <label><span>开始日</span><input data-field="startedAt" type="date" value="${escapeHTML(item.startedAt || "")}" /></label>
    <label><span>结束日</span><input data-field="endedAt" type="date" value="${escapeHTML(item.endedAt || "")}" /></label>
    <button class="remove-item" type="button" aria-label="删除状态记录">×</button>
  </div>`;
}

function renderSubmissionRow(item = {}) {
  return `<div class="editable-item submission-item">
    <label><span>期刊 / 会议</span><input data-field="journal" value="${escapeHTML(item.journal || "")}" placeholder="Journal or conference" /></label>
    <label><span>当前状态</span><select data-field="status">${statusOptionsHtml("submission", normalizeSubmissionStatus(item.status, "under_review"))}</select></label>
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
  const submissionRows = (paper.submissions || []).map(renderSubmissionRow).join("");
  return `
    <section class="detail-section"><h3>Paper Information</h3><div class="form-grid">
      <label class="form-field full"><span>Paper Title</span><textarea name="title" required>${escapeHTML(paper.title)}</textarea></label>
      <label class="form-field full"><span>Authors · 用分号分隔</span><input name="authors" value="${escapeHTML(paper.authors || "")}" /></label>
      <label class="form-field"><span>Short Code · 最多 50 字符</span><input name="shortCode" maxlength="50" required value="${escapeHTML(paper.shortCode)}" /></label>
      <label class="form-field"><span>Start Date</span><input name="startedAt" type="date" value="${escapeHTML(paper.startedAt || "")}" /></label>
      <label class="form-field full"><span>Current Venue</span><input name="currentVenue" value="${escapeHTML(paper.currentVenue || "")}" /></label>
      <label class="form-field full"><span>Notes</span><textarea name="notes">${escapeHTML(paper.notes || "")}</textarea></label>
      <label class="form-field full"><span>Tags · 逗号分隔</span><input name="tags" value="${escapeHTML((paper.tags || []).join(", "))}" /></label>
      <label class="form-field full"><span>Links · 每行使用 Label | URL</span><textarea name="links" placeholder="Manuscript | https://...">${escapeHTML(linksToText(paper.links))}</textarea></label>
    </div></section>
    <section class="detail-section"><div class="tracking-section-heading"><h3>Advanced Settings</h3><p>大阶段切换、状态修正与显示控制。日常更新建议使用 Quick Update。</p></div>
      <div class="status-editor" id="statusEditor" data-original-stage="${escapeHTML(paper.focusStage)}" data-original-status="${escapeHTML(paper.statusCode)}" data-original-started-at="${escapeHTML(paper.statusStartedAt)}">
        <label class="form-field"><span>Current Stage</span><select name="focusStage">${optionsHtml(stageNames, paper.focusStage)}</select></label>
        <label class="form-field"><span>Status</span><select name="statusCode">${statusOptionsHtml(paper.focusStage, paper.statusCode)}</select></label>
        <label class="form-field"><span id="statusDateLabel">Current Status Start</span><input name="statusEffectiveAt" type="date" value="${escapeHTML(paper.statusStartedAt)}" required /></label>
        <label class="form-field"><span>Priority</span><select name="priority">${optionsHtml(priorityNames, paper.priority)}</select></label>
        <label class="form-field full"><span>Reference Progress</span><div class="progress-input-row"><input name="progressRange" type="range" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" /><input name="progress" type="number" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" /></div></label>
        <label class="check-field"><input name="pinned" type="checkbox" ${paper.pinned ? "checked" : ""} /><span>Pin as Current Focus</span></label>
        <label class="check-field"><input name="showOnRoadmap" type="checkbox" ${paper.showOnRoadmap !== false ? "checked" : ""} /><span>Include in Research Pipeline</span></label>
        <p class="status-change-hint full" id="statusChangeHint">状态变化后，所选日期会结束上一状态并开始新状态。</p>
      </div>
    </section>
    <section class="detail-section"><div class="tracking-section-heading"><h3>Status Timeline</h3><p>自动记录，可校正历史日期或删除错误记录。</p></div><div class="editable-history" id="statusTimelineRows">${timelineRows || `<div class="empty-state timeline-empty">首次切换状态后将生成历史记录。</div>`}</div></section>
    <section class="detail-section"><div class="tracking-section-heading"><h3>Submission Threads</h3><p>每个期刊是一条独立线程。</p></div><div class="editable-history" id="submissionRows">${submissionRows}</div><button class="add-row-button" id="addSubmissionButton" type="button">＋ Add Submission Thread</button></section>
  `;
}

function openPaper(paperId, forceEdit = false) {
  const paper = data.papers.find((item) => item.id === paperId);
  if (!paper) return;
  activePaperId = paper.id;
  isCreatingPaper = false;
  newPaperDraft = null;
  const editing = isManageMode && forceEdit;
  els.dialogKicker.textContent = editing ? "FULL EDIT" : `${paper.shortCode} · PAPER DETAILS`;
  els.dialogTitle.textContent = paper.title;
  els.dialogHint.textContent = editing ? "完整编辑 · 日常状态更新可使用 Quick Update" : "阅读模式";
  els.savePaperButton.hidden = !editing;
  els.deletePaperButton.hidden = !editing;
  els.dialogBody.innerHTML = editing ? renderEditForm(paper) : renderPaperDetails(paper);
  els.paperDialog.showModal();
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
  els.deletePaperButton.hidden = true;
  els.dialogBody.innerHTML = renderEditForm(paper);
  els.paperDialog.showModal();
}

function collectStatusTimeline() {
  return [...els.dialogBody.querySelectorAll("[data-status-history-row]")].map((row) => ({
    id: row.dataset.historyId || `timeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    stage: row.dataset.historyStage,
    status: row.dataset.historyStatus,
    label: statusLabel(row.dataset.historyStage, row.dataset.historyStatus),
    startedAt: row.querySelector("[data-field='startedAt']")?.value || "",
    endedAt: row.querySelector("[data-field='endedAt']")?.value || ""
  })).filter((item) => item.startedAt && item.endedAt);
}

function collectSubmissionRows() {
  return [...els.dialogBody.querySelectorAll("#submissionRows .submission-item")].map((row) => ({
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
  if (changed && signedDaysBetween(paper.statusStartedAt, effectiveAt) < 0) return showToast("新状态开始日不能早于当前状态开始日");
  const transition = buildStatusTransition({
    timeline: collectStatusTimeline(), previousStage, previousStatus, previousStartedAt: paper.statusStartedAt,
    nextStage, nextStatus, effectiveAt, previousLabel: statusLabel(previousStage, previousStatus)
  });

  paper.title = title;
  paper.shortCode = shortCode;
  paper.authors = form.get("authors").trim();
  paper.startedAt = form.get("startedAt");
  paper.currentVenue = form.get("currentVenue").trim();
  paper.notes = form.get("notes").trim();
  paper.tags = form.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean);
  paper.links = parseLinks(form.get("links"));
  paper.focusStage = nextStage;
  paper.statusCode = nextStatus;
  paper.stageLabel = statusLabel(nextStage, nextStatus);
  paper.statusStartedAt = transition.currentStartedAt;
  paper.statusTimeline = transition.timeline;
  paper.priority = form.get("priority");
  paper.progress = clamp(form.get("progress"), 0, 100);
  paper.pinned = form.get("pinned") === "on";
  paper.showOnRoadmap = form.get("showOnRoadmap") === "on";
  paper.submissions = collectSubmissionRows();
  paper.updatedAt = todayISO();
  if (isCreatingPaper) data.papers.push(paper);
  saveLocalDraft();
  renderAll();
  els.paperDialog.close();
  showToast(isCreatingPaper ? "新论文项目已创建" : "完整论文信息已保存");
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

function openViewOptions() {
  if (!isManageMode) {
    showToast("进入 Manage Mode 后可修改项目显示设置");
    return;
  }
  els.codesEditor.innerHTML = [...data.papers].sort(compareScore).map((paper) => `
    <div class="code-editor-row"><span>${escapeHTML(paper.title)}</span><input data-code-paper-id="${escapeHTML(paper.id)}" value="${escapeHTML(paper.shortCode)}" maxlength="50" required aria-label="论文简称" /><label class="check-field"><input type="checkbox" data-roadmap-paper-id="${escapeHTML(paper.id)}" ${paper.showOnRoadmap !== false ? "checked" : ""} /><span>Include in Pipeline</span></label></div>
  `).join("");
  els.codesDialog.showModal();
}

function saveViewOptions(event) {
  event.preventDefault();
  const inputs = [...els.codesEditor.querySelectorAll("[data-code-paper-id]")];
  const codes = inputs.map((input) => input.value.trim());
  if (codes.some((code) => !code) || new Set(codes.map((code) => code.toLocaleLowerCase())).size !== codes.length) return showToast("简称不能为空且不能重复");
  inputs.forEach((input) => {
    const paper = data.papers.find((item) => item.id === input.dataset.codePaperId);
    if (paper) paper.shortCode = input.value.trim();
  });
  els.codesEditor.querySelectorAll("[data-roadmap-paper-id]").forEach((input) => {
    const paper = data.papers.find((item) => item.id === input.dataset.roadmapPaperId);
    if (paper) paper.showOnRoadmap = input.checked;
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
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidData(parsed)) throw new Error("数据结构不完整");
    data = normalizePortfolio(parsed);
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
  els.publishDialog.showModal();
}

async function copyCurrentData() {
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
  if (remove) return remove.closest(".editable-item")?.remove();
  if (event.target.closest("#addSubmissionButton")) addSubmissionRow();
}

function handlePipelineClick(event) {
  const close = event.target.closest("[data-close-pipeline-selection]");
  if (close) {
    selectedPipelineBucket = null;
    selectedPipelineSource = null;
    renderOverview();
    renderPipeline();
    return;
  }
  const paperTarget = event.target.closest("[data-pipeline-paper-id]");
  if (paperTarget) {
    isManageMode ? openQuickUpdate(paperTarget.dataset.pipelinePaperId) : openPaper(paperTarget.dataset.pipelinePaperId);
    return;
  }
  const bucketTarget = event.target.closest("[data-pipeline-bucket]");
  if (bucketTarget) togglePipelineSelection(bucketTarget.dataset.pipelineBucket, bucketTarget.dataset.pipelineSource);
}

function bindEvents() {
  els.toggleManageButton.addEventListener("click", () => {
    isManageMode = !isManageMode;
    renderManageState();
    showToast(isManageMode ? "Manage Mode 已开启" : "已返回 Reading Mode");
  });
  els.addPaperButton.addEventListener("click", openNewPaper);
  els.headerAddPaperButton.addEventListener("click", openNewPaper);
  els.openToolsButton.addEventListener("click", () => els.toolsDialog.showModal());
  els.headerPublishButton.addEventListener("click", openPublishDialog);
  els.editCodesButton.addEventListener("click", openViewOptions);
  els.pipelineDistribution.addEventListener("click", handlePipelineClick);
  els.pipelineChart.addEventListener("click", handlePipelineClick);
  els.overviewPipelineSelection.addEventListener("click", handlePipelineClick);
  els.pipelineSelection.addEventListener("click", handlePipelineClick);
  els.searchInput.addEventListener("input", renderPaperList);
  els.stageFilter.addEventListener("change", renderPaperList);
  els.sortSelect.addEventListener("change", renderPaperList);
  els.focusContent.addEventListener("click", (event) => {
    const target = event.target.closest("[data-focus-open]");
    if (target) isManageMode ? openQuickUpdate(target.dataset.focusOpen) : openPaper(target.dataset.focusOpen);
  });
  els.needsAttention.addEventListener("click", (event) => {
    const target = event.target.closest("[data-attention-id]");
    if (target) isManageMode ? openQuickUpdate(target.dataset.attentionId) : openPaper(target.dataset.attentionId);
  });
  els.paperList.addEventListener("click", (event) => {
    const quick = event.target.closest("[data-quick-id]");
    if (quick) return openQuickUpdate(quick.dataset.quickId);
    const edit = event.target.closest("[data-full-edit-id]");
    if (edit) return openPaper(edit.dataset.fullEditId, true);
    const details = event.target.closest("[data-details-id]");
    if (details) return openPaper(details.dataset.detailsId);
  });
  els.quickForm.addEventListener("submit", saveQuickUpdate);
  els.paperForm.addEventListener("submit", saveFullPaper);
  els.deletePaperButton.addEventListener("click", deleteActivePaper);
  els.codesForm.addEventListener("submit", saveViewOptions);
  els.dialogBody.addEventListener("click", handleDialogClick);
  els.dialogBody.addEventListener("input", (event) => {
    if (event.target.name === "focusStage") handleFullStageChange();
    if (event.target.name === "statusCode") updateFullStatusUI(true);
    if (event.target.name === "progressRange") els.dialogBody.querySelector("[name='progress']").value = event.target.value;
    if (event.target.name === "progress") els.dialogBody.querySelector("[name='progressRange']").value = clamp(event.target.value, 0, 100);
  });
  els.quickBody.addEventListener("input", (event) => {
    if (event.target.name !== "quickStatus") return;
    const editor = els.quickBody.querySelector("#quickStatusEditor");
    const changed = event.target.value !== editor.dataset.originalStatus;
    editor.querySelector("[name='quickEffectiveAt']").value = changed ? todayISO() : editor.dataset.originalStartedAt;
    editor.querySelector("#quickStatusHint").textContent = changed
      ? `保存后将结束“${statusLabel(editor.dataset.originalStage, editor.dataset.originalStatus)}”，并从所选日期开始“${statusLabel(editor.dataset.originalStage, event.target.value)}”。`
      : "当前状态未变化；Effective Date 用于校正当前状态开始日。";
  });
  els.closeToolsButton.addEventListener("click", () => els.toolsDialog.close());
  els.exportButton.addEventListener("click", exportData);
  els.importInput.addEventListener("change", (event) => event.target.files[0] && importData(event.target.files[0]));
  els.publishButton.addEventListener("click", openPublishDialog);
  els.resetButton.addEventListener("click", resetDraft);
  els.closePublishButton.addEventListener("click", () => els.publishDialog.close());
  els.copyDataButton.addEventListener("click", copyCurrentData);
  els.draftPublishButton.addEventListener("click", openPublishDialog);
  [els.quickDialog, els.paperDialog, els.codesDialog, els.toolsDialog, els.publishDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
}

bindEvents();
loadData().catch((error) => {
  console.error(error);
  els.paperList.innerHTML = `<div class="empty-state">数据暂时无法加载，请刷新页面或检查 data/papers.json。</div>`;
  showToast("论文数据加载失败");
});
