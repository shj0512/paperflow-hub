const DATA_URL = "./data/papers.json";
const STORAGE_KEY = "paperflow-draft-v1";
const REPO_EDIT_URL = "https://github.com/shj0512/paperflow-hub/edit/main/data/papers.json";

const stageNames = {
  writing: "撰写阶段",
  submission: "投稿阶段",
  revision: "返修阶段",
  accepted: "已接收 / 发表"
};

const submissionStatusNames = {
  preparing: "准备投稿",
  submitted: "审稿中",
  revision: "返修",
  rejected: "拒稿",
  accepted: "接收",
  withdrawn: "撤稿"
};

const writingStatusNames = {
  pending: "待开始",
  in_progress: "进行中",
  done: "已完成"
};

const revisionStatusNames = {
  pending: "待开始",
  in_progress: "进行中",
  returned: "已交回",
  decided: "已决定"
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
  progressNote: document.querySelector("#progressNote"),
  paperList: document.querySelector("#paperList"),
  searchInput: document.querySelector("#searchInput"),
  stageFilter: document.querySelector("#stageFilter"),
  toggleManageButton: document.querySelector("#toggleManageButton"),
  editCodesButton: document.querySelector("#editCodesButton"),
  openToolsButton: document.querySelector("#openToolsButton"),
  paperDialog: document.querySelector("#paperDialog"),
  paperForm: document.querySelector("#paperForm"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  dialogFooter: document.querySelector("#dialogFooter"),
  dialogHint: document.querySelector("#dialogHint"),
  savePaperButton: document.querySelector("#savePaperButton"),
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

function durationText(start, end) {
  if (!start) return "未设置起始日";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end || todayISO()}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "日期待校正";
  const days = Math.max(0, Math.round((endDate - startDate) / 86400000));
  return `已历时 ${days} 天`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidData(value) {
  return Boolean(
    value &&
      value.meta &&
      Array.isArray(value.papers) &&
      value.papers.length &&
      value.papers.every((paper) => paper.id && paper.title && paper.shortCode)
  );
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
  publishedData = await response.json();
  if (!isValidData(publishedData)) throw new Error("论文数据格式不正确");

  const localDraft = localStorage.getItem(STORAGE_KEY);
  if (localDraft) {
    try {
      const parsed = JSON.parse(localDraft);
      if (isValidData(parsed)) {
        data = parsed;
        setDraftState(true);
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

function renderHero() {
  const paper = data.papers[focusPosition] || data.papers[0];
  if (!paper) return;
  focusPosition = data.papers.indexOf(paper);
  const total = data.papers.length;
  els.lastUpdatedLabel.textContent = `更新于 ${formatDate((data.meta.manualUpdatedAt || data.meta.lastUpdated || "").slice(0, 10))}`;
  els.focusIndex.textContent = `${String(focusPosition + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  els.focusContent.innerHTML = `
    <h3>${escapeHTML(paper.title)}</h3>
    <span class="focus-status">${escapeHTML(paper.stageLabel || stageNames[paper.focusStage])}</span>
    <div class="focus-progress-row">
      <div class="progress-track"><span class="progress-fill" style="width:${clamp(paper.progress, 0, 100)}%"></span></div>
      <strong>${clamp(paper.progress, 0, 100)}%</strong>
    </div>
    <p class="focus-next">下一行动 · <strong>${escapeHTML(paper.nextAction || "待设置")}</strong></p>
  `;
  els.focusDots.innerHTML = data.papers.map((_, index) => `<i class="${index === focusPosition ? "active" : ""}"></i>`).join("");
}

function renderMetrics() {
  const total = data.papers.length;
  const writing = data.papers.filter((paper) => paper.focusStage === "writing").length;
  const submission = data.papers.filter((paper) => paper.focusStage === "submission").length;
  const revision = data.papers.filter((paper) => paper.focusStage === "revision").length;
  const accepted = data.papers.filter((paper) => paper.focusStage === "accepted").length;
  const average = Math.round(data.papers.reduce((sum, paper) => sum + clamp(paper.progress, 0, 100), 0) / total);

  const metricItems = [
    ["论文总数", total, "active projects"],
    ["撰写进行中", writing, "writing"],
    ["投稿审稿中", submission, "submission"],
    ["返修进行中", revision, "revision"],
    ["组合平均进度", `${average}%`, `${accepted} accepted`]
  ];
  els.metrics.innerHTML = metricItems
    .map(([label, value, note]) => `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`)
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
  const rows = data.papers
    .map((paper) => {
      const progress = clamp(paper.progress, 0, 100);
      return `
        <div class="roadmap-row" title="${escapeHTML(paper.title)} · ${progress}%">
          <div class="roadmap-code"><i></i><span>${escapeHTML(paper.shortCode)}</span></div>
          <div class="roadmap-lane">
            <span class="roadmap-bar ${paper.focusStage === "accepted" ? "accepted" : ""}" style="width:${progress}%"></span>
            <span class="roadmap-marker" style="left:${progress}%"></span>
          </div>
          <span class="roadmap-value">${progress}%</span>
        </div>
      `;
    })
    .join("");
  els.roadmapChart.innerHTML = scale + rows;
  els.progressNote.textContent = data.meta.progressNote || "进度百分比可在管理模式中自行调整。";
}

function getFilteredPapers() {
  const query = els.searchInput.value.trim().toLocaleLowerCase();
  const stage = els.stageFilter.value;
  return data.papers.filter((paper) => {
    const haystack = [paper.title, paper.shortCode, paper.authors, paper.venueSummary, paper.nextAction, paper.notes]
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

  els.paperList.innerHTML = papers
    .map((paper) => {
      const progress = clamp(paper.progress, 0, 100);
      return `
        <article class="paper-card" tabindex="0" data-paper-id="${escapeHTML(paper.id)}" style="--paper-color:${stageColor(paper.focusStage)}">
          <div class="paper-main">
            <div class="paper-topline">
              <span class="paper-code">${escapeHTML(paper.shortCode)}</span>
              <span class="stage-badge ${paper.focusStage}">${escapeHTML(paper.stageLabel || stageNames[paper.focusStage])}</span>
            </div>
            <h3>${escapeHTML(paper.title)}</h3>
            <div class="paper-meta">
              <span>${escapeHTML(paper.authors || "作者待补充")}</span>
              <span>${escapeHTML(paper.venueSummary || "期刊信息待补充")}</span>
              <span>${durationText(paper.startedAt, paper.manualUpdatedAt || paper.updatedAt)}</span>
              <span>更新 ${formatDate(paper.manualUpdatedAt || paper.updatedAt)}</span>
            </div>
            <div class="paper-footer">
              <div class="paper-progress"><div class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></div></div>
              <span class="paper-next"><strong>下一步</strong> ${escapeHTML(paper.nextAction || "待设置")}</span>
            </div>
          </div>
          <div class="paper-side">
            <span class="paper-side-label">CURRENT THREAD</span>
            <strong>${escapeHTML(currentThread(paper))}</strong>
            <small>${progress}% · ${escapeHTML(stageNames[paper.focusStage] || "未分类")}</small>
            <button class="card-action" type="button" data-edit-id="${escapeHTML(paper.id)}">编辑进展</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function stageColor(stage) {
  return {
    writing: "#8fcbed",
    submission: "#58a9dc",
    revision: "#316f99",
    accepted: "#45a887"
  }[stage] || "#8fcbed";
}

function currentThread(paper) {
  const revision = [...(paper.revisions || [])].reverse().find((item) => item.status === "in_progress" || item.status === "returned");
  if (revision) return `${revision.journal} · ${revision.type || "返修"}${revision.round ? ` R${revision.round}` : ""}`;
  const submission = [...(paper.submissions || [])].reverse()[0];
  if (submission) return `${submission.journal} · ${submissionStatusNames[submission.status] || submission.note || "跟踪中"}`;
  return paper.stageLabel || stageNames[paper.focusStage] || "待补充";
}

function renderManageState() {
  document.body.classList.toggle("manage-mode", isManageMode);
  els.toggleManageButton.textContent = isManageMode ? "退出管理模式" : "进入管理模式";
  const viewPill = document.querySelector(".view-pill");
  if (viewPill) viewPill.lastChild.textContent = isManageMode ? "管理视图" : "阅读视图";
}

function moveFocus(delta) {
  focusPosition = (focusPosition + delta + data.papers.length) % data.papers.length;
  renderHero();
}

function openPaper(paperId, forceEdit = false) {
  const paper = data.papers.find((item) => item.id === paperId);
  if (!paper) return;
  activePaperId = paper.id;
  const editing = isManageMode || forceEdit;
  if (forceEdit && !isManageMode) {
    isManageMode = true;
    renderManageState();
  }
  els.dialogKicker.textContent = editing ? "EDIT PAPER" : `${paper.shortCode} · PAPER DETAILS`;
  els.dialogTitle.textContent = paper.title;
  els.dialogHint.textContent = editing ? "保存时自动记录当前日期；手动更新时间可覆盖显示" : "阅读视图 · 进入管理模式后可修改";
  els.savePaperButton.hidden = !editing;
  els.dialogBody.innerHTML = editing ? renderEditForm(paper) : renderPaperDetails(paper);
  els.paperDialog.showModal();
  if (forceEdit) window.setTimeout(() => els.dialogBody.querySelector("input[name='shortCode']")?.focus(), 100);
}

function renderPaperDetails(paper) {
  const writing = (paper.writing || [])
    .map((item) => `<div class="writing-step ${escapeHTML(item.status)}">${escapeHTML(item.label)}</div>`)
    .join("");
  const submissions = renderSubmissionHistory(paper.submissions || []);
  const revisions = renderRevisionHistory(paper.revisions || []);

  return `
    <section class="detail-section">
      <div class="detail-grid">
        <div class="detail-row"><span>论文简称</span><strong>${escapeHTML(paper.shortCode)}</strong></div>
        <div class="detail-row"><span>当前阶段</span><strong>${escapeHTML(paper.stageLabel || stageNames[paper.focusStage])}</strong></div>
        <div class="detail-row"><span>作者</span><strong>${escapeHTML(paper.authors || "待补充")}</strong></div>
        <div class="detail-row"><span>起始日</span><strong>${formatDate(paper.startedAt)}</strong></div>
        <div class="detail-row"><span>历时</span><strong>${durationText(paper.startedAt, paper.manualUpdatedAt || paper.updatedAt)}</strong></div>
        <div class="detail-row"><span>当前进度</span><strong>${clamp(paper.progress, 0, 100)}%</strong></div>
        <div class="detail-row"><span>手动更新时间</span><strong>${formatDate(paper.manualUpdatedAt)}</strong></div>
      </div>
    </section>
    <section class="detail-section">
      <h3>撰写阶段追踪</h3>
      <div class="writing-steps">${writing}</div>
    </section>
    <section class="detail-section">
      <h3>投稿线程</h3>
      <div class="history-list">${submissions || `<div class="empty-state">暂无投稿记录</div>`}</div>
    </section>
    <section class="detail-section">
      <h3>返修轮次</h3>
      <div class="history-list">${revisions || `<div class="empty-state">暂无返修记录</div>`}</div>
    </section>
    <section class="detail-section">
      <h3>下一行动与备注</h3>
      <div class="detail-grid">
        <div class="detail-row"><span>下一步</span><strong>${escapeHTML(paper.nextAction || "待设置")}</strong></div>
        <div class="detail-row"><span>计划日期</span><strong>${formatDate(paper.nextDue)}</strong></div>
      </div>
      ${paper.notes ? `<p class="security-note" style="margin:13px 0 0">${escapeHTML(paper.notes)}</p>` : ""}
    </section>
  `;
}

function renderSubmissionHistory(items) {
  return items
    .map((item) => {
      const dates = [item.submittedAt ? `投稿 ${formatDate(item.submittedAt)}` : "", item.decisionAt ? `决定 ${formatDate(item.decisionAt)}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `
        <div class="history-item">
          <div class="item-row-top"><strong>${escapeHTML(item.journal)}</strong><span class="submission-badge ${escapeHTML(item.status)}">${escapeHTML(submissionStatusNames[item.status] || item.status)}</span></div>
          <p>${escapeHTML(item.note || dates || "日期待补充")}${item.note && dates ? ` · ${escapeHTML(dates)}` : ""}</p>
        </div>
      `;
    })
    .join("");
}

function renderRevisionHistory(items) {
  return items
    .map((item) => {
      const dateLabel = item.returnedAt ? `交回 ${formatDate(item.returnedAt)}` : item.dueAt ? `截止 ${formatDate(item.dueAt)}` : "日期待补充";
      return `
        <div class="history-item">
          <div class="item-row-top"><strong>${escapeHTML(item.journal)} · R${escapeHTML(item.round || "—")} ${escapeHTML(item.type || "返修")}</strong><span class="submission-badge revision">${escapeHTML(revisionStatusNames[item.status] || item.status)}</span></div>
          <p>${escapeHTML(item.note || dateLabel)}${item.note ? ` · ${escapeHTML(dateLabel)}` : ""}</p>
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

function renderEditForm(paper) {
  const writingFields = (paper.writing || []).
    map((item) => `
      <label class="form-field">
        <span>${escapeHTML(item.label)}</span>
        <select data-writing-key="${escapeHTML(item.key)}">${optionsHtml(writingStatusNames, item.status)}</select>
      </label>
    `).join("");

  const submissionRows = (paper.submissions || []).map(renderSubmissionRow).join("");
  const revisionRows = (paper.revisions || []).map(renderRevisionRow).join("");

  return `
    <section class="detail-section">
      <h3>基础信息</h3>
      <div class="form-grid">
        <label class="form-field full"><span>论文标题</span><textarea name="title" required>${escapeHTML(paper.title)}</textarea></label>
        <label class="form-field full"><span>作者（用分号分隔）</span><input name="authors" value="${escapeHTML(paper.authors || "")}" /></label>
        <label class="form-field"><span>简称</span><input name="shortCode" value="${escapeHTML(paper.shortCode)}" maxlength="12" required /></label>
        <label class="form-field"><span>当前大阶段</span><select name="focusStage">${optionsHtml(stageNames, paper.focusStage)}</select></label>
        <label class="form-field"><span>阶段显示名称</span><input name="stageLabel" value="${escapeHTML(paper.stageLabel || "")}" /></label>
        <label class="form-field"><span>起始日</span><input name="startedAt" type="date" value="${escapeHTML(paper.startedAt || "")}" /></label>
        <label class="form-field full">
          <span>参考进度</span>
          <div class="progress-input-row">
            <input name="progressRange" type="range" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" />
            <input name="progress" type="number" min="0" max="100" value="${clamp(paper.progress, 0, 100)}" />
          </div>
        </label>
        <label class="form-field"><span>手动更新时间</span><input name="manualUpdatedAt" type="date" value="${escapeHTML(paper.manualUpdatedAt || "")}" /></label>
        <label class="form-field"><span>下一行动日期</span><input name="nextDue" type="date" value="${escapeHTML(paper.nextDue || "")}" /></label>
        <label class="form-field full"><span>期刊状态摘要</span><input name="venueSummary" value="${escapeHTML(paper.venueSummary || "")}" /></label>
        <label class="form-field full"><span>下一行动</span><input name="nextAction" value="${escapeHTML(paper.nextAction || "")}" /></label>
        <label class="form-field full"><span>备注</span><textarea name="notes">${escapeHTML(paper.notes || "")}</textarea></label>
      </div>
    </section>
    <section class="detail-section">
      <h3>撰写阶段追踪</h3>
      <div class="form-grid">${writingFields}</div>
    </section>
    <section class="detail-section">
      <h3>投稿线程</h3>
      <div class="editable-history" id="submissionRows">${submissionRows}</div>
      <button class="add-row-button" id="addSubmissionButton" type="button">＋ 添加投稿线程</button>
    </section>
    <section class="detail-section">
      <h3>返修轮次</h3>
      <div class="editable-history" id="revisionRows">${revisionRows}</div>
      <button class="add-row-button" id="addRevisionButton" type="button">＋ 添加返修轮次</button>
    </section>
  `;
}

function renderSubmissionRow(item = {}) {
  return `
    <div class="editable-item submission-item">
      <input data-field="journal" aria-label="期刊名称" placeholder="期刊名称" value="${escapeHTML(item.journal || "")}" />
      <select data-field="status" aria-label="投稿状态">${optionsHtml(submissionStatusNames, item.status || "preparing")}</select>
      <input data-field="submittedAt" aria-label="投稿日期" type="date" value="${escapeHTML(item.submittedAt || "")}" />
      <input data-field="decisionAt" aria-label="决定日期" type="date" value="${escapeHTML(item.decisionAt || "")}" />
      <input data-field="note" aria-label="投稿备注" placeholder="备注" value="${escapeHTML(item.note || "")}" />
      <button class="remove-item" type="button" aria-label="删除投稿记录">×</button>
    </div>
  `;
}

function renderRevisionRow(item = {}) {
  return `
    <div class="editable-item revision-item">
      <input data-field="journal" aria-label="期刊名称" placeholder="期刊名称" value="${escapeHTML(item.journal || "")}" />
      <input data-field="round" aria-label="返修轮次" type="number" min="1" max="9" placeholder="轮次" value="${escapeHTML(item.round || 1)}" />
      <input data-field="type" aria-label="返修类型" placeholder="大修/小修" value="${escapeHTML(item.type || "返修")}" />
      <select data-field="status" aria-label="返修状态">${optionsHtml(revisionStatusNames, item.status || "in_progress")}</select>
      <input data-field="startedAt" aria-label="开始日期" type="date" value="${escapeHTML(item.startedAt || "")}" />
      <input data-field="returnedAt" aria-label="交回日期" type="date" value="${escapeHTML(item.returnedAt || "")}" />
      <input data-field="dueAt" aria-label="截止日期" type="date" value="${escapeHTML(item.dueAt || "")}" />
      <input data-field="note" aria-label="返修备注" placeholder="备注" value="${escapeHTML(item.note || "")}" />
      <button class="remove-item" type="button" aria-label="删除返修记录">×</button>
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

function saveActivePaper(event) {
  event.preventDefault();
  if (!isManageMode || !activePaperId) return;
  const paper = data.papers.find((item) => item.id === activePaperId);
  if (!paper) return;
  const formData = new FormData(els.paperForm);
  paper.title = formData.get("title").trim();
  paper.authors = formData.get("authors").trim();
  paper.shortCode = formData.get("shortCode").trim().toUpperCase();
  paper.focusStage = formData.get("focusStage");
  paper.stageLabel = formData.get("stageLabel").trim() || stageNames[paper.focusStage];
  paper.startedAt = formData.get("startedAt");
  paper.progress = clamp(formData.get("progress"), 0, 100);
  paper.manualUpdatedAt = formData.get("manualUpdatedAt");
  paper.nextDue = formData.get("nextDue");
  paper.venueSummary = formData.get("venueSummary").trim();
  paper.nextAction = formData.get("nextAction").trim();
  paper.notes = formData.get("notes").trim();
  paper.updatedAt = todayISO();
  paper.writing = (paper.writing || []).map((item) => ({
    ...item,
    status: els.dialogBody.querySelector(`[data-writing-key='${item.key}']`)?.value || item.status
  }));
  paper.submissions = collectRows("#submissionRows", ["journal", "status", "submittedAt", "decisionAt", "note"]);
  paper.revisions = collectRows("#revisionRows", ["journal", "round", "type", "status", "startedAt", "returnedAt", "dueAt", "note"]);
  saveLocalDraft();
  renderAll();
  els.paperDialog.close();
  showToast("论文进展已保存到本机草稿");
}

function addEditableRow(type) {
  const target = els.dialogBody.querySelector(type === "submission" ? "#submissionRows" : "#revisionRows");
  if (!target) return;
  target.insertAdjacentHTML("beforeend", type === "submission" ? renderSubmissionRow() : renderRevisionRow());
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
    data = parsed;
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
  if (event.target.closest("#addSubmissionButton")) addEditableRow("submission");
  if (event.target.closest("#addRevisionButton")) addEditableRow("revision");
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
  els.editCodesButton.addEventListener("click", () => openPaper(data.papers[0]?.id, true));
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
  els.dialogBody.addEventListener("click", handleDialogClick);
  els.dialogBody.addEventListener("input", (event) => {
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
  [els.paperDialog, els.toolsDialog, els.publishDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  window.setInterval(() => {
    if (!els.paperDialog.open && !els.toolsDialog.open && !els.publishDialog.open) moveFocus(1);
  }, 9000);
}

bindEvents();
loadData().catch((error) => {
  console.error(error);
  els.paperList.innerHTML = `<div class="empty-state">数据暂时无法加载。请刷新页面或检查 data/papers.json。</div>`;
  showToast("论文数据加载失败");
});
