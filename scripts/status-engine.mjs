function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateStatusDates({ timeline = [], currentStartedAt, projectStartedAt, today }) {
  if (!validDate(currentStartedAt)) throw new Error("请填写有效的状态开始日");
  if (projectStartedAt && (!validDate(projectStartedAt) || currentStartedAt < projectStartedAt)) throw new Error("状态开始日不能早于项目起始日");
  if (today && currentStartedAt > today) throw new Error("状态生效日期不能晚于今天；计划日期请填写在 Deadline");
  let previousEnd = projectStartedAt || "";
  for (const item of timeline) {
    if (!validDate(item.startedAt) || !validDate(item.endedAt)) throw new Error("历史记录需填写有效的开始日和结束日，请修正或明确删除该记录");
    if (item.startedAt > item.endedAt || item.startedAt < previousEnd || item.endedAt > currentStartedAt) throw new Error("时间线日期必须按顺序排列，且不能重叠或晚于当前状态开始日");
    previousEnd = item.endedAt;
  }
}

export function buildStatusTransition({
  timeline = [],
  previousStage,
  previousStatus,
  previousStartedAt,
  nextStage,
  nextStatus,
  effectiveAt,
  previousLabel,
  projectStartedAt,
  today,
  archivePrevious = true
}) {
  const changed = previousStage !== nextStage || previousStatus !== nextStatus;
  const currentStartedAt = effectiveAt || previousStartedAt;
  if (changed && archivePrevious && (!validDate(previousStartedAt) || currentStartedAt < previousStartedAt)) {
    throw new Error("新状态开始日不能早于当前状态开始日");
  }
  const nextTimeline = [...timeline];
  if (changed && archivePrevious) {
    nextTimeline.push({
        id: `timeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        stage: previousStage,
        status: previousStatus,
        label: previousLabel,
        startedAt: previousStartedAt,
        endedAt: currentStartedAt
      });
  }
  validateStatusDates({ timeline: nextTimeline, currentStartedAt, projectStartedAt, today });
  return { changed, currentStartedAt, timeline: nextTimeline };
}
