# Enlumor Document Command Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 沿用用户选择的子代理方式，单一实施者，逐项Review；两项完成后整轮Review。步骤使用checkbox跟踪。

**Goal:** 先交付能操作真实PDF、具有严格输入校验和取消语义的基础阅读指令库，而不是空工具目录或新的聊天界面。
**Architecture:** 在现有有限reading-commands基础上增加类型化异步入口，适配已有PdfReader方法；人工入口与未来模型入口调用同一业务能力。模型输入是结构化数据，不执行代码；当前不接模型请求。
**Tech Stack:** 现有TypeScript/Electron/React/PDF.js/Vitest/Playwright，锁定依赖不变。
**Spec:** docs/superpowers/specs/2026-10-19-reading-command-foundation-design.md。本计划只实施基础读取/导航子集；全文模型上下文、标识写入/编辑及新Cruise后续另拆两项，不称当前已完成全部操作能力。

## Global Constraints
- 工作目录D:/codex project/Enlumor/.worktrees/v04-wave-ab；保留正式0.1.15、个人数据库与原PDF，不推GitHub、不发布。
- 不重构PDF渲染/批注/存储底座，不新增依赖、IPC万能入口、插件注册、通用Agent总线或数据库表。
- 本轮不改高亮算法，不做画笔与文字行识别融合、OCR、浮动标签UI、白板、Surfing或前端重写。
- 初始可执行命令仅read_page、go_to_page、show_evidence、clear_focus、pause；完整能力矩阵如实列出未实现项，不注册空壳成功命令。
- sourceOfTruth仍是文档指纹、真实原文和原生页面坐标；模型/调用者不能随意传入坐标冒充证据。
- 现有executeReadingCommand及旧Cruise调用保持兼容；旧逐块流程保留为历史实现，不宣称已重建Cruise。
- 全部验证离线；不读取凭据、不调用真实模型。每项RED→GREEN、独立提交；测试结果与预计结果分开记录。
- 原性能门禁不放宽：200页约32MiB/1000批注，启动中位≤1500ms、滚动帧p95≤34ms、保存p95≤20ms、正文canvas≤30/缩略图≤8；密集画笔沿用既有阈值。

## Review Focus
1. doc/fingerprint或宿主版本变化后，旧异步读页/定位结果不得驱动新文档；Task1延迟port与Task2真实读页切文档均覆盖。
2. 页索引0基、UI页码1基，拒绝NaN/小数/越界而不是靠reader静默忽略；Task1首末页/坏页参数覆盖。
3. passageId确实对应当前原文，伪造ID/坐标、跨文档证据不移动视口；Task1伪造输入与Task2真实多页锚点覆盖。
4. 暂停后requestAnimationFrame中的旧定位仍可能滚动；Task2延迟帧接管测试覆盖，薄适配校验必须覆盖提交副作用处。
5. 清除临时聚焦不得删永久标记或写入撤销历史；Task1副作用断言、Task2真实批注/源hash/undo回归覆盖。

## 接口与文件边界
- src/shared/document-commands.ts（新增）：基础命令、宿主归属、结果及错误类型，不依赖Electron/DOM。
- src/renderer/reading-commands.ts（扩充）：保留旧同步入口，新增严格解析与异步执行入口；不包含PDF渲染实现。
- src/renderer/pdf-reader.ts（必要的小改）：适配读取/定位结果与可取消定位；不更换布局或分块算法。
- src/renderer/main.tsx（限定改动）：让已有人工翻页、读取本页块与块定位入口走新指令库，提供当前文档与有效性信息；不新增工具栏或模型入口。
- tests/document-commands.test.ts、tests/e2e/document-commands.spec.ts（新增）：分别覆盖合同/竞态及真实PDF集成。
- docs/acceptance/document-command-foundation.md（新增）：记录已可执行能力、未覆盖能力、实际命令/结果和限制。

### Task 1: 有限指令合同与可取消执行

**Files:** Create src/shared/document-commands.ts、tests/document-commands.test.ts；Modify src/renderer/reading-commands.ts；保留tests/reading-commands.test.ts覆盖旧入口。

**Interfaces:**
- `CommandContext={documentId:string;fingerprint:string;revision:number}`：此处revision是宿主当前阅读上下文的单调失效版本。未来Cruise的session/goal/request版本仍由控制器管理，不在本轮造第二个会话引擎。
- `DocumentCommand`联合类型：`{type:'read_page';pageIndex:number}`、`{type:'go_to_page';pageIndex:number}`、`{type:'show_evidence';pageIndex:number;passageId:string}`、`{type:'clear_focus'}`、`{type:'pause'}`。
- `CommandRequest={requestId:string;context:CommandContext;command:DocumentCommand}`。
- `CommandResult`为带requestId的ok联合：成功返回`{kind:'page';blocks:CruiseBlock[]}`、`{kind:'navigated';pageIndex:number}`、`{kind:'focused';passageId:string;pageIndex:number}`或`{kind:'cleared'|'paused'}`；失败返回固定code与可读message，不返回假成功。
- `DocumentCommandPorts`提供getContext():CommandContext|null、getPageCount():number、readPage(pageIndex:number):Promise<CruiseBlock[]>、navigate(pageIndex:number,isCurrent:()=>boolean):Promise<void>、focus(block:CruiseBlock,isCurrent:()=>boolean):Promise<void>、clearFocus():void、pause():void。
- `runDocumentCommand(input:unknown,ports:DocumentCommandPorts,signal:AbortSignal):Promise<CommandResult>`；接口类型不暴露任意路径或脚本。解析错误COMMAND_INVALID，失效COMMAND_STALE，取消COMMAND_CANCELED，页越界PAGE_OUT_OF_RANGE，ID不存在EVIDENCE_NOT_FOUND，底层失败COMMAND_FAILED。
- requestId/文档ID非空且≤100字符，fingerprint为64位SHA256 hex，revision非负安全整数，passageId非空且≤200字符；命令拒绝额外字段、非有限数字、错误类型。输入只有证据ID，不接收模型quads。readPage返回的证据还要校验文档指纹、页号与现有geometry校验后才定位。

