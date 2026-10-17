# Enlumor Cruise Overnight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 实施在本线程顺序进行；每两项后按requesting-code-review调用一次只读独立reviewer，不并行修改共享工作区。

**Goal:** 交付可配置多协议模型服务、可定位原文并可暂停/手动接管的PDF Cruise，补国内兼容及原生接口。

**Architecture:** 沿用Electron主进程管理网络、凭据、SQLite，React/PDF.js管理文字与界面。纯TypeScript协议适配器统一返回文本事件；分块与状态机独立于供应商，不建立Agent框架、本地网关或新微服务。

**Tech Stack:** Electron44.7.2 / Node24 / TypeScript / React / PDF.js6.4.299 / node:sqlite / Vitest / Playwright；Python仅沿用PDF导出。

**Spec:** D:/codex project/Enlumor/docs/superpowers/specs/2026-10-17-cruise-design.md

## Global Constraints

- 基线0.1.12 / 1844993，设计提交另计；保留原PDF与个人工作区。当前分支先检查，不覆盖其他人的改动。
- 截止2026-10-17 08:00 Asia/Taipei，等于2026-10-17 00:00 UTC；最新绝对截止覆盖先前8小时表述。
- 用户已于2026-10-17书面回复“确认执行”，实施批准已收到；不重复等待确认。
- 每两项整体review；Critical/Important先失败测试复现再修复；Minor记账，不派重复reviewer空转。
- 每任务红→绿、类型检查、独立提交；发布候选递增版本，完整release:verified通过才更新latest。
- 调用在主进程，秘密不回传、不进Git/日志；只发送当前块和必要上下文。不自动调用真实收费API进行夜间压力测试。
- 无密钥继续协议模拟/阅读器测试；不伪造AI结果或实测厂商标记。仅本地提交、构建，不自动上传GitHub。
- 时间不足优先第一/二批，第三批继续记入清单。开始发布门禁前至少预留20分钟；临近截止不开始新任务或新发布。
- 每批保存原文件hash、MODIFIED_FILE、DIFF.patch、VERIFICATION.txt、可执行ROLLBACK.sh；回退在独立副本验证，不回退/删除个人数据库。

## Review Focus

1. SSE/WS分片、中文UTF-8与错误帧：不丢字、不把截断流当成功；任务1/5/6测试。
2. 请求超时与旧响应：换块/暂停/换文档后结果不串页；任务3测试。
3. 文档、模型配置与迁移身份：指纹变化不复用旧块；加密不可用不落明文；任务1/4测试。
4. 旋转/双栏/重复句与扫描页：引用位置有依据，无文字页明确说明；任务2测试。
5. 手动滚动/后台/重启：巡航停止抢位置、暂停后不产生隐式请求；任务3/4测试。

## 文件与接口

新建src/shared/ai.ts（配置/事件类型）、src/main/ai-client.ts（请求与有限协议适配）、src/renderer/cruise-blocks.ts（分块/锚点）、src/shared/cruise.ts（纯状态机）、src/renderer/CruisePanel.tsx（巡航UI）。国内原生适配增长到独立职责时拆src/main/dashscope-client.ts和src/main/spark-client.ts，不先搭插件体系。
修改src/shared/model.ts、src/main/index.ts、src/main/preload.ts、src/main/workspace.ts、src/renderer/pdf-reader.ts、src/renderer/main.tsx、src/renderer/style.css。不要整文件重构阅读器。

```ts
type AiProtocol='openai-chat'|'openai-responses'|'anthropic-messages'|'gemini'|'dashscope'|'spark';
type AiCredential={kind:'api-key';apiKey:string}|{kind:'spark';appId:string;apiKey:string;apiSecret:string};
type AiProfileInput={id:string;name:string;protocol:AiProtocol;endpoint:string;model:string;credential?:AiCredential;maxOutputTokens:number;timeoutMs:number;parameters:Record<string,unknown>};
type AiProfileView=Omit<AiProfileInput,'credential'>&{hasCredential:boolean;verification:'configured'|'contract-tested'|'live-tested'};
type AiTextEvent={requestId:string;type:'delta'|'done'|'error';text?:string;code?:string};
type CruiseBlock={id:string;documentId:string;fingerprint:string;pageIndex:number;quote:string;quads:number[][]};
type CruiseSession={documentId:string;fingerprint:string;blockId:string;profileId:string;mode:'manual'|'auto';pace:'slow'|'normal'|'fast';status:'paused'|'finished'};
```

