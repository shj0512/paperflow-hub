// Keep recommendations separate from UI and dates. Never invent a deadline.
export const actionRules = Object.freeze({
  writing: Object.freeze({
    research_question: "明确研究问题，完善研究设计",
    data_processing: "完成数据清理与分析",
    manuscript_writing: "完善论文初稿",
    formatting: "检查目标期刊格式与投稿材料"
  }),
  submission: Object.freeze({
    under_review: "跟踪审稿进度，等待审稿结果",
    revision_1: "根据审稿意见修改论文并准备回复信",
    revision_2: "根据第二轮审稿意见修改论文并准备回复信",
    revision_3: "根据第三轮审稿意见修改论文并准备回复信",
    revision_resubmitted: "等待返修后的编辑决定",
    decision_pending: "跟进编辑决定",
    rejected: "评估审稿意见并准备重新投稿"
  }),
  publication: Object.freeze({
    forthcoming: "跟踪校样和出版流程",
    online_first: "更新在线发表信息及 DOI",
    published: "更新科研成果记录并归档",
    archived: "维护归档资料与成果记录"
  })
});

export function recommendNextAction(stage, status) {
  return actionRules[stage]?.[status] || "";
}

// previousAuto is an optional exact-text marker; legacy actions stay manual.
export function resolveActionRecommendation({ value = "", previousAuto = "", stage, status }) {
  const recommendation = recommendNextAction(stage, status);
  const applied = Boolean(recommendation && (!value.trim() || (previousAuto && value === previousAuto)));
  return { recommendation, applied, value: applied ? recommendation : value, autoValue: applied ? recommendation : "" };
}
