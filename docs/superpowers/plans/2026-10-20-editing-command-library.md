# Enlumor Editing Command Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 沿用用户选择：单一实施者、每项独立Review、两项后整轮Review；详细计划经用户审阅后才写运行时代码。

**Goal:** 构建七类标识的编辑命令合同、变更生成和事务执行库，证明实际本地提交与历史正确；不将纯变更计划或测试仓储冒充应用上线。
**Architecture:** 共享标识模型与纯规划器生成有版本的before/after；执行器通过宿主事务端口原子校验、写入历史/回执。沿用现有CommandContext的文档/指纹/revision及AbortSignal，不建通用Agent平台。生产工作区、浮动UI与真实PDF导出接入是后续批次。
**Tech Stack:** 当前TypeScript、node:sqlite、Vitest；锁定依赖不变，不接模型API。
**Spec:** docs/superpowers/specs/2026-10-19-editing-command-library-design.md（含v2语义）。当前计划与v2一起待书面确认；不把用户的“继续”记成已逐条审阅v2。

## Global Constraints
- 固定工作目录D:/codex project/Enlumor/.worktrees/v04-wave-ab；基础653acb4/2d45f0e已完成，不重跑或重写基础两项。
- 人/AI共享底层能力，来源独立；标识默认非永久，origin、retained、visible与导出选择互不替代。未固定标识不因暂停/切页/关闭面板自动删除。
- 保留旧Annotation的author=user校验和Workspace schema；本批不迁移个人数据库，不把AI来源伪装成user写回旧表，不新增生产存储权威。
- 原文锚点由可信宿主解析；模型只给锚点ID，不能自行提交quote/quads冒充证据；自由绘制几何合法不代表有原文引用。
- 未旋转PDF原生坐标；页边界由源文档宿主提供，保留裁剪偏移/负坐标，不假定页面原点是(0,0)。
- 不做正文排版编辑、页删除/重排、OCR、画笔识别行混合高亮、白板、Surfing或前端重写，不调用真实模型、不发布、不推GitHub。
- 只注册真实支持的命令；缺少实际导出适配时返回UNSUPPORTED，不以空路径/空对象表示成功。
- 暂时保留现有原PDF只读和导出另存原则；原性能门禁不放宽。本批不声称新浮动UI或生产恢复/导出已验收。

## Review Focus
1. 来源/actor/确认不能由模型字段伪造：Task1拒绝身份patch，Task2用可信宿主与具体差异绑定凭据测试。
2. 几何编辑与原文换锚点混淆：Task1覆盖七类、箭头端点、裁剪页界、稀疏数组、移动placement后锚点不变。
3. 提交后取消或丢回执重复创建：Task2真实SQLite持久回执、关闭重开、同ID异摘要及commit前/后取消测试。
4. 撤销覆盖其他来源新编辑或版本ABA：Task2事务内对象版本及删除墓碑校验、定向undo/redo、失败不弹历史测试。
5. 批量、显隐、固定及导出耦合：Task1快照/变更隔离，Task2一个非法对象零提交、隐藏未固定标识显式导出选择不改状态。

## 文件边界
- Create src/shared/editing-commands.ts：标识/命令/结果/计划的确定类型，不依赖DOM或Electron。
- Create src/shared/editing-marks.ts：模型与几何校验、深拷贝；只复用geometry.ts的已有纯数学能力，不放松旧校验。
- Create src/shared/editing-planner.ts：严格解析、查询/变更/逆操作与导出快照生成，无IO。
- Create src/main/editing-executor.ts：提交前准备、宿主事务内compare-and-commit、幂等、确认与历史；不接现有IPC/Workspace。
- Create tests/editing-planner.test.ts、tests/editing-executor.test.ts、tests/helpers/editing-sqlite-store.ts：纯规划测试与真实临时SQLite测试适配。
- Create docs/acceptance/editing-command-library.md：按命令列出已实现/未接入，不冒充真实应用批注链路。

### Task 1: 编辑合同、严格校验与纯变更生成

**Files:** Create上述三个shared文件与tests/editing-planner.test.ts；不改旧model.ts/geometry.ts/Workspace或UI。

