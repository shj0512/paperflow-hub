export function buildStatusTransition({
  timeline = [],
  previousStage,
  previousStatus,
  previousStartedAt,
  nextStage,
  nextStatus,
  effectiveAt,
  previousLabel
}) {
  const changed = previousStage !== nextStage || previousStatus !== nextStatus;
  if (!changed) {
    return { changed: false, timeline: [...timeline], currentStartedAt: effectiveAt || previousStartedAt };
  }

  return {
    changed: true,
    currentStartedAt: effectiveAt,
    timeline: [
      ...timeline,
      {
        id: `timeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        stage: previousStage,
        status: previousStatus,
        label: previousLabel,
        startedAt: previousStartedAt,
        endedAt: effectiveAt
      }
    ]
  };
}
