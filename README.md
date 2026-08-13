# Paperflow · Research Portfolio of SUN Huijie

> 在线访问：https://shj0512.github.io/paperflow-hub/

一个基于 GitHub Pages、原生 HTML/CSS/JavaScript 与 JSON 的个人研究项目工作台。阅读模式用于对外展示，Manage Mode 用于作者本人日常管理。

## 核心功能

- 按 Priority、Pinned、Deadline、返修与等待时间自动选择 Current Focus
- Writing、Submitted、Revision、Published 四项互斥组合概览与轻量 Pipeline Distribution；所有统计始终覆盖全部论文
- Needs Attention 按 Priority 排序，不显示 waiting days；可在 View options 中逐篇选择是否展示
- 点击组合概览数字或 Distribution 分段可展开对应论文，不再设置重复的独立 Research Pipeline 区块
- Project Card 重点显示 Next Action、Due Date、Reference Progress 与 Priority
- Quick Update 快速修改状态、生效日、Next Action、Deadline 和 Priority
- Full Edit 管理论文信息、投稿线程、完整状态时间线、Notes、Links 与 Advanced Settings
- 状态变化时自动结束上一状态并保存起止日期
- 可增减项目；在 Manage Mode 下可拖动项目保存自定义顺序
- Header 的 All Papers 在单一弹窗内列出全部论文，点击即可查看或更新，无需滚动整页
- JSON 导入导出、当前设备草稿与 GitHub 安全发布流程

## 数据字段

每篇论文支持 `focusStage`、`statusCode`、`statusStartedAt`、`statusTimeline`、`progress`、`priority`、`pinned`、`showInAttention`、`nextAction`、`nextDue`、`currentVenue`、`lastActionAt`、`startedAt`、`updatedAt`、`submissions`、`tags`、`links` 与 `notes`。旧数据中的 `venueSummary`、`nextAction`、`nextDue` 和 `notes` 会兼容迁移。

## 修改与发布

Manage Mode 中的修改先保存为当前设备草稿。正式发布时使用 Header 中的 `Publish`，复制完整 JSON 后替换仓库中的 `data/papers.json` 并提交。GitHub Actions 会自动部署 GitHub Pages。

## 本地验证

```bash
python3 -m http.server 4173
node scripts/validate.mjs
node scripts/test-status-engine.mjs
```