**Types / Interfaces:**
- 复用CommandContext。`EditActor={kind:'user';id:string}|{kind:'ai';id:string;sessionId:string}`；actor只来自可信宿主参数，不在模型命令内。
- `EditMark`保留旧Annotation除author外的内容字段(id/documentId/fingerprint/type/pageIndex/quote/quads/points?/color/note)，增加origin:EditActor、retained:boolean、visible:boolean、version:number、anchorId:string|null、placement:{dx:number;dy:number}。创建默认retained=false、visible=true、placement=(0,0)，origin由宿主赋予。
- `VerifiedAnchor={id:string;documentId:string;fingerprint:string;pageIndex:number;quote:string;quads:number[][]}`；`EditSnapshot={context:CommandContext;marks:EditMark[];versions:Record<string,number>}`。versions包含删除墓碑；不存在且从未创建为0，任何修改/删除/撤销/重做版本都+1，不回退。
- `EditEnvironment={actor:EditActor;pageBounds:readonly[number,number,number,number][];anchors:readonly VerifiedAnchor[];newIds:readonly string[]}`，均由可信宿主提供；newIds按创建顺序分配。重试先查持久回执，再分配ID，不让重复请求生成新对象。
- `EditRequest={requestId:string;context:CommandContext;command:EditCommand}`。请求严格拒绝额外字段；数据进入规划器后深拷贝，后续调用者修改不改变计划。ID/文档≤100字符、锚点ID≤200、SHA256为64hex、版本为非负安全整数；数组拒绝空洞、非有限数字或共享可变引用。
- color为#RRGGBB，note/源quote各≤100000字符，画笔points沿用4–8192个有限坐标数/偶数长度限制。逐层读取数据属性，拒绝访问器/原型夹带字段；不调用外部getter来完成验证。宿主提供的标识/锚点/页界也校验并复制。
- `prepareEdit(input:unknown,snapshot:EditSnapshot,env:EditEnvironment):PreparedEdit`；失败返回固定code/message，成功只返回kind=read/prepared/history/export_snapshot/export_request，绝不返回committed。
- 修改结果统一`EditDelta={id:string;expectedVersion:number;before:EditMark|null;after:EditMark|null}`；`PreparedEdit`携带文档归属、可信actor、规范命令摘要、全部deltas与逆内容、是否需要确认。所有依赖的对象版本纳入摘要；返回值不得持有输入可变引用。
- `PreparedEdit`失败分支为`{ok:false;error:{code,message}}`，成功为`{ok:true;requestId;context;actor;kind;digest;...}`；错误code仅EDIT_INVALID、EDIT_STALE、MARK_NOT_FOUND、VERSION_CONFLICT、ANCHOR_NOT_FOUND、UNSUPPORTED_PLACEMENT、BATCH_CONFLICT、EDIT_TOO_LARGE。kind对应结果放在read/deltas/history/exportSnapshot/exportRequest字段之一，互不混用。
- 摘要对规范化后的数据计算SHA256：对象键排序、数组保持语义顺序；ID集合去重校验后排序，导出标识按pageIndex/id排序。摘要不包含随机时间、临时路径或模型自报的身份，不因输入对象属性顺序改变。