明确preload新增：listAiProfiles、saveAiProfile、deleteAiProfile、testAiProfile、startBlockExplanation({requestId,profileId,block})、cancelBlockExplanation(requestId)、onAiText(handler)、getCruiseSession(documentId)、saveCruiseSession(session)。返回沿用Reply<T>；主进程逐字段校验。事件订阅返回取消函数；不暴露任意IPC/fetch。

### Task 1：四种协议、国内兼容预设与模型设置

Files：src/shared/ai.ts、src/main/ai-client.ts；修改workspace/index/preload/model；增加模型设置组件；tests/ai-client.test.ts、tests/ai-profiles.test.ts、tests/e2e/ai-settings.spec.ts。
Produces：经验证的AiProfileView与AiTextEvent；主进程请求注册表按requestId支持取消，最多一个巡航解释请求。配置编辑支持endpoint或baseURL的明确选择，URI规范化不重复/v1，手动model必可用。

- [x] 写本地HTTP模拟测试：四种请求/响应契约、SSE跨chunk/UTF-8/截断、401/429/500、超时/取消、模型列表失败手动填写、不同origin重定向不泄漏认证。
- [x] 写配置测试：safeStorage加密保存/脱敏读取/会话内fallback、参数白名单、SQL迁移前备份；只实现所需表，不引入通用配置框架。
- [x] 运行`npx vitest run tests/ai-client.test.ts tests/ai-profiles.test.ts`并保存真实失败；最小实现后运行相同命令转绿。
- [x] 按官方文档核对DeepSeek、百炼、方舟、千帆、混元预设；Kimi/智谱/MiniMax/硅基流动逐一核对后再纳入，不假设所有特殊参数可互换。
- [x] Electron设置测试通过：增删配置、测试连接、密钥读回脱敏、无密钥/错误提示；运行`npm run typecheck`，提交。

### Task 2：按需原文分块与锚点定位

Files：src/renderer/cruise-blocks.ts；修改pdf-reader.ts；tests/cruise-blocks.test.ts、tests/e2e/cruise-anchors.spec.ts。
Consumes：已有PDF.js文档/viewport和SelectionPart；Produces：readPageBlocks(pageIndex):Promise<CruiseBlock[]>、locateCruiseBlock(block):void。缓存绑定文档指纹与页面，仅有限页面常驻；不为200页新建全部canvas。

- [x] 写失败测试：中文段落/跨行、双栏/重复句、裁剪四旋转、空文字页、文档更换与异步旧结果；块长度上限和稳定ID。
- [x] 运行`npx vitest run tests/cruise-blocks.test.ts`观察失败，再最小实现与转绿。
- [x] 用实际Electron验证从选区/当前页起点定位，放大旋转后仍在原文；扫描页给明确略过/退出提示，不用假块。
- [x] 跑类型检查与本轮E2E，保存证据并提交。
- [x] **Review第1批（Task1+2）**：一位只读独立reviewer；修复重要问题并写回清单，完成前不开始Task3。

### Task 3：可用Cruise控制、解释、引用与手动接管

Files：src/shared/cruise.ts、src/renderer/CruisePanel.tsx；修改main.tsx/pdf-reader.ts/style.css；tests/cruise.test.ts、tests/e2e/cruise.spec.ts。
Consumes：AiProfileView、AiTextEvent、CruiseBlock；Produces：开始/继续/暂停/后退/略过/退出流程与可验证引用回跳，默认手动继续。

- [x] 状态机先写失败测试：idle/loading/ready/explaining/paused/error/finished；快速连按、换块/换标签取消、旧requestId事件、超时重试不丢块。
- [x] 原文与模型输出是数据，不执行其指令。解释只发送当前块/少量上下文；引用只接受已提供块ID，并校验docId/fingerprint。
- [x] `npx vitest run tests/cruise.test.ts`红→绿；网络解释复用Task1，不给每家单写UI。
- [x] 实际Electron模拟服务跑打开→开始→流式解释→引用回跳→暂停→手动滚动/切页接管→退出；程序定位滚动不被误判用户接管。
- [x] 用户首次开始说明服务与发送范围；配置缺失明确引导设置，无模拟答案。临时强调不新增永久批注；原PDF哈希不变。类型检查、提交。

