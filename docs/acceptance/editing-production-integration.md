# 编辑库生产接入 · 隔离候选验收

本批保留正式版本号 0.1.15，候选只在 `.cache/editing-production-package`。默认启动仍使用 v4 旧分支；**不要用默认入口打开 v5 预览库**。新快照 PDF 导出尚未接入，不发布替换包。本页与 Task2 report 的实测结果一并使用，未完成的门禁不算通过。

## 启动

双击仓库根目录 `编辑接入验收.cmd`。它固定选择本候选、`--editing-preview` 和绝对隔离目录 `.cache/editing-production-userdata`，没有默认个人目录回落。

预览在 mkdir/开库前解析路径及已有祖先的 realpath。允许本工作树上述隔离目录及其子目录，或系统临时目录内 `enlumor-*` 合成测试目录；拒绝缺失/相对目录、个人 Enlumor userData、正式目录、旧 `.cache/v051-wave-a-package` 与指向这些位置的 junction。默认无预览开关的 v4 行为未改。

## 实际能力

- 高亮、下划线、删除线、原文便签、自由便签、直线、箭头、画笔走 `executeUserEdit`；跨页选区一次批量，最多64个操作，超限明确报错。
- 颜色、便签内容、整对象删除、整笔擦除、显隐、固定、便签偏移、整条线/箭头/画笔路径坐标、更换原文锚点使用同一持久命令和具体 operationId 历史。文字几何不可任意拖移，没有局部切笔。
- renderer 不决定 actor/revision、不提供文件路径/SQL/确认 token；主进程颁发会话，强核验源 PDF，切文档即 abort。滚动仅准备当前及邻页，不重建会话。
- “已保存”只在真实 COMMIT 回执后出现；错误/冲突/取消保留草稿。重试保留 requestId，结果未知只查持久回执，不擅自新建请求。可明确放弃草稿，既有标识不删除。
- 未固定仍持久保存；隐藏只影响可见绘制，不删除存储或来源。显示模型保留人工/AI来源、原生四顶点和独立便签偏移；本轮无 AI 执行入口。
- 旧批注原行不双写。按页核验通过才转换，沿用 ID、保留来源及 retained=true；失败继续可见只读。重新定位先展示旧/新原文、页码、四顶点，再明确确认，留独立兼容审计，不冒充普通可撤销操作。
- PDF 内嵌批注由 PDF.js 只读显示，不写进应用历史。原 PDF 始终不变。
- 有新编辑状态（包括转换、修改、删除墓碑）时，旧导出返回 `EDITING_EXPORT_UNAVAILABLE` / “新标识导出尚未接入”；未转换旧文档的原导出仍可用。`export_marked_pdf` 仍为 `UNSUPPORTED`。

## 验证路线

所有新证据设置 `ENLUMOR_EVIDENCE_DIR=evidence/editing-production-integration`，文件名以 `TASK2-` 开头；历史脏截图不清理、不覆盖。

1. `npx vitest run tests/editing-bridge.test.ts tests/editing-view.test.ts`：能力、隔离路径、伪造身份/会话、取消与迟到回执、来源/隐藏/四顶点投影。
2. `npx playwright test tests/e2e/editing-workflow.spec.ts --workers=1`：真实界面与实际 SQL 联合断言七类工具、来源锚点/便签偏移、正常关闭及 kill、重试/回执、兼容转换/重锚、跨页历史、导出边界、原 PDF 哈希。
3. `npm test`、`npm run test:python`、`npm run build`，再 `npm run build:worker`、`npx electron-builder --win dir --config.directories.output=.cache/editing-production-package`。
4. 设置 `ENLUMOR_TEST_APP` 为该候选绝对路径，再 `npx playwright test --workers=1`。默认与显式 preview 路线分别保留，默认通过不代替新分支验收。
5. 串行运行 `node scripts/benchmark.mjs TASK2-editing-text .cache/editing-production-package/win-unpacked/Enlumor.exe --editing-preview --thumbnails` 与 `node scripts/benchmark.mjs TASK2-editing-scan .cache/editing-production-package/win-unpacked/Enlumor.exe --editing-preview --scanned --thumbnails`。所有 Electron/portable 启动点都传开关和绝对临时 profile。

200页/约32MiB/1000标识通过真实新命令（每批≤64）生成：文本按真实原文准备锚点，扫描使用合法自由几何。原 `assertPerformance` 不改：portable三次中位≤1500ms，frame p95≤34ms，readingSave p95≤20ms，canvas≤30、thumbnail≤8。额外独立报告首次锚点、兼容准备、编辑提交 p50/p95、取消响应，不挪用 readingSave 20ms 预算。dense 保留30/300/1000×256点原全部断言，包括整笔擦除/Undo≤1000ms及 mutation longtask≤50ms。

## 回退与边界

先关闭所有 SQLite/Electron 连接，留存迁移候选及 WAL/SHM，再把迁移前完整备份复制到**另一个临时 profile**并用默认 v4 入口验证旧批注与阅读位置。不要把备份覆盖到打开连接，不做 schema 降级；原备份/PDF保留，活候选保持 v5。整体回退脚本/快照由 controller 保管。

真实 DeepSeek/Cruise 模型语义未进行用户实际操作验收；本轮仅本地合成协议夹具回归。独立 Review 由 controller 后续派发，本页不是独立 Review 结论。