**命令精确定义（type为下列名称，除所列参数无其他参数）：**
- list_marks：无参数，返回当前文档全部标识，包含来源/visible/retained；get_mark：id。
- create_mark：`markType`为既有七类、pageIndex、color、note；文字三类必须anchorId，原文/坐标从env.anchors取得；note可选anchorId，有锚点取源位置，无锚点必须geometry；line/arrow/ink必须geometry且quote为空。调用者不得指定origin/version/id/retained。
- update_mark：id、expectedVersion、patch，仅允许color/note，空patch拒绝。
- set_mark_geometry：id、expectedVersion、geometry:{quads,points?}，仅自由line/arrow/ink或无原文锚点的note可用；文字标识改位置用replace_mark_anchor。
- set_mark_placement：id、expectedVersion、placement:{dx,dy}，原生页面单位偏移，原文锚点不变；当前只接受note，其他类型返回UNSUPPORTED_PLACEMENT，不假装实现高级浮动高亮。
- replace_mark_anchor：id、expectedVersion、anchorId，支持文字三类和note；重新取同文档真实quote/quads/pageIndex，不接受调用者quote。
- delete_marks / set_marks_visibility / set_marks_retention：targets:{id,expectedVersion}[]，后两者分别带visible:boolean / retained:boolean；目标非空、去重，最多1000项。
- erase_ink：pageIndex、from:[x,y]、to:[x,y]、radius>0（PDF原生单位）；仅匹配该页可见ink，复用整笔相交逻辑，命中全部先作权限/版本检查；不是局部切割。
- apply_edit_batch：operations为上列创建/修改/删除/擦除/状态命令的数组，1–64项；不含嵌套batch、查询、历史或导出。同一标识重复目标拒绝BATCH_CONFLICT，所有检查完成才产生最终差异；批量无半成品。
- undo_edit / redo_edit：operationId，Task1仅生成有归属的history请求，不伪造逆操作或模拟提交；Task2从持久历史解析并校验。
- prepare_mark_export：selection:{origins:('user'|'ai')[];ids:string[]|null;includeHidden:boolean}，来源至少一类、ID去重≤1000，null表示该来源全体；retained不作为过滤器，返回深拷贝版本快照及摘要。
- export_marked_pdf：snapshotId；只生成明确export_request，Task2在无真实宿主导出端口时UNSUPPORTED，不注册可调用的PDF导出工具。

- [ ] 写RED：七类创建、默认属性、来源伪造、文字源锚点、页界/裁剪偏移、空洞/NaN/退化点、箭头端点/placement/换锚点、每类编辑、批量冲突/零变更、隐藏与未固定导出选择、输入/结果不串引用。
- [ ] `npx vitest run tests/editing-planner.test.ts`保存实际RED及退出码；再实现最小类型/校验/规划逻辑，不写数据库。
- [ ] 只读查询无变更；任何prepared结果明确“尚未提交”；AI对本会话自身未固定对象可直接准备，其余保护目标标requiresConfirmation，不能在解析时信confirmed=true。
- [ ] 几何在可信pageBounds内；验证文字锚点身份与真实几何；逆内容保留origin/anchor/retention/visibility，但实际版本由执行时递增。
- [ ] 专项测试、`npm test`、`npm run build`通过，原261基线保留；记录真实结果后明确路径提交`feat: add editing command contracts and pure mark planning`，fresh任务Review通过再Task2。

### Task 2: 原子执行、确认、回执与定向历史

**Files:** Create src/main/editing-executor.ts、tests/editing-executor.test.ts、tests/helpers/editing-sqlite-store.ts、docs/acceptance/editing-command-library.md；必要时仅补Task1的具体失败测试，不改生产Workspace schema/IPC。

