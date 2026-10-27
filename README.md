# Paperflow · Research Portfolio of SUN Huijie

> 在线访问：https://shj0512.github.io/paperflow-hub/

一个基于 GitHub Pages、原生 HTML/CSS/JavaScript 与 JSON 的个人研究项目工作台。阅读模式用于对外展示，Manage Mode 用于作者本人日常管理。

## 核心功能

- 按 Priority、Pinned、Deadline、返修与等待时间自动选择 Current Focus
- Writing、Submitted、Revision、Published 四项互斥组合概览与轻量 Pipeline Distribution；所有统计始终覆盖全部论文
- Needs Attention 按 Priority 排序，不显示 waiting days；可在统一项目面板的 Advanced Settings 中逐篇选择是否展示；Data 提供批量显示设置
- Needs Attention 下的 Daily To-do 独立支持每日多个 Project 的任务清单：日期切换、快速添加、Project 筛选、完成进度、双击或点击编辑、移到后一天、复制前一天未完成项
- Daily To-do 自动保存在当前浏览器的 `paperflow-daily-todos-v1`，与公开的论文数据、Manage Mode 草稿和 Publish 流程相互独立；面板底部可导出、导入待办 JSON 备份。在其他设备或浏览器使用时需手动导入备份
- 点击组合概览数字或 Distribution 分段可展开对应论文，不再设置重复的独立 Research Pipeline 区块
- Project Card 重点显示 Next Action、Due Date、Reference Progress 与 Priority
- 点击卡片、标题或其他区域的项目入口，打开同一个详情/管理 Drawer；常用字段直接编辑，资料、历史、投稿线程与 Advanced Settings 折叠展示
- 在一个流程中切换 Current Stage / Current Status，编辑 Next Action、Deadline、Priority、Current Venue 和 Reference Progress
- 状态行动规则覆盖全部 15 个可选状态：空内容或此前自动填入的内容随状态更新；手动内容保持不变，使用“应用推荐”后仍可修改
- 状态变化时自动结束上一状态并保存起止日期
- Projects 的五种排序独立于 Current Focus / Needs Attention：Priority 按 High → Medium → Low；Deadline 日期升序且无日期最后；Last Updated / Start Date 降序；同值均按保存的 Custom Order
- 可增减项目；在 Manage Mode 的 Custom Order 下拖动项目保存顺序，↑ ↓ 按钮同时支持触屏和键盘；卡片可直接修改 Priority
- Header 的 All Papers 在单一弹窗内列出全部论文，点击即可查看或更新，无需滚动整页
- 独立 Other Projects 展示共同参与但非主导的项目，不计入 Portfolio Overview、Pipeline Distribution 或 Needs Attention
- 独立 Publications / 已发表成果：把已发表的 3 篇主导论文与 2 篇合作论文按年份统一归档，提供正式引用信息、DOI / 期刊链接、角色筛选和复制引用；日常 Projects 及 Daily To-do 不再混入已归档论文
- 新增 Research Milestones：在项目详情中记录项目启动、数据处理、初稿形成及后续迭代等独立时间节点，带“文件记录 / 日期待确认 / 已确认”标签，可在 Manage Mode 编辑
- JSON 导入导出、当前设备草稿与 GitHub 安全发布流程

## 数据字段

主组合论文保存在 `papers`，共同参与项目单独保存在 `otherProjects`。每篇主组合论文支持 `focusStage`、`statusCode`、`statusStartedAt`、`statusTimeline`、`progress`、`priority`、`pinned`、`showInAttention`、`nextAction`、`nextDue`、`currentVenue`、`lastActionAt`、`startedAt`、`updatedAt`、`submissions`、`tags`、`links` 与 `notes`。

已发表论文可以使用 `archived` 和 `publication`（`year`、`citation`、`doi`、`url`）保存可核实的书目信息。方法研究项目可以用 `milestones` 保存独立于状态切换的研究过程，并用 `startDateEstimated` 标记尚未确认的项目启动日。

2026-10-27 更新：删除 MIC2025，新增暂名“曲线中介效应研究”的项目。其时间线来自用户提供的文件列表截图：2026-09-12 是最早可见文件夹命名日期，数据 / Monte Carlo 文件出现在 9 月中下旬，9 月 24 日有可见初稿文件。**这些日期是文件证据或暂定线索，不等同于正式立项日、数据处理完成日或初稿首次完成日。**

数据版本升级至 v7 时，会先把旧版浏览器草稿备份到 `paperflow-draft-pre-20261027-backup`，再保留既有研究进度、移除 MIC2025、补充新的曲线中介项目及正式出版信息，避免旧草稿把已移除项目重新带回页面。

## 修改与发布

Manage Mode 中的修改先保存为当前设备草稿。正式发布时使用 Header 中的 `Publish`，复制完整 JSON 后替换仓库中的 `data/papers.json` 并提交。GitHub Actions 会自动部署 GitHub Pages。

## 本地验证

```bash
python3 -m http.server 4173
node scripts/validate.mjs
node scripts/test-status-engine.mjs
node scripts/test-project-order.mjs
node scripts/test-action-rules.mjs
node scripts/test-daily-todos.mjs
```

真实浏览器回归可单独运行，Playwright 仅用于测试，不是网站运行依赖：

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/test-ui.mjs
```

测试自带临时 HTTP 服务，以真实 JSON 做只读加载检查，然后使用内存测试数据验证排序、拖拽、草稿重载、跨阶段编辑、行动推荐、手动内容保护、历史、增删、导入导出及 Publish 准备步骤。覆盖 1440px 桌面、768px 平板、390px/320px 手机布局及键盘操作；不会提交论文数据或点击 GitHub 发布。CI 将截图保存为 `paperflow-browser-evidence`。

状态日期保存前检查真实日期、历史先后顺序与重叠、项目起始日和未来生效日期。允许历史间隔及同日转换；相同状态重复保存不会新增记录。清空 Next Action / Deadline 后重载不会从发布版本重新补回。
