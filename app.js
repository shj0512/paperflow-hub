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
    ["forthcoming", "Forthcoming / 待正式发表"],
    ["online_first", "Online First"],
    ["published", "Published / 已发表"],
    ["archived", "Archived / 已归档"]
  ]
};


const els = {
  lastUpdatedLabel: document.querySelector("#lastUpdatedLabel"),
  focusContent: document.querySelector("#focusContent"),
  focusIndex: document.querySelector("#focusIndex"),
  focusDots: document.querySelector("#focusDots"),
  focusPrev: document.querySelector("#focusPrev"),
  focusNext: document.querySelector("#focusNext"),
  metrics: document.querySelector("#metrics"),
  roadmapChart: document.querySelector("#roadmapChart"),
  paperList: document.querySelector("#paperList"),
  searchInput: document.querySelector("#searchInput"),
  stageFilter: document.querySelector("#stageFilter"),
  addPaperButton: document.querySelector("#addPaperButton"),
  toggleManageButton: document.querySelector("#toggleManageButton"),
  editCodesButton: document.querySelector("#editCodesButton"),
  openToolsButton: document.querySelector("#openToolsButton"),
  paperDialog: document.querySelector("#paperDialog"),
  paperForm: document.querySelector("#paperForm"),
  codesDialog: document.querySelector("#codesDialog"),
  codesForm: document.querySelector("#codesForm"),
  codesEditor: document.querySelector("#codesEditor"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  dialogFooter: document.querySelector("#dialogFooter"),
  dialogHint: document.querySelector("#dialogHint"),
  savePaperButton: document.querySelector("#savePaperButton"),
  deletePaperButton: document.querySelector("#deletePaperButton"),
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
let activePaperId = null;
let isCreatingPaper = false;
let newPaperDraft = null;
let focusPosition = 0;
let toastTimer;

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatDate(value, fallback = "待补充") {
  if (!value) return fallback;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHTML(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMonth(value, fallback = "待补充") {
  if (!value) return fallback;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHTML(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function durationText(start, end) {
  if (!start) return "未设置起始日";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end || todayISO()}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "日期待校正";
  const days = Math.max(0, Math.round((endDate - startDate) / 86400000));
  return `已历时 ${days} 天`;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}

function statusPeriodText(start, end) {
  const duration = daysBetween(start, end || todayISO());
  const range = `${formatDate(start)} — ${end ? formatDate(end) : "至今"}`;
  return duration === null ? range : `${range} · ${duration} 天`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function statusLabel(stage, status) {
  return stageStatuses[stage]?.find(([value]) => value === status)?.[1] || "状态待设置";
}

function defaultStatusForStage(stage) {
  return stageStatuses[stage]?.[0]?.[0] || "";
}

function inferLegacyStatus(paper, normalizedStage) {
  if (paper.statusCode && stageStatuses[normalizedStage]?.some(([value]) => value === paper.statusCode)) return paper.statusCode;
  const source = `${paper.stageLabel || ""} ${paper.venueSummary || ""}`.toLocaleLowerCase();
  if (normalizedStage === "publication") {
    if (source.includes("online")) return "online_first";
    return source.includes("发表") || source.includes("published") ? "published" : "forthcoming";
  }
  if (normalizedStage === "submission") {
    if (source.includes("已修回") || source.includes("returned") || source.includes("resubmitted")) return "revision_resubmitted";
    if (source.includes("二轮") || source.includes("r2") || source.includes("2nd revision")) return "revision_2";
    if (source.includes("三轮") || source.includes("r3") || source.includes("3rd revision")) return "revision_3";
    if (source.includes("一轮") || source.includes("r1") || source.includes("major revision") || source.includes("1st revision")) return "revision_1";
    if (source.includes("reject") || source.includes("拒稿")) return "rejected";
    if (source.includes("accept") || source.includes("接收")) return "accepted";
    if (source.includes("submitted") || source.includes("审稿") || source.includes("under review")) return "under_review";
    return "under_review";
  }
  if (source.includes("polish") || source.includes("格式") || source.includes("润色")) return "formatting";
  if (source.includes("rewrite") || source.includes("重写")) return "manuscript_writing";
  if (source.includes("writing") || source.includes("撰写")) return "manuscript_writing";
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

function normalizeTimelineStatus(item) {
  const normalizedStage = item.stage === "revision" ? "submission" : item.stage === "accepted" ? "publication" : item.stage;
  const stage = stageStatuses[normalizedStage] ? normalizedStage : "writing";
  const status = stageStatuses[stage].some(([value]) => value === item.status)
    ? item.status
    : inferLegacyStatus({ statusCode: item.status, stageLabel: item.label }, stage);
  return { ...item, stage, status, label: statusLabel(stage, status) };
}

function normalizePaper(paper) {
  const normalizedStage = paper.focusStage === "revision" ? "submission" : paper.focusStage === "accepted" ? "publication" : paper.focusStage;
  const focusStage = stageStatuses[normalizedStage] ? normalizedStage : "writing";
  const statusCode = inferLegacyStatus(paper, focusStage);
  const writingByKey = new Map((paper.writing || []).map((item) => [item.key, item]));
  const writing = defaultWritingSteps.map((fallback) => ({ ...fallback, ...(writingByKey.get(fallback.key) || {}), label: fallback.label }));
  const submissions = (paper.submissions || []).map((item) => ({
    journal: item.journal || "",
    status: normalizeSubmissionStatus(item.status, statusCode),
    statusStartedAt: item.statusStartedAt || item.submittedAt || paper.statusStartedAt || paper.startedAt || "",
    statusEndedAt: item.statusEndedAt || item.decisionAt || ""
  }));
  const {
    manualUpdatedAt: _manualUpdatedAt,
    nextDue: _nextDue,
    venueSummary: _venueSummary,
    nextAction: _nextAction,
    notes: _notes,
    revisions: _revisions,
    ...paperCore
  } = paper;
  return {
    ...paperCore,
    focusStage,
    statusCode,
    stageLabel: statusLabel(focusStage, statusCode),
    statusStartedAt: paper.statusStartedAt || paper.startedAt || todayISO(),
    statusTimeline: Array.isArray(paper.statusTimeline) ? paper.statusTimeline.map(normalizeTimelineStatus) : [],
    showOnRoadmap: paper.showOnRoadmap !== false,
    writing,
    submissions
  };
}

function normalizePortfolio(value) {
  return { ...value, papers: (value.papers || []).map(normalizePaper) };
}

function isValidData(value) {
  return Boolean(
    value &&
      value.meta &&
      Array.isArray(value.papers) &&
      value.papers.every((paper) => paper.id && paper.title && paper.shortCode)
  );
}

function createPaperId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `paper-${randomPart}`;
}

function createBlankPaper() {
  return {
    id: createPaperId(),
    title: "",
    shortCode: "",
    authors: "",
    focusStage: "writing",
    statusCode: "research_question",
    stageLabel: statusLabel("writing", "research_question"),
    statusStartedAt: todayISO(),
    statusTimeline: [],
    showOnRoadmap: true,
    progress: 0,
    startedAt: todayISO(),
    updatedAt: todayISO(),
    writing: deepClone(defaultWritingSteps),
    submissions: [],
    revisions: []
  };
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setDraftState(isDraft) {
  els.draftBanner.hidden = !isDraft;
}

function saveLocalDraft() {
  data.meta.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setDraftState(true);
}

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取论文数据");
  const publishedSource = await response.json();
  if (!isValidData(publishedSource)) throw new Error("论文数据格式不正确");
  publishedData = normalizePortfolio(publishedSource);

  const localDraft = localStorage.getItem(STORAGE_KEY);
  if (localDraft) {
    try {
      const parsed = JSON.parse(localDraft);
      if (isValidData(parsed) && Number(parsed.meta.version || 0) >= Number(publishedData.meta.version || 0)) {
        data = normalizePortfolio(parsed);
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

function renderAll() {
  renderHero();
  renderMetrics();
  renderRoadmap();
  renderPaperList();
  renderManageState();
}

function paperStartTime(paper) {
  const timestamp = Date.parse(`${paper.startedAt || "1900-01-01"}T12:00:00`);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getPortfolioPapers() {
  const byLatestStart = (a, b) => paperStartTime(b) - paperStartTime(a);
  const ongoing = data.papers.filter((paper) => paper.focusStage !== "publication").sort(byLatestStart);
  const completed = data.papers.filter((paper) => paper.focusStage === "publication").sort(byLatestStart);
  return [...ongoing, ...completed];
}

function renderHero() {
  const portfolioPapers = getPortfolioPapers();
  const paper = portfolioPapers[focusPosition] || portfolioPapers[0];
  if (!paper) {
    els.lastUpdatedLabel.textContent = `更新于 ${formatDate((data.meta.manualUpdatedAt || data.meta.lastUpdated || "").slice(0, 10))}`;
    els.focusIndex.textContent = "00 / 00";
    els.focusContent.innerHTML = `
      <h3>尚无论文项目</h3>
      <span class="focus-status">进入管理模式后可新增论文</span>
      <p class="focus-next">从一篇工作论文开始建立研究组合。</p>
    `;
    els.focusDots.innerHTML = "";
    return;
  }
  focusPosition = portfolioPapers.indexOf(paper);
  const total = portfolioPapers.length;
  els.lastUpdatedLabel.textContent = `更新于 ${formatDate((data.meta.manualUpdatedAt || data.meta.lastUpdated || "").slice(0, 10))}`;
  els.focusIndex.textContent = `${String(focusPosition + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  els.focusContent.innerHTML = `
    <h3>${escapeHTML(paper.title)}</h3>
    <span class="focus-status">${escapeHTML(paper.stageLabel || stageNames[paper.focusStage])}</span>
    <div class="focus-progress-row">
      <div class="progress-track"><span class="progress-fill" style="width:${clamp(paper.progress, 0, 100)}%"></span></div>
      <strong>${clamp(paper.progress, 0, 100)}%</strong>
    </div>
    <p class="focus-next">当前状态始于 <strong>${formatDate(paper.statusStartedAt || paper.startedAt)}</strong> · ${durationText(paper.statusStartedAt || paper.startedAt)}</p>
  `;
  els.focusDots.innerHTML = portfolioPapers.map((_, index) => `<i class="${index === focusPosition ? "active" : ""}"></i>`).join("");
}

function renderMetrics() {
  const total = data.papers.length;
  const writing = data.papers.filter((paper) => paper.focusStage === "writing").length;
  const submission = data.papers.filter((paper) => paper.focusStage === "submission" && ["under_review", "decision_pending"].includes(paper.statusCode)).length;
  const revision = data.papers.filter((paper) => paper.focusStage === "submission" && paper.statusCode.startsWith("revision_")).length;
  const accepted = data.papers.filter((paper) => paper.focusStage === "publication").length;
  const working = total - accepted;
  const average = total ? Math.round(data.papers.reduce((sum, paper) => sum + clamp(paper.progress, 0, 100), 0) / total) : 0;

  const metricItems = [
    ["Working Papers", working, "工作论文", "working"],
    ["Published Papers", accepted, "已发表成果", "published"],
    ["撰写进行中", writing, "Writing", "writing"],
    ["投稿审稿中", submission, "Under Review", "submission"],
    ["返修进行中", revision, "Revision", "revision"],
    ["组合平均进度", `${average}%`, "Portfolio Progress", "progress"]
  ];
  els.metrics.innerHTML = metricItems
    .map(([label, value, note, tone]) => `
      <div class="metric metric-${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `)
    .join("");
}

function renderRoadmap() {
  const scale = `
    <div class="roadmap-axis">
      <span class="roadmap-label-spacer"></span>
      <div class="roadmap-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div>
      <span class="roadmap-value"></span>
    </div>
  `;
  const roadmapPapers = getPortfolioPapers().filter((paper) => paper.showOnRoadmap !== false);
  const rows = roadmapPapers
    .map((paper) => {
      const progress = clamp(paper.progress, 0, 100);
      return `
        <div class="roadmap-row" title="${escapeHTML(paper.title)} · ${progress}%">
          <div class="roadmap-code"><i></i><span><strong>${escapeHTML(paper.shortCode)}</strong><small>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</small></span></div>
          <div class="roadmap-lane">
            <span class="roadmap-bar ${paper.focusStage === "publication" ? "accepted" : ""}" style="width:${progress}%"></span>
            <span class="roadmap-marker" style="left:${progress}%"></span>
          </div>
          <span class="roadmap-value">${progress}%</span>
        </div>
      `;
    })
    .join("");
  els.roadmapChart.innerHTML = scale + (rows || `<div class="roadmap-empty">尚未选择要在进展图中显示的论文。进入管理模式后点击“管理进展图”即可设置。</div>`);
}

function getFilteredPapers() {
  const query = els.searchInput.value.trim().toLocaleLowerCase();
  const stage = els.stageFilter.value;
  return getPortfolioPapers().filter((paper) => {
    const haystack = [paper.title, paper.shortCode, paper.authors, paper.venueSummary, paper.nextAction, paper.notes, stageNames[paper.focusStage], statusLabel(paper.focusStage, paper.statusCode)]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return (!query || haystack.includes(query)) && (stage === "all" || paper.focusStage === stage);
  });
}

function renderPaperList() {
  const papers = getFilteredPapers();
  if (!papers.length) {
    els.paperList.innerHTML = `<div class="empty-state">没有找到匹配的论文。换一个关键词或阶段试试。</div>`;
    return;
  }

  const ongoing = papers.filter((paper) => paper.focusStage !== "publication");
  const completed = papers.filter((paper) => paper.focusStage === "publication");
  els.paperList.innerHTML = [
    renderProjectGroup("正在进行", "ONGOING", ongoing),
    renderProjectGroup("已经完成", "COMPLETED", completed)
  ].filter(Boolean).join("");
}

function renderProjectGroup(title, kicker, papers) {
  if (!papers.length) return "";
  return `
    <section class="project-group">
      <div class="project-group-heading">
        <div><span>${kicker}</span><h3>${title}</h3></div>
        <strong>${String(papers.length).padStart(2, "0")}</strong>
      </div>
      <div class="project-group-list">
        ${papers.map(renderPaperCard).join("")}
      </div>
    </section>
  `;
}

function renderPaperCard(paper) {
  const progress = clamp(paper.progress, 0, 100);
  const currentStartedAt = paper.statusStartedAt || paper.startedAt;
  return `
        <article class="paper-card" tabindex="0" data-paper-id="${escapeHTML(paper.id)}" style="--paper-color:${stageColor(paper.focusStage)}">
          <div class="paper-main">
            <div class="paper-topline">
              <span class="paper-code">${escapeHTML(paper.shortCode)}</span>
              <span class="stage-badge ${paper.focusStage}">${escapeHTML(paper.stageLabel || stageNames[paper.focusStage])}</span>
            </div>
            <h3>${escapeHTML(paper.title)}</h3>
            <div class="paper-meta">
              <span><em>启动</em><strong>${formatMonth(paper.startedAt)}</strong></span>
              <span><em>历时</em><strong>${durationText(paper.startedAt).replace(/^已历时\s*/, "")}</strong></span>
              <span class="meta-wide"><em>作者</em><strong>${escapeHTML(paper.authors || "待补充")}</strong></span>
              <span class="meta-wide"><em>当前状态</em><strong>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</strong></span>
            </div>
            <div class="paper-footer">
              <div class="paper-progress"><div class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></div></div>
              <div class="paper-next"><span>状态区间</span><strong>${formatDate(currentStartedAt)} — 至今 · ${durationText(currentStartedAt).replace(/^已历时\s*/, "")}</strong></div>
            </div>
          </div>
          <div class="paper-side">
            <span class="paper-side-label">CURRENT STATUS</span>
            <strong>${escapeHTML(currentThread(paper))}</strong>
            <small>${formatDate(paper.statusStartedAt)} 至今 · ${progress}% · ${escapeHTML(stageNames[paper.focusStage] || "未分类")}</small>
            <button class="card-action" type="button" data-edit-id="${escapeHTML(paper.id)}">编辑进展</button>
          </div>
        </article>
  `;
}

function stageColor(stage) {
  return {
    writing: "#8fcbed",
    submission: "#58a9dc",
    publication: "#45a887"
  }[stage] || "#8fcbed";
}

function currentThread(paper) {
  return statusLabel(paper.focusStage, paper.statusCode);
}

function renderManageState() {
  document.body.classList.toggle("manage-mode", isManageMode);
  els.toggleManageButton.textContent = isManageMode ? "退出管理模式" : "进入管理模式";
  els.addPaperButton.hidden = !isManageMode;
  const viewPill = document.querySelector(".view-pill");
  if (viewPill) viewPill.lastChild.textContent = isManageMode ? "管理视图" : "阅读视图";
}

function moveFocus(delta) {
  const total = getPortfolioPapers().length;
  if (!total) return;
  focusPosition = (focusPosition + delta + total) % total;
  renderHero();
}

function openPaper(paperId, forceEdit = false) {
  const paper = data.papers.find((item) => item.id === paperId);
  if (!paper) return;
  isCreatingPaper = false;
  newPaperDraft = null;
  activePaperId = paper.id;
  const editing = isManageMode || forceEdit;
  if (forceEdit && !isManageMode) {
    isManageMode = true;
    renderManageState();
  }
  els.dialogKicker.textContent = editing ? "EDIT PAPER" : `${paper.shortCode} · PAPER DETAILS`;
  els.dialogTitle.textContent = paper.title;
  els.dialogHint.textContent = editing ? "切换状态并保存后，上一状态的起止日期会自动归档" : "阅读视图 · 进入管理模式后可修改";
  els.savePaperButton.hidden = !editing;
  els.savePaperButton.textContent = "保存修改";
  els.deletePaperButton.hidden = !editing;
  els.dialogBody.innerHTML = editing ? renderEditForm(paper) : renderPaperDetails(paper);
  els.paperDialog.showModal();
  if (forceEdit) window.setTimeout(() => els.dialogBody.querySelector("input[name='shortCode']")?.focus(), 100);
}

function openNewPaper() {
  if (!isManageMode) {
    isManageMode = true;
    renderManageState();
  }
  const paper = createBlankPaper();
  isCreatingPaper = true;
  newPaperDraft = paper;
  activePaperId = paper.id;
  els.dialogKicker.textContent = "NEW PAPER";
  els.dialogTitle.textContent = "新增论文项目";
  els.dialogHint.textContent = "创建后先保存为本机草稿，再通过数据工具发布";
  els.savePaperButton.hidden = false;
  els.savePaperButton.textContent = "创建项目";
  els.deletePaperButton.hidden = true;
  els.dialogBody.innerHTML = renderEditForm(paper);
  els.paperDialog.showModal();
  window.setTimeout(() => els.dialogBody.querySelector("textarea[name='title']")?.focus(), 100);
}

function renderStatusTimeline(paper) {
  const archived = (paper.statusTimeline || []).map((item) => ({ ...item, current: false }));
  const current = {
    stage: paper.focusStage,
    status: paper.statusCode,
    label: statusLabel(paper.focusStage, paper.statusCode),
    startedAt: paper.statusStartedAt || paper.startedAt,
    endedAt: "",
    current: true
  };
  return [...archived, current].map((item, index) => `
    <div class="status-timeline-item ${item.current ? "current" : ""}">
      <span class="timeline-marker">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <small>${escapeHTML(stageNames[item.stage] || "阶段记录")}${item.current ? " · 当前" : ""}</small>
        <strong>${escapeHTML(item.label || statusLabel(item.stage, item.status))}</strong>
        <p>${statusPeriodText(item.startedAt, item.endedAt)}</p>
      </div>
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

function renderStageStatusTracker(paper, stage) {
  return `
    <div class="stage-status-tracker ${stage}">
      ${(stageStatuses[stage] || []).map(([value, label], index) => `
        <div class="stage-status-step ${statusWasUsed(paper, stage, value, index)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHTML(label)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPaperDetails(paper) {
  const submissions = renderSubmissionHistory(paper.submissions || []);

  return `
    <section class="detail-section">
      <div class="detail-grid">
        <div class="detail-row"><span>论文简称</span><strong>${escapeHTML(paper.shortCode)}</strong></div>
        <div class="detail-row"><span>当前大阶段</span><strong>${escapeHTML(stageNames[paper.focusStage])}</strong></div>
        <div class="detail-row"><span>当前状态</span><strong>${escapeHTML(statusLabel(paper.focusStage, paper.statusCode))}</strong></div>
        <div class="detail-row"><span>当前状态开始日</span><strong>${formatDate(paper.statusStartedAt || paper.startedAt)}</strong></div>
        <div class="detail-row"><span>作者</span><strong>${escapeHTML(paper.authors || "待补充")}</strong></div>
        <div class="detail-row"><span>起始日</span><strong>${formatDate(paper.startedAt)}</strong></div>
        <div class="detail-row"><span>历时</span><strong>${durationText(paper.startedAt)}</strong></div>
        <div class="detail-row"><span>当前进度</span><strong>${clamp(paper.progress, 0, 100)}%</strong></div>
      </div>
    </section>
    <section class="detail-section">
      <h3>撰写阶段追踪</h3>
      ${renderStageStatusTracker(paper, "writing")}
    </section>
    <section class="detail-section">
      <h3>投稿阶段追踪</h3>
      ${renderStageStatusTracker(paper, "submission")}
    </section>
    <section class="detail-section">
      <h3>阶段时间线</h3>
      <div class="status-timeline">${renderStatusTimeline(paper)}</div>
    </section>
    <section class="detail-section">
      <h3>投稿线程</h3>
      <div class="history-list">${submissions || `<div class="empty-state">暂无投稿记录</div>`}</div>
    </section>
  `;
}

function renderSubmissionHistory(items) {
  return items
    .map((item) => {
      return `
        <div class="history-item">
          <div class="item-row-top"><strong>${escapeHTML(item.journal)}</strong><span class="submission-badge ${escapeHTML(item.status)}">${escapeHTML(statusLabel("submission", item.status))}</span></div>
          <p>${statusPeriodText(item.statusStartedAt, item.statusEndedAt)}</p>
        </div>
      `;
    })
    .join("");
}

function optionsHtml(options, selected) {
  return Object.entries(options)
    .map(([value, label]) => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`)
    .join("");
}

function statusOptionsHtml(stage, selected) {
  return (stageStatuses[stage] || [])
    .map(([value, label]) => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`)
    .join("");
}

function renderTimelineEditRow(item = {}) {
  return `
    <div class="editable-item status-history-item" data-status-history-row data-history-id="${escapeHTML(item.id || "")}" data-history-stage="${escapeHTML(item.stage || "writing")}" data-history-status="${escapeHTML(item.status || defaultStatusForStage(item.stage || "writing"))}">
      <div class="history-status-name">
        <small>${escapeHTML(stageNames[item.stage] || "阶段记录")}</small>
        <strong>${escapeHTML(item.label || statusLabel(item.stage, item.status))}</strong>
      </div>
      <label><span>开始日</span><input data-field="startedAt" type="date" value="${escapeHTML(item.startedAt || "")}" /></label>
      <label><span>结束日</span><input data-field="endedAt" type="date" value="${escapeHTML(item.endedAt || "")}" /></label>
      <button class="remove-item" type="button" aria-label="删除这条状态时间线">×</button>
    </div>
  `;
}

function renderEditForm(paper) {
  const submissionRows = (paper.submissions || []).map(renderSubmissionRow).join("");
  const timelineRows = (paper.statusTimeline || []).map(renderTimelineEditRow).join("");

  return `
    <section class="detail-section">
      <h3>基础信息</h3>
      <div class="form-grid">
        <label class="form-field full"><span>论文标题</span><textarea name="title" required>${escapeHTML(paper.title)}</textarea></label>
        <label class="form-field full"><span>作者（用分号分隔）</span><input name="authors" value="${escapeHTML(paper.authors || "")}" /></label>
        <label class="form-field"><span>简称（最多 50 个字符）</span><input name="shortCode" value="${escapeHTML(paper.shortCode)}" maxlength="50" required /></label>
        <div class="status-editor full" id="statusEditor" data-original-stage="${escapeHTML(paper.focusStage)}" data-original-status="${escapeHTML(paper.statusCode)}" data-original-started-at="${escapeHTML(paper.statusStartedAt || paper.startedAt)}">
          <label class="form-field"><span>当前大阶段</span><select name="focusStage">${optionsHtml(stageNames, paper.focusStage)}</select></label>
          <label class="form-field"><span>阶段显示名称</span><select name="statusCode">${statusOptionsHtml(paper.focusStage, paper.statusCode)}</select></label>
          <label class="form-field status-date-field">
            <span id="statusDateLabel">当前状态开始日</span>
            <input name="statusEffectiveAt" type="date" value="${escapeHTML(paper.statusStartedAt || paper.startedAt || todayISO())}" required />
          </label>
          <p class="status-change-hint" id="statusChangeHint">选择新状态和生效日。保存后，上一状态会自动结束并写入阶段时间线。</p>
        </div>
        <label class="form-field"><span>起始日</span><input name="startedAt" type="date" value="${escapeHTML(paper.startedAt || "")}" /></label>
        <label class="form-field full">
          <span>参考进度</span>
          <div class="progress-input-row">
            <input name="progressRange" type="range" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" />
            <input name="progress" type="number" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" />
          </div>
        </label>
      </div>
    </section>
    <section class="detail-section">
      <div class="tracking-section-heading">
        <h3>当前阶段追踪</h3>
        <p>撰写阶段固定为 4 个状态；投稿与返修合并为同一条投稿阶段状态链。</p>
      </div>
      <div id="stageTrackerPreview">${renderStageStatusTracker(paper, paper.focusStage)}</div>
    </section>
    <section class="detail-section">
      <div class="tracking-section-heading">
        <h3>阶段时间线</h3>
        <p>切换状态时自动新增记录。下列历史日期可以校正，也可以删除错误记录。</p>
      </div>
      <div class="editable-history" id="statusTimelineRows">${timelineRows || `<div class="empty-state timeline-empty">首次切换状态后，这里会出现完整的起止日期。</div>`}</div>
    </section>
    <section class="detail-section">
      <div class="tracking-section-heading">
        <h3>投稿线程</h3>
        <p>每个期刊是一条独立线程；状态只能从统一投稿状态中选择。</p>
      </div>
      <div class="editable-history" id="submissionRows">${submissionRows}</div>
      <button class="add-row-button" id="addSubmissionButton" type="button">＋ 添加投稿线程</button>
    </section>
  `;
}

function renderSubmissionRow(item = {}) {
  return `
    <div class="editable-item submission-item">
      <label><span>期刊 / 会议</span><input data-field="journal" aria-label="期刊名称" placeholder="期刊名称" value="${escapeHTML(item.journal || "")}" /></label>
      <label><span>当前状态</span><select data-field="status" aria-label="投稿状态">${statusOptionsHtml("submission", normalizeSubmissionStatus(item.status, "under_review"))}</select></label>
      <label><span>状态开始日</span><input data-field="statusStartedAt" aria-label="状态开始日" type="date" value="${escapeHTML(item.statusStartedAt || "")}" /></label>
      <label><span>状态结束日</span><input data-field="statusEndedAt" aria-label="状态结束日" type="date" value="${escapeHTML(item.statusEndedAt || "")}" /></label>
      <button class="remove-item" type="button" aria-label="删除投稿记录">×</button>
    </div>
  `;
}

function collectRows(containerSelector, fields) {
  return [...els.dialogBody.querySelectorAll(`${containerSelector} .editable-item`)]
    .map((row) => {
      const item = {};
      fields.forEach((field) => {
        const input = row.querySelector(`[data-field='${field}']`);
        item[field] = field === "round" ? Number(input?.value || 1) : input?.value.trim() || "";
      });
      return item;
    })
    .filter((item) => item.journal);
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

function updateStageTrackerPreview() {
  const editor = els.dialogBody.querySelector("#statusEditor");
  const preview = els.dialogBody.querySelector("#stageTrackerPreview");
  if (!editor || !preview) return;
  const paper = isCreatingPaper ? newPaperDraft : data.papers.find((item) => item.id === activePaperId);
  const stage = editor.querySelector("select[name='focusStage']").value;
  const status = editor.querySelector("select[name='statusCode']").value;
  preview.innerHTML = renderStageStatusTracker({
    ...(paper || {}),
    focusStage: stage,
    statusCode: status,
    statusTimeline: collectStatusTimeline()
  }, stage);
}

function updateStatusTransitionUI(resetDate = false) {
  const editor = els.dialogBody.querySelector("#statusEditor");
  if (!editor) return;
  const stageSelect = editor.querySelector("select[name='focusStage']");
  const statusSelect = editor.querySelector("select[name='statusCode']");
  const dateInput = editor.querySelector("input[name='statusEffectiveAt']");
  const dateLabel = editor.querySelector("#statusDateLabel");
  const hint = editor.querySelector("#statusChangeHint");
  const changed = stageSelect.value !== editor.dataset.originalStage || statusSelect.value !== editor.dataset.originalStatus;
  if (resetDate) dateInput.value = changed ? todayISO() : editor.dataset.originalStartedAt;
  dateLabel.textContent = changed ? "新状态开始日" : "当前状态开始日";
  hint.textContent = changed
    ? `保存后将归档“${statusLabel(editor.dataset.originalStage, editor.dataset.originalStatus)}”，并从所选日期开始“${statusLabel(stageSelect.value, statusSelect.value)}”。日期可手动修改。`
    : "当前状态尚未切换；修改此日期只会校正当前状态的开始日。";
  updateStageTrackerPreview();
}

function handleBigStageChange() {
  const editor = els.dialogBody.querySelector("#statusEditor");
  if (!editor) return;
  const stageSelect = editor.querySelector("select[name='focusStage']");
  const statusSelect = editor.querySelector("select[name='statusCode']");
  const selected = stageSelect.value === editor.dataset.originalStage ? editor.dataset.originalStatus : defaultStatusForStage(stageSelect.value);
  statusSelect.innerHTML = statusOptionsHtml(stageSelect.value, selected);
  updateStatusTransitionUI(true);
}

function saveActivePaper(event) {
  event.preventDefault();
  if (!isManageMode || !activePaperId) return;
  const paper = isCreatingPaper ? newPaperDraft : data.papers.find((item) => item.id === activePaperId);
  if (!paper) return;
  const formData = new FormData(els.paperForm);
  const title = formData.get("title").trim();
  const shortCode = formData.get("shortCode").trim();
  if (!title || !shortCode) {
    showToast("请填写论文标题和简称");
    return;
  }
  const duplicateCode = data.papers.some((item) => item.id !== paper.id && item.shortCode.trim().toLocaleLowerCase() === shortCode.toLocaleLowerCase());
  if (duplicateCode) {
    showToast("论文简称不能与现有项目重复");
    return;
  }
  const previousStage = paper.focusStage;
  const previousStatus = paper.statusCode;
  const previousStatusStartedAt = paper.statusStartedAt || paper.startedAt || formData.get("startedAt") || todayISO();
  const nextStage = formData.get("focusStage");
  const nextStatus = formData.get("statusCode");
  const statusEffectiveAt = formData.get("statusEffectiveAt") || todayISO();
  const statusChanged = !isCreatingPaper && (nextStage !== previousStage || nextStatus !== previousStatus);
  if (statusChanged && daysBetween(previousStatusStartedAt, statusEffectiveAt) === null) {
    showToast("请检查新状态开始日");
    return;
  }
  if (statusChanged && new Date(`${statusEffectiveAt}T12:00:00`) < new Date(`${previousStatusStartedAt}T12:00:00`)) {
    showToast("新状态开始日不能早于当前状态开始日");
    return;
  }
  const transition = buildStatusTransition({
    timeline: collectStatusTimeline(),
    previousStage,
    previousStatus,
    previousStartedAt: previousStatusStartedAt,
    nextStage,
    nextStatus,
    effectiveAt: statusEffectiveAt,
    previousLabel: statusLabel(previousStage, previousStatus)
  });
  paper.title = title;
  paper.authors = formData.get("authors").trim();
  paper.shortCode = shortCode;
  paper.focusStage = nextStage;
  paper.statusCode = nextStatus;
  paper.stageLabel = statusLabel(nextStage, nextStatus);
  paper.statusStartedAt = transition.currentStartedAt;
  paper.statusTimeline = transition.timeline;
  paper.startedAt = formData.get("startedAt");
  paper.progress = clamp(formData.get("progress"), 0, 100);
  paper.updatedAt = todayISO();
  paper.submissions = collectRows("#submissionRows", ["journal", "status", "statusStartedAt", "statusEndedAt"]);
  if (isCreatingPaper) data.papers.push(paper);
  saveLocalDraft();
  const message = isCreatingPaper ? "新论文项目已创建并保存为本机草稿" : "论文进展已保存到本机草稿";
  isCreatingPaper = false;
  newPaperDraft = null;
  activePaperId = paper.id;
  focusPosition = 0;
  renderAll();
  els.paperDialog.close();
  showToast(message);
}

function deleteActivePaper() {
  if (!isManageMode || isCreatingPaper || !activePaperId) return;
  const paper = data.papers.find((item) => item.id === activePaperId);
  if (!paper) return;
  const confirmed = window.confirm(`确定删除“${paper.title}”吗？删除会先保存为本机草稿，发布前仍可通过“恢复已发布版本”撤销。`);
  if (!confirmed) return;
  data.papers = data.papers.filter((item) => item.id !== activePaperId);
  activePaperId = null;
  focusPosition = 0;
  saveLocalDraft();
  renderAll();
  els.paperDialog.close();
  showToast("论文项目已从本机草稿中删除");
}

function addSubmissionRow() {
  const target = els.dialogBody.querySelector("#submissionRows");
  if (!target) return;
  target.insertAdjacentHTML("beforeend", renderSubmissionRow({ statusStartedAt: todayISO() }));
}

function openCodesManager() {
  els.codesEditor.innerHTML = getPortfolioPapers().map((paper) => `
    <div class="code-editor-row">
      <span>${escapeHTML(paper.title)}</span>
      <input data-code-paper-id="${escapeHTML(paper.id)}" value="${escapeHTML(paper.shortCode)}" maxlength="50" required aria-label="论文简称" />
      <label class="roadmap-visibility"><input type="checkbox" data-roadmap-paper-id="${escapeHTML(paper.id)}" ${paper.showOnRoadmap !== false ? "checked" : ""} /><span>显示在进展图</span></label>
    </div>
  `).join("");
  els.codesDialog.showModal();
}

function saveAllCodes(event) {
  event.preventDefault();
  const inputs = [...els.codesEditor.querySelectorAll("[data-code-paper-id]")];
  const codes = inputs.map((input) => input.value.trim());
  if (codes.some((code) => !code)) {
    showToast("每篇论文都需要一个简称");
    return;
  }
  const normalized = codes.map((code) => code.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    showToast("论文简称不能重复");
    return;
  }
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
  showToast("进展图显示设置与论文简称已保存");
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
    focusPosition = 0;
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
  if (!window.confirm("确定清除这台设备上的草稿，并恢复为 GitHub 已发布版本吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  data = deepClone(publishedData);
  focusPosition = 0;
  setDraftState(false);
  renderAll();
  els.toolsDialog.close();
  showToast("已恢复为已发布版本");
}

function handleDialogClick(event) {
  const removeButton = event.target.closest(".remove-item");
  if (removeButton) {
    removeButton.closest(".editable-item")?.remove();
    return;
  }
  if (event.target.closest("#addSubmissionButton")) addSubmissionRow();
}

function bindEvents() {
  els.focusPrev.addEventListener("click", () => moveFocus(-1));
  els.focusNext.addEventListener("click", () => moveFocus(1));
  els.searchInput.addEventListener("input", renderPaperList);
  els.stageFilter.addEventListener("change", renderPaperList);
  els.toggleManageButton.addEventListener("click", () => {
    isManageMode = !isManageMode;
    renderManageState();
    showToast(isManageMode ? "管理模式已开启：修改将保存为本机草稿" : "已返回阅读视图");
  });
  els.addPaperButton.addEventListener("click", openNewPaper);
  els.editCodesButton.addEventListener("click", openCodesManager);
  els.paperList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      event.stopPropagation();
      openPaper(editButton.dataset.editId, true);
      return;
    }
    const card = event.target.closest("[data-paper-id]");
    if (card) openPaper(card.dataset.paperId);
  });
  els.paperList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-paper-id]");
    if (card) {
      event.preventDefault();
      openPaper(card.dataset.paperId);
    }
  });
  els.paperForm.addEventListener("submit", saveActivePaper);
  els.deletePaperButton.addEventListener("click", deleteActivePaper);
  els.codesForm.addEventListener("submit", saveAllCodes);
  els.dialogBody.addEventListener("click", handleDialogClick);
  els.dialogBody.addEventListener("input", (event) => {
    if (event.target.name === "focusStage") {
      handleBigStageChange();
    }
    if (event.target.name === "statusCode") {
      updateStatusTransitionUI(true);
    }
    if (event.target.name === "progressRange") {
      els.dialogBody.querySelector("input[name='progress']").value = event.target.value;
    }
    if (event.target.name === "progress") {
      els.dialogBody.querySelector("input[name='progressRange']").value = clamp(event.target.value, 0, 100);
    }
  });
  els.openToolsButton.addEventListener("click", () => els.toolsDialog.showModal());
  els.closeToolsButton.addEventListener("click", () => els.toolsDialog.close());
  els.exportButton.addEventListener("click", exportData);
  els.importInput.addEventListener("change", (event) => event.target.files[0] && importData(event.target.files[0]));
  els.publishButton.addEventListener("click", openPublishDialog);
  els.resetButton.addEventListener("click", resetDraft);
  els.closePublishButton.addEventListener("click", () => els.publishDialog.close());
  els.copyDataButton.addEventListener("click", copyCurrentData);
  els.draftPublishButton.addEventListener("click", openPublishDialog);
  [els.paperDialog, els.codesDialog, els.toolsDialog, els.publishDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  window.setInterval(() => {
    if (!els.paperDialog.open && !els.codesDialog.open && !els.toolsDialog.open && !els.publishDialog.open) moveFocus(1);
  }, 9000);
}

bindEvents();
loadData().catch((error) => {
  console.error(error);
  els.paperList.innerHTML = `<div class="empty-state">数据暂时无法加载。请刷新页面或检查 data/papers.json。</div>`;
  showToast("论文数据加载失败");
});
