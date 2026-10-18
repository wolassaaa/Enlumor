# Enlumor v0.5.1 Wave A Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 每次一个实施者，任务审查＋两项整轮review；不创建并行产品写入者。

**Goal:** 补齐当前证据块追问并完成已有控制接口复核，准备可真实验收的Wave A，不提前开发Surfing。
**Architecture:** 在现有ExplanationRequests请求中增加一个可选、受限的追问负载；UI追问结果与原有按块解释缓存隔离，共用同一取消/失效机制。无新数据库表、通用工具平台或协议重写。
**Tech Stack:** 现有Electron/React/TypeScript/PDF.js/SQLite/PyMuPDF与锁定依赖。
**Spec:** docs/product/Enlumor_Product_Plan_v0.5.1.md；当前清单docs/WAVE_A_TASKS.md。
**Execution:** 用户本轮已授权清单→定时→开始，保留子代理执行选择。当前目录即已有隔离worktree，不再创建第二个。

## Global Constraints
- 当前仅Wave A两项。主目录正式0.1.15/个人库/原PDF只读；不推GitHub、不启动Surfing、不机械重做已通过能力。
- 模型只看当前块，追问最多1000字符，当前解释摘录最多8192字符；所有字段主进程校验，历史解释仅作待核验上下文，不当原文证据。
- 不读取个人加密密钥或凭显示名猜真实API ID；真实请求由隔离配置与用户明确操作触发，自动化不擅自调用付费服务。
- 每项TDD并提交；每轮完整打包后再发布，真实API缺失始终NOT EXECUTED。
- 现有保存/撤销/导出与正常解释缓存不变；追问仅当前组件会话，不增无限聊天历史或永久批注。
- 原预算：200页约32MiB/1000批注，启动median≤1500ms、framep95≤34ms、savep95≤20ms、正文canvas≤30/缩略图≤8。

## Review Focus
1. 问题输入后切块/服务/文档/设置/后台，晚到回答不能换原文或覆盖当前追问（A1/A2）。
2. 追问失败/取消保留问题和明确重试，重试不拼旧partial、不写入普通block结果缓存（A1）。
3. 超长/空/畸形question与previousAnswer在main先拒绝，原文verify-block失败前不发网络（A1）。
4. 问题提交不得夹带其他页面/永久批注；当前解释摘录上限和外发提示一致（A1）。
5. 新增输入焦点、轮询定时唤醒/旧auto恢复和真实配置缺失时不误发请求/重复构建（A2）。

### Task 1: 当前块追问最小闭环与真实验收准备
**Files:** src/main/cruise-requests.ts、src/renderer/CruisePanel.tsx、src/renderer/style.css；必要时src/shared/cruise.ts仅作局部失效支持；tests/cruise-requests.test.ts、tests/e2e/cruise.spec.ts；docs/acceptance/wave-a-real-api.md。
**Interface:** 现有ExplanationInput新增 `followUp?: {question:string;previousAnswer?:string}`。正常解释原JSON负载保持不变；追问序列化为当前blockId/text/question及有界previousAnswer数据。既有onAiText和requestId保持，单请求活动槽共享。
**UI:** 当前块下方输入“当前原文追问”；“提交追问”“取消追问/重试追问”；独立“追问回答”区域。保留原解释，显示仅发送当前原文/问题/解释摘录。完整问答只在本次组件会话；不向results[blockId]写追问。

- [ ] 写RED：空白/超过1000字符question、非字符串、超过8192字符previousAnswer或畸形followUp应在生成前拒绝；正常负载保持原样；有效追问仅包含当前原文和明确的问题。
- [ ] `npx vitest run tests/cruise-requests.test.ts`，先记录实际失败，再实现最小主进程校验与prompt分支；仍调用verify-block。
- [ ] 写Electron RED：输入→提交→流式回答；取消/429/超时/断流→保留问题→手动重试；问题回答不覆盖普通解释缓存、不增加批注、源哈希不变。
- [ ] 独立UI状态必须捕获requestId+当前reader epoch/block/profile；切上下文立即清除旧响应控制权，所有暂停/设置/后台/卸载路径取消普通和追问请求；不能同时发两条。
- [ ] previousAnswer只取已完成当前解释的最多8192字符，不把失败partial发送为成功历史；文本标明解释摘录不是原文。
- [ ] `npm run build` + 相关Vitest/Electron通过；最后完整unit一次。记录精确命令、输出、退出码。
- [ ] 文档真实验收继续NOT EXECUTED直到真实DeepSeek连接/解释/追问/暂停/重试完成；更新输入/外发范围而不伪造结果。
- [ ] 提交：`feat: support bounded questions about the current PDF evidence`；fresh任务审查后再做Task2。

### Task 2: 用户优先控制复核与最终验收候选
**Files:** 以Task1测试和src/renderer/CruisePanel.tsx、src/renderer/reading-commands.ts、src/renderer/pdf-reader.ts、src/main/cruise-sessions.ts为审计对象；只在实际失败时修改对应文件。tests/e2e/cruise.spec.ts、tests/reading-commands.test.ts、tests/cruise-session.test.ts；scripts/check-wave-a-paper.mjs及独立回退脚本/证据根据实际差异更新。
**Interfaces:** 复用现有readPageBlocks/locateCruiseBlock/search和finite ReadingCommand；不新增通用命令总线或新schema。

- [ ] 列出已有/部分/缺失能力；search/get_block若直接函数已满足验收只记录复用，不为命名目录重构。
- [ ] 写并运行失败测试覆盖追问期间手动滚动/翻页/选区/缩放/批注/切服务/开设置/窗口后台/退出；最晚响应不能移动视口或更新新上下文。已有通过场景保留为基线，不制造RED。
- [ ] 最小修正实际故障，回归旧auto->paused/manual、已确认批注/结果来源/源文件hash与撤销导出。
- [ ] 两项整轮独立review并修阻断问题，记录实际意见与修复证据。
- [ ] 构建独立验收候选，不运行会自动更新latest的release脚本（真实API未验收时）；最终EXE全套、无外部Python、真实论文本地、双200页/密集画笔原预算全通过。
- [ ] 基线/修改/回退四件证据：snapshot、DIFF、VERIFICATION、可执行ROLLBACK；manifest覆盖所有改动existing src，新文件仅在副本移除，实际编译/启动/恢复行为，live源保留修改。
- [ ] 用户在隔离实例实际配置DeepSeek，记录可复现的解释→定位→当前块追问→暂停/恢复/断网重试→重启；不在日志/聊天收密钥。
- [ ] 若只有真实配置/验收缺失：Task1/整轮保持待验收，候选保留；自动任务暂停并通知，不进入B、不空跑。
- [ ] 真实闸门全部PASS后才按版本发布流程完整打包；本Wave完成后停下来报告，Surfing B等待下一次拆解。

## 自动执行与自查
- enlumor heartbeat每30分钟唤醒当前聊天；首先核对docs/WAVE_A_STATE.json、当前Git与代理状态。已在途工作只接续，不重复实施/review/构建。
- 一次只推进一个可验证步骤，代理退出后更新state/清单/进度；每项提交，review记录随结果保存。
- 缺必需用户信息时先完成可离线工作；全部离线事项完成仍缺真实API则调用automation_update将enlumor设PAUSED，保留字段与清单，不自动恢复旧08:00任务。
- 自查：两个任务、输入边界、测试、取消语义、控制/缓存隔离、原预算、真实闸门及原文件保护均有责任归属；后续Wave不展开。