**Interfaces:**
- `runEditingCommand(input:unknown,host:EditHost,signal:AbortSignal):Promise<EditResult>`。结果状态仅read/prepared/confirmation_required/committed/conflict/canceled/unsupported/error；committed带documentId、fingerprint、operationId、receiptId及当前版本，旧文档回执也保留原归属。
- host.getContext/getActor/getPageBounds/resolveAnchors为可信读取；resolveAnchors异步时前后检查上下文与signal。host.allocateIds(requestKey,count)仅为新操作分配ID，不能让模型指定actor或ID；同一requestKey的同序号使用确定性SHA256派生ID，预览/确认重试不能换ID导致确认摘要失效。已存在/墓碑冲突不能覆盖原对象。
- host.transaction(body)必须是单一原子边界，body同步接受tx；tx提供readSnapshot、readReceipt、readOperation、readConfirmation、writeDeltas、writeHistory、writeReceipt、consumeConfirmation。确切参数复用Task1的context/actor/PreparedEdit/deltas，不再复制第二套标识结构。
- 幂等键={documentId,fingerprint,actorIdentity,requestId}，actorIdentity含AI session。规范命令+预期版本的SHA256摘要不同即REQUEST_ID_REUSED；匹配的已提交回执先返回，不再分配ID、创建标识或推进历史。
- 提交前先准备；事务内重新校验来源/文档/对象版本、确认摘要及取消状态，再同时写入deltas、版本/墓碑、历史、回执与凭据消耗。确认失败或提交失败不消耗凭据，不更新任何历史。确认凭据只能由host.getConfirmation提供并绑定actor、文档、before/after摘要，模型命令不含确认字段。
- 已持久提交后返回committed；事务返回前发生取消/切页不把成功改成canceled。提交前取消全不写；提交结果不明时从持久回执查询，不自动重做。旧归属回执不得触发当前界面效果。
- undo/redo指定operationId且文档/操作者授权匹配；用户可以明确撤销AI组，AI撤销用户或其他会话组仍需绑定差异的确认。检查该组对象当前版本，内容恢复但版本单调+1。历史记录保留原operationId、执行actor、被撤销组、before/after、逆内容及applied/undone状态。失败历史栈不动；撤销后新编辑只清除当前执行actor分支的redo，其他来源的新编辑保留。删除后复建通过墓碑版本拒绝ABA覆盖。
- list/get/prepare_export是只读结果，不写编辑历史、不声称committed；有写入副作用的操作才需要持久提交回执。导出快照状态是prepared，缺少真实导出端口的export_marked_pdf为unsupported，不能返回假的文件路径。
- runtime错误code在Task1集合外增加EDIT_CANCELED、CONFIRMATION_REQUIRED、CONFIRMATION_INVALID、REQUEST_ID_REUSED、COMMIT_UNCERTAIN、STORE_BUSY、EDIT_FAILED、UNSUPPORTED；明确定义只读结果不是“已保存”。提供只读receipt查询方法恢复已提交操作，不让当前页面的revision变化把持久成功事实改成取消。

- [ ] 写RED：真实临时SQLite两连接竞争同版本仅一个提交，锁/busy、任一写入失败、重复提交、同请求改参数、关库重开后重试不重复、commit后丢回执、提交前取消与提交后取消的不同结果。
- [ ] 测试仓储只位于tests/helpers，表为临时marks/tombstones/operations/receipts/confirmations，BEGIN IMMEDIATE内原子写；这是测试宿主，不是第二个生产存储系统。对方连接锁冲突/错误需回滚，之后可重试同原请求且不误消耗确认。
- [ ] 写RED：AI保护对象确认、过期差异/跨actor凭据、定向undo/redo、新分支、跨来源冲突、版本不倒退；实际SQL读取行数/版本/历史/回执验证，不仅检查port调用次数。
- [ ] `npx vitest run tests/editing-executor.test.ts`记录实际失败，再实现运行时；所有事务相关测试使用真实node:sqlite，不用Map替代并发与耐久性。
- [ ] 用临时源PDF哈希、独立SQLitefixture证明只影响选定测试仓储；生产个人DB、原PDF、现有标注和基础读页库不变。新API不挂window/preload，不接模型。
- [ ] `npx vitest run tests/editing-planner.test.ts tests/editing-executor.test.ts`、`npm test`、`npm run build`全部通过，明确路径提交`feat: execute mark edits with atomic receipts and targeted history`。
- [ ] fresh Task2Review后两项整轮Review；保留RED/GREEN/原hash/修改快照/diff/验证记录与隔离副本回退。文档逐项声明16命令的解析、准备、执行、真实应用接入状态，不能用16个名字代替16个真实能力。

## 覆盖与下一批边界（自查结论）

Task1覆盖七类内容/几何、来源、锚点、显隐/保留、批量及导出选择；Task2覆盖确认、原子性、耐久回执与定向历史。五个Review Focus均有明确测试；生产UI/数据库迁移、旧批注导入、真实PDF导出、浮动布局、模型调用明确留后续，不注册伪成功接口。

本计划不将“整个编辑库”的产品目标缩成只有创建高亮，但本批只交付库内可验证逻辑与测试宿主。真实应用编辑/保存/重开/导出及原性能全回归需后续集成批次通过，届时才称上线。现有阅读器261/EXE141保持历史已验证事实，本次不重复算作新测试。

## 审阅交接

计划与v2规格需一起确认后实施；用户已选择的子代理方式保留，不重复询问执行方式。当前未写编辑运行时代码，当前自动任务不因生成计划而自行开启产品实施。