- [ ] 写RED：合法五类命令、解析拒绝、首末页转换、源版本不符、延迟readPage后换revision、AbortSignal取消、证据ID伪造、越界geometry、底层错误、clear/pause不读写批注。
- [ ] 运行`npx vitest run tests/document-commands.test.ts`，保存实际失败日志与退出码；不能把预期失败当已观察失败。
- [ ] 实现最小严格解析与执行；每个await前后及实际navigate/focus副作用处校验isCurrent；pause使宿主旧任务失效，不能无意取消自身的完成记录。
- [ ] 同一请求不分批偷偷执行多个动作；未知命令立即拒绝。show_evidence先从当前页读取并验证passageId映射，再进行定位。
- [ ] `npx vitest run tests/document-commands.test.ts tests/reading-commands.test.ts`及`npm run build`通过；记录literal结果、退出码与旧入口兼容证据。
- [ ] 明确路径提交`feat: add validated document command contracts and executor`，新鲜任务Review通过后再Task2。

### Task 2: 接入真实阅读器并证明指令有效

**Files:** Modify src/renderer/pdf-reader.ts、src/renderer/main.tsx；Create tests/e2e/document-commands.spec.ts、docs/acceptance/document-command-foundation.md；必要时补充tests/document-commands.test.ts的真实reader延迟帧测试。

**Interfaces:** 消费Task1的runDocumentCommand及其完整接口。PdfReader适配仍复用readPageBlocks、locateCruiseBlock/临时focus、go、clearCruiseFocus。宿主在文档更换、用户接管与取消时增加revision；旧回调读取ref中的最新值，不捕获初始文档。不把完整命令执行器挂到window或preload。

- [ ] 写RED：生成至少三页且包含重复句的PDF，已有人工翻页/读取本页块/块定位入口经过新执行器；能从第1页到第3页并定位指定原文，而不是只测试mock port调用次数。
- [ ] 写RED：读页或定位帧尚未提交时切文档/暂停/手动接管，旧任务不改变新页或新证据；clear_focus后正式批注仍在、原PDF SHA256不变。用实际延迟与状态断言，不用任意sleep制造通过。
- [ ] 运行`npx playwright test tests/e2e/document-commands.spec.ts`记录实际RED；先用`npm run build`确认测试确实运行当前构建。
- [ ] 用最少薄适配接入已有人工入口；缺少真实调用点时补测试覆盖既有入口，不建只供测试调用的生产后门。不改旧Cruise含义，不在本轮接DeepSeek。
- [ ] 允许给focus/locateCruiseBlock补可选有效性回调，默认保持原行为；帧回调与异步定位执行前再次检查，失效时不滚动、不paint旧强调。不得为此重写PDF Core。
- [ ] `npm test`、`npm run build`及`npx playwright test tests/e2e/document-commands.spec.ts tests/e2e/cruise-anchors.spec.ts tests/e2e/page-navigation.spec.ts tests/e2e/reading-tools.spec.ts`通过；清楚区分离线确定性测试与真实API验收。
- [ ] 文档列出五个已支持指令及暂未接入的搜索/视图设置/全文上下文/标识创建编辑/导出等能力。未实现项不可显示成功，也不在可执行注册表挂空实现。
- [ ] 明确路径提交`feat: connect document commands to the PDF reader`；Task2新鲜Review后，两项整轮Review。保留原hash和隔离回退证据，候选打包/完整回归及原性能门禁通过后才称本批次可运行。

## 当前批次之后

全文上下文＋新Cruise、标识对象与编辑/保存/导出能力分别按后续两项任务推进，不无限铺开。先基础指令不代表放弃全文先进入模型上下文的主链路，也不代表人/AI操作能力对齐已完成。混合高亮见Backlog FUTURE-03，仅记录。

## 执行交接与自查

本计划待用户审阅；执行方式沿用单一子代理实施＋独立Review，不另问执行方式。当前自动任务暂停，不因生成计划而自动恢复。审阅确认后从Task1 RED开始，不重复实施旧Wave A。

自查：五类Review Focus均有归属测试；Task2只消费Task1定义的接口；未安排任何高级高亮、标识模型迁移或真实请求。指令库之外的规格属于明确后续批次，不借本轮宣称整套重建已完成。预计结果不是测试报告，实际执行需另写证据。
