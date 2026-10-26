export const TODO_STORAGE_KEY = "paperflow-daily-todos-v1";
export const GENERAL_PROJECT_ID = "__general__";

export function isDayKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftDay(date, offset) {
  if (!isDayKey(date) || !Number.isInteger(offset)) throw new Error("日期无效");
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function normalizeTodoStore(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items) || value.items.length > 10000) {
    throw new Error("不是有效的 Paperflow 待办备份");
  }
  const seen = new Set();
  const items = value.items.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id) ||
        !isDayKey(item.date) || typeof item.text !== "string" || !item.text.trim() || item.text.trim().length > 240 ||
        typeof item.projectId !== "string" || !item.projectId ||
        typeof item.projectName !== "string" || item.projectName.length > 160 ||
        typeof item.completed !== "boolean") {
      throw new Error("待办备份包含无效或重复的数据");
    }
    seen.add(item.id);
    return {
      id: item.id,
      date: item.date,
      projectId: item.projectId,
      projectName: item.projectName,
      text: item.text.trim(),
      completed: item.completed,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : ""
    };
  });
  return { version: 1, items };
}

export function newTodo({ date, text, projectId, projectName }, now = new Date()) {
  const trimmed = String(text || "").trim();
  if (!isDayKey(date) || !trimmed || trimmed.length > 240 || !projectId) throw new Error("请填写有效的待办内容与日期");
  const id = globalThis.crypto?.randomUUID?.() || `todo-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = now.toISOString();
  return { id, date, text: trimmed, projectId, projectName: String(projectName || ""), completed: false, createdAt: timestamp, updatedAt: timestamp };
}

export function todosForDate(items, date) {
  return items.filter(item => item.date === date).sort((a, b) =>
    Number(a.completed) - Number(b.completed) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function copyUnfinishedFromPreviousDay(items, date, now = new Date()) {
  const previous = shiftDay(date, -1);
  const existing = new Set(items.filter(item => item.date === date).map(item => `${item.projectId}\u0000${item.text.toLocaleLowerCase()}`));
  const additions = [];
  for (const item of items.filter(task => task.date === previous && !task.completed)) {
    const key = `${item.projectId}\u0000${item.text.toLocaleLowerCase()}`;
    if (existing.has(key)) continue;
    additions.push(newTodo({ date, text: item.text, projectId: item.projectId, projectName: item.projectName }, now));
    existing.add(key);
  }
  return additions;
}
