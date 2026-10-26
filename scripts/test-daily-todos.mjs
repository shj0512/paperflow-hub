import assert from "node:assert/strict";
import {
  GENERAL_PROJECT_ID, isDayKey, todayDayKey, shiftDay, normalizeTodoStore,
  newTodo, todosForDate, copyUnfinishedFromPreviousDay
} from "./daily-todos.mjs";

assert.equal(isDayKey("2028-02-29"), true);
assert.equal(isDayKey("2027-02-29"), false);
assert.equal(isDayKey("2026-00-10"), false);
assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
assert.equal(todayDayKey(new Date(2026, 9, 26, 12)), "2026-10-26");

const previous = "2026-10-25";
const target = "2026-10-26";
const a = newTodo({ date: previous, text: "  清理数据  ", projectId: "project-a", projectName: "Project A" });
const b = newTodo({ date: previous, text: "写好摘要", projectId: "project-b", projectName: "Project B" });
const c = { ...newTodo({ date: previous, text: "已完成事项", projectId: "project-a", projectName: "Project A" }), completed: true };
const existing = newTodo({ date: target, text: "清理数据", projectId: "project-a", projectName: "Project A" });
const general = newTodo({ date: target, text: "查看邮件", projectId: GENERAL_PROJECT_ID, projectName: "日常 / 其他" });
const items = [a, b, c, existing, general];
assert.equal(a.text, "清理数据");
const copies = copyUnfinishedFromPreviousDay(items, target);
assert.equal(copies.length, 1, "Already planned and completed tasks should not be copied");
assert.equal(copies[0].text, "写好摘要");
assert.equal(copies[0].projectId, "project-b");
assert.equal(copies[0].date, target);
assert.equal(copyUnfinishedFromPreviousDay([...items, ...copies], target).length, 0, "Carry forward is idempotent");

const ordered = todosForDate([...items, ...copies], target);
assert.equal(ordered.length, 3);
assert.ok(ordered.every(item => item.date === target));
const restored = normalizeTodoStore({ version: 1, items: ordered });
assert.deepEqual(restored.items, ordered);
assert.throws(() => normalizeTodoStore({ version: 1, items: [ordered[0], ordered[0]] }), /重复/);
assert.throws(() => normalizeTodoStore({ version: 2, items: [] }), /有效/);
assert.throws(() => normalizeTodoStore({ version: 1, items: [{ ...a, text: "" }] }), /无效/);
console.log("Daily To-do model tests passed: dates, validation, ordering and idempotent carry-forward.");