### Task 4：节奏、会话恢复与故障恢复

Files：修改cruise.ts/CruisePanel.tsx/workspace.ts/index.ts/preload.ts；tests/cruise-session.test.ts、扩展cruise.spec.ts。
Consumes/Produces：CruiseSession与get/saveCruiseSession。SQLite为权威，重启恢复paused，解释结果保留配置/模型来源。

- [x] 写失败测试：自动模式只有解释成功后才倒计时；慢/标准/快三档固定为20/12/6秒，可暂停；后台/手动操作停止计时器；返回前块复用已完成结果，不隐式再次调用。
- [x] 测迁移备份、写入失败重试、强退恢复、指纹被替换时拒绝旧会话，模型切换不改已有解释来源。保存结果未确认不显示已保存。
- [x] `npx vitest run tests/cruise-session.test.ts`红→绿；实际Electron重启不会自动发API请求。
- [x] 类型检查、聚焦E2E、提交。
- [x] **Review第2批（Task3+4）**：修复Important后，时间充足才开始Task5；可先做独立发布候选保留可用Cruise。

### Task 5：DashScope原生文本HTTP/SSE

Files：src/main/dashscope-client.ts（需要时拆分）；修改ai-client.ts/设置预设；tests/dashscope.test.ts。
Consumes：AiProfileInput；Produces：统一AiTextEvent。只接原生文本生成，不把应用编排或多模态端点误当文本接口。

- [x] 核对官方原生文本接口、input/parameters/output结构和SSE头；写本地模拟请求/响应、增量/累计输出、错误码/UTF-8/取消/截断测试。
- [x] `npx vitest run tests/dashscope.test.ts`先见红后实现；输出与四种协议遵守同样取消和脱敏契约。
- [x] 设置界面可选原生协议，Electron模拟任务可用于Cruise；类型检查、提交。无真实密钥仅标契约测试。

### Task 6：讯飞星火原生WebSocket与签名

Files：src/main/spark-client.ts；修改ai-client.ts/设置表单；tests/spark.test.ts、相关Electron模拟服务测试。
Consumes：配置中独立APPID/APIKey/APISecret，秘密按Task1方式处理；Produces：同一AiTextEvent，不改变Cruise状态机。

- [x] 官方文档核对签名串、host/date/request-line、domain与端点对应。使用固定时钟写签名向量和URL编码测试；错误凭据不回显签名或密钥。
- [x] 本地WS服务覆盖多帧、错误帧、结束status、断线/超时/取消、旧请求事件与不完整输出。先测试失败再实现；优先Node现有能力，只在确有需要时增加小型锁定依赖并说明原因。
- [x] `npx vitest run tests/spark.test.ts`转绿；真实Electron模拟服务解释当前块，类型检查、提交。
- [x] **Review第3批（Task5+6）**：修复Important、更新兼容矩阵；不把未完成的专有云签名或真实供应商连接写成已完成。

## 发布与截止检查

- [x] 到截止前20分钟时停止开新任务。只对已经完成并review的候选执行`npm run release:verified`，保留现有全部回归、200页两种压力样本与密集画笔门禁，新增测试必须接入全套。
- [x] 最终EXE专项复测、真实查看截图/导出PDF、验证原文件hash与隔离回退，重新打开四份证据；发布失败不移动latest。
- [ ] 每次续跑先读取本计划checkbox、Git状态、正在运行的实施者/测试；不并行改同一项目，不重复重建完成的模块，不覆盖用户改动。
- [ ] 08:00到达时不再启动产品变更/请求/构建；有正在运行的验证只收集结果，不继续下一步。未完成更改保留清晰状态，最新已验证版本保持可启动。
- [ ] 在聊天汇总完成任务、review、实际测试与退出码、兼容等级、构建位置、待办。仅完成/故障/需要决策时报告，不反复输出未变化状态。

## 续跑提示

```text
读取本计划和设计，先确认用户已审阅并同意这份书面实施计划，再顺序推进。截止2026-10-17 08:00 Asia/Taipei。Cruise优先，四种通用协议+国内预设先跑通，DashScope/讯飞原生单独验收；每两项review一次。所有完成声明必须有本次实际测试证据。缺真实密钥继续本地协议模拟但标明未实测，不产生外部API费用，不上传GitHub；保留原PDF与个人数据。
```
