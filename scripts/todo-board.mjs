import {
  TODO_STORAGE_KEY, GENERAL_PROJECT_ID, isDayKey, todayDayKey, shiftDay,
  normalizeTodoStore, newTodo, todosForDate, copyUnfinishedFromPreviousDay
} from "./daily-todos.mjs";

const LAST_PROJECT_KEY = "paperflow-todo-last-project-v1";
const GENERAL_LABEL = "日常 / 其他";

function escapeHTML(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function dayCaption(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function downloadBackup(store, date) {
  const blob = new Blob([JSON.stringify(store, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paperflow-todos-${date}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initTodoBoard({ root, getPortfolio, notify }) {
  if (!root) throw new Error("找不到 Daily To-do 面板");

  const ui = {
    date: root.querySelector("#todoDateInput"),
    caption: root.querySelector("#todoDateCaption"),
    today: root.querySelector("#todoTodayButton"),
    carry: root.querySelector("#todoCarryButton"),
    addForm: root.querySelector("#todoAddForm"),
    taskInput: root.querySelector("#todoTaskInput"),
    projectSelect: root.querySelector("#todoProjectSelect"),
    filters: root.querySelector("#todoFilters"),
    hideCompleted: root.querySelector("#todoHideCompleted"),
    content: root.querySelector("#todoContent"),
    progressText: root.querySelector("#todoProgressText"),
    progressTrack: root.querySelector("#todoProgressTrack"),
    progressFill: root.querySelector("#todoProgressFill"),
    exportButton: root.querySelector("#todoExportButton"),
    importInput: root.querySelector("#todoImportInput")
  };

  let store = { version: 1, items: [] };
  try {
    const saved = localStorage.getItem(TODO_STORAGE_KEY);
    if (saved) store = normalizeTodoStore(JSON.parse(saved));
  } catch (error) {
    console.warn("Could not load local to-dos", error);
    notify("无法读取本机待办；请先导出或检查浏览器存储设置");
  }

  let date = todayDayKey();
  let activeFilter = "all";
  let hideCompleted = false;
  let editingId = null;
  let addProjectId = GENERAL_PROJECT_ID;
  let optionSignature = "";
  try { addProjectId = localStorage.getItem(LAST_PROJECT_KEY) || ""; } catch { addProjectId = ""; }

  function save() {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn("Could not save local to-dos", error);
      notify("待办仅在本次页面中可用：浏览器存储空间不足或已禁用");
      return false;
    }
  }

  function catalog() {
    const portfolio = getPortfolio() || {};
    const seen = new Set();
    const collect = (projects, kind) => (Array.isArray(projects) ? projects : []).flatMap(project => {
      if (!project?.id || seen.has(project.id)) return [];
      seen.add(project.id);
      return [{ id: String(project.id), label: String(project.shortCode || project.title || project.id), kind }];
    });
    const activePapers = (portfolio.papers || []).filter(project => project.archived !== true &&
      !(project.focusStage === "publication" && ["published", "archived"].includes(project.statusCode)));
    const activeCollaborations = (portfolio.otherProjects || []).filter(project => project.status !== "published");
    // Archived papers keep their historical to-dos, but no longer appear when planning new work.
    return [...collect(activePapers, "paper"), ...collect(activeCollaborations, "other")];
  }

  function projectInfo(projectId, task, known) {
    if (projectId === GENERAL_PROJECT_ID) return { id: projectId, label: GENERAL_LABEL, kind: "general" };
    return known.find(project => project.id === projectId) ||
      { id: projectId, label: task?.projectName || "已移除的 Project", kind: "removed" };
  }

  function renderProjectOptions(known) {
    const signature = JSON.stringify(known);
    if (signature === optionSignature) return;
    const paperOptions = known.filter(project => project.kind === "paper").map(project =>
      `<option value="${escapeHTML(project.id)}">${escapeHTML(project.label)}</option>`).join("");
    const otherOptions = known.filter(project => project.kind === "other").map(project =>
      `<option value="${escapeHTML(project.id)}">${escapeHTML(project.label)}</option>`).join("");
    ui.projectSelect.innerHTML = `${paperOptions ? `<optgroup label="论文项目">${paperOptions}</optgroup>` : ""}
      ${otherOptions ? `<optgroup label="其他项目">${otherOptions}</optgroup>` : ""}
      <option value="${GENERAL_PROJECT_ID}">${GENERAL_LABEL}</option>`;
    if (!known.some(project => project.id === addProjectId) && addProjectId !== GENERAL_PROJECT_ID) {
      addProjectId = known[0]?.id || GENERAL_PROJECT_ID;
    }
    ui.projectSelect.value = addProjectId;
    optionSignature = signature;
  }

  function countCarryable(dayTasks) {
    const existing = new Set(dayTasks.map(task => `${task.projectId}\u0000${task.text.toLocaleLowerCase()}`));
    let count = 0;
    for (const task of store.items.filter(item => item.date === shiftDay(date, -1) && !item.completed)) {
      const key = `${task.projectId}\u0000${task.text.toLocaleLowerCase()}`;
      if (existing.has(key)) continue;
      existing.add(key);
      count++;
    }
    return count;
  }

  function taskMarkup(task) {
    const id = escapeHTML(task.id);
    const title = escapeHTML(task.text);
    const editor = editingId === task.id;
    return `<li class="todo-item${task.completed ? " is-done" : ""}" data-todo-row="${id}">
      <button class="todo-check" type="button" data-todo-toggle="${id}" aria-label="${task.completed ? "标记未完成" : "标记完成"}：${title}" aria-pressed="${task.completed}">${task.completed ? "✓" : ""}</button>
      <div class="todo-item-body">${editor
        ? `<form class="todo-edit-form" data-todo-edit-form="${id}"><input name="text" value="${title}" maxlength="240" required aria-label="编辑待办内容" /><button type="submit">保存</button><button type="button" data-todo-cancel="${id}">取消</button></form>`
        : `<p class="todo-item-text" data-todo-text="${id}" title="双击可编辑">${title}</p>`}</div>
      ${editor ? "" : `<div class="todo-item-actions">
        <button class="todo-row-action" data-todo-edit="${id}" type="button" title="编辑任务" aria-label="编辑：${title}">✎</button>
        <button class="todo-row-action" data-todo-move="${id}" type="button" title="移到后一天" aria-label="移到后一天：${title}">↗</button>
        <button class="todo-row-action is-danger" data-todo-delete="${id}" type="button" title="删除任务" aria-label="删除：${title}">×</button>
      </div>`}
    </li>`;
  }

  function groupMarkup(projectId, tasks, known, allTasks) {
    const info = projectInfo(projectId, tasks[0], known);
    const count = allTasks.filter(task => task.completed).length;
    const symbol = projectId === GENERAL_PROJECT_ID ? "✦" : info.label.slice(0, 2).toUpperCase();
    const kind = { paper: "论文项目", other: "共同参与项目", general: "非项目任务", removed: "历史项目" }[info.kind];
    return `<section class="todo-group" aria-label="${escapeHTML(info.label)} 待办">
      <div class="todo-group-head"><span class="todo-project-mark${info.kind === "general" ? " is-general" : ""}" aria-hidden="true">${escapeHTML(symbol)}</span>
      <div class="todo-group-title"><strong title="${escapeHTML(info.label)}">${escapeHTML(info.label)}</strong><small>${kind}</small></div>
      <span class="todo-group-count">${count}/${allTasks.length}</span></div>
      <ul class="todo-items">${tasks.map(taskMarkup).join("")}</ul>
    </section>`;
  }

  function render() {
    const known = catalog();
    renderProjectOptions(known);
    const dayTasks = todosForDate(store.items, date);
    const complete = dayTasks.filter(task => task.completed).length;
    const percent = dayTasks.length ? Math.round(100 * complete / dayTasks.length) : 0;
    ui.date.value = date;
    ui.caption.textContent = dayCaption(date);
    ui.today.classList.toggle("is-current", date === todayDayKey());
    ui.today.setAttribute("aria-pressed", String(date === todayDayKey()));
    ui.progressText.innerHTML = `${complete} / ${dayTasks.length} <span>完成</span>`;
    ui.progressFill.style.width = `${percent}%`;
    ui.progressTrack.setAttribute("aria-valuenow", String(percent));
    const carryCount = countCarryable(dayTasks);
    ui.carry.disabled = carryCount === 0;
    ui.carry.textContent = `↪ 延续前一天未完成${carryCount ? ` (${carryCount})` : ""}`;

    const groupMap = new Map();
    for (const task of dayTasks) {
      if (!groupMap.has(task.projectId)) groupMap.set(task.projectId, []);
      groupMap.get(task.projectId).push(task);
    }
    const groups = [...groupMap.entries()].sort(([idA], [idB]) => {
      const order = id => id === GENERAL_PROJECT_ID ? known.length : Math.max(0, known.findIndex(project => project.id === id));
      return order(idA) - order(idB);
    });
    if (activeFilter !== "all" && !groupMap.has(activeFilter)) activeFilter = "all";
    ui.filters.innerHTML = `<button class="todo-filter" type="button" data-todo-filter="all" aria-pressed="${activeFilter === "all"}"><span>全部项目</span><b>${dayTasks.length}</b></button>` +
      groups.map(([id, tasks]) => `<button class="todo-filter" type="button" data-todo-filter="${escapeHTML(id)}" aria-pressed="${activeFilter === id}"><span title="${escapeHTML(projectInfo(id, tasks[0], known).label)}">${escapeHTML(projectInfo(id, tasks[0], known).label)}</span><b>${tasks.length}</b></button>`).join("");
    ui.hideCompleted.checked = hideCompleted;

    const selectedGroups = groups.filter(([id]) => activeFilter === "all" || activeFilter === id)
      .map(([id, tasks]) => [id, hideCompleted ? tasks.filter(task => !task.completed) : tasks, tasks])
      .filter(([, tasks]) => tasks.length);
    if (selectedGroups.length) {
      ui.content.innerHTML = `<div class="todo-group-grid">${selectedGroups.map(([id, tasks, allTasks]) => groupMarkup(id, tasks, known, allTasks)).join("")}</div>`;
    } else {
      const relevantTasks = dayTasks.filter(task => activeFilter === "all" || task.projectId === activeFilter);
      const allDone = relevantTasks.length && relevantTasks.every(task => task.completed);
      const title = allDone ? "今天的事项都完成啦" : hideCompleted && dayTasks.length ? "没有未完成的任务" : "从一件小事开始";
      const description = allDone ? "很棒！你可以查看已完成项，或继续添加新的计划。" :
        hideCompleted && dayTasks.length ? "取消「隐藏已完成」可回看记录。" : "在上方输入任务、选择 Project，按 Enter 就能添加。";
      ui.content.innerHTML = `<div class="todo-empty"><span class="todo-empty-icon" aria-hidden="true">${allDone ? "✓" : "✧"}</span><strong>${title}</strong><p>${description}</p></div>`;
    }
  }

  function beginEdit(id) {
    editingId = id;
    render();
    const input = [...ui.content.querySelectorAll("[data-todo-edit-form] input")]
      .find(node => node.closest("[data-todo-edit-form]")?.dataset.todoEditForm === id);
    input?.focus();
    input?.select();
  }

  function switchDate(next) {
    if (!isDayKey(next)) return notify("请选择有效日期");
    date = next;
    editingId = null;
    render();
  }

  ui.addForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = ui.taskInput.value.trim();
    if (!text) return ui.taskInput.focus();
    const info = projectInfo(addProjectId, null, catalog());
    try { store.items.push(newTodo({ date, text, projectId: addProjectId, projectName: info.label })); }
    catch (error) { return notify(error.message); }
    save();
    ui.taskInput.value = "";
    render();
    ui.taskInput.focus();
  });

  ui.projectSelect.addEventListener("change", () => {
    addProjectId = ui.projectSelect.value;
    try { localStorage.setItem(LAST_PROJECT_KEY, addProjectId); } catch { /* Personal preference only. */ }
  });
  ui.date.addEventListener("change", () => switchDate(ui.date.value));
  ui.hideCompleted.addEventListener("change", () => { hideCompleted = ui.hideCompleted.checked; render(); });
  ui.today.addEventListener("click", () => switchDate(todayDayKey()));
  ui.carry.addEventListener("click", () => {
    const additions = copyUnfinishedFromPreviousDay(store.items, date);
    if (!additions.length) return notify("前一天没有需要延续的新任务");
    store.items.push(...additions);
    save();
    hideCompleted = false;
    render();
    notify(`已将 ${additions.length} 条未完成任务延续到 ${dayCaption(date)}`);
  });
  ui.exportButton.addEventListener("click", () => { downloadBackup(store, date); notify("待办备份已开始下载"); });
  ui.importInput.addEventListener("change", async () => {
    const file = ui.importInput.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeTodoStore(JSON.parse(await file.text()));
      if (store.items.length && !window.confirm(`导入将替换此浏览器中的 ${store.items.length} 条待办，是否继续？`)) return;
      store = imported;
      editingId = null;
      activeFilter = "all";
      save();
      render();
      notify(`已恢复 ${store.items.length} 条待办`);
    } catch (error) { notify(`导入失败：${error.message}`); }
    finally { ui.importInput.value = ""; }
  });

  root.addEventListener("click", event => {
    const shift = event.target.closest("[data-todo-shift]");
    if (shift) return switchDate(shiftDay(date, Number(shift.dataset.todoShift)));
    const filter = event.target.closest("[data-todo-filter]");
    if (filter) { activeFilter = filter.dataset.todoFilter; return render(); }
    const toggle = event.target.closest("[data-todo-toggle]");
    if (toggle) {
      const task = store.items.find(item => item.id === toggle.dataset.todoToggle);
      if (!task) return;
      task.completed = !task.completed;
      task.updatedAt = new Date().toISOString();
      save();
      return render();
    }
    const edit = event.target.closest("[data-todo-edit]");
    if (edit) return beginEdit(edit.dataset.todoEdit);
    if (event.target.closest("[data-todo-cancel]")) { editingId = null; return render(); }
    const move = event.target.closest("[data-todo-move]");
    if (move) {
      const task = store.items.find(item => item.id === move.dataset.todoMove);
      if (!task) return;
      const next = shiftDay(task.date, 1);
      if (store.items.some(item => item.date === next && item.projectId === task.projectId && item.text.toLocaleLowerCase() === task.text.toLocaleLowerCase())) {
        return notify("后一天已有同名待办，请先检查以免重复");
      }
      task.date = next;
      task.completed = false;
      task.updatedAt = new Date().toISOString();
      save();
      render();
      return notify(`已移到 ${dayCaption(next)}`);
    }
    const deletion = event.target.closest("[data-todo-delete]");
    if (deletion) {
      const task = store.items.find(item => item.id === deletion.dataset.todoDelete);
      if (!task || !window.confirm(`删除待办「${task.text}」？`)) return;
      store.items = store.items.filter(item => item.id !== task.id);
      save();
      render();
      notify("已删除待办");
    }
  });

  ui.content.addEventListener("submit", event => {
    const form = event.target.closest("[data-todo-edit-form]");
    if (!form) return;
    event.preventDefault();
    const task = store.items.find(item => item.id === form.dataset.todoEditForm);
    const text = form.elements.text.value.trim();
    if (!task || !text) return;
    task.text = text;
    task.updatedAt = new Date().toISOString();
    editingId = null;
    save();
    render();
  });
  ui.content.addEventListener("keydown", event => {
    if (event.key === "Escape" && event.target.closest("[data-todo-edit-form]")) {
      editingId = null;
      render();
    }
  });
  ui.content.addEventListener("dblclick", event => {
    const target = event.target.closest("[data-todo-text]");
    if (target) beginEdit(target.dataset.todoText);
  });

  render();
  return { render };
}
