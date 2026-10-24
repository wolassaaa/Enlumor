# Surfing × Cruise 共同底座与模型介入层 · 设计稿 v0

日期：2026-10-25（夜间起草，Claude）。状态：**设计草案，未实施，待你审阅拍板**。本稿不改任何运行时代码。
依据：现有代码（§0，带文件引用）、`docs/product/Enlumor_Product_Plan_v0.5.1.md`（§2.2 / §3.4 / §5）、`docs/BACKLOG.md`（POST-A-01、FUTURE-02）、
`specs/2026-10-19-reading-command-foundation-design.md`、`specs/2026-10-19-editing-command-library-design.md`、`specs/2026-10-17-cruise-design.md`、
`Downloads/Enlumor_MVP_PRD_v0.1.md` §06（AI 技能库与权限分级）、问题总账 `docs/SURFING_ISSUES_2026-10-25.md`。

---

## 一句话
**一个阅读会话核心（谁在看哪篇、现在谁说了算），一套原文段落（模型和人都用同一种“原文地址”），一张能力表（人和模型能做的事、各自什么权限），一条模型回合流水线（看什么 → 花多少 → 说什么 → 指哪里 → 做什么 → 怎么撤回）。Surfing 和 Cruise 只是这条流水线上的两种“策略”，呈现层（今天的右侧面板、将来的 Intelligent UI）只消费同一种输出。**

---

## 0. 现状地图（2026-10-25 代码事实）
| 关注点 | Cruise（旧） | Surfing（新） | 结论 |
|---|---|---|---|
| 原文来源 | renderer 用 PDF.js 拼段落块 `cruise-blocks.ts:8`，主进程再用 Python `verify-block` 复核 | 主进程调 Python `surfing_document`，**每行一段** `export_pdf.py:60`，id `surf-{page}-{block}-{line}` | 两套抽取、两种 id、两种信任模型；编辑锚点还有第三套（`editing_page`） |
| 发给模型的范围 | 只发当前一块 `cruise-requests.ts:22` | 全文 + 当前页 + 最近 6 轮 `surfing-requests.ts:59,75` | 用户截图里“只拿到标题”正是 Cruise 的单块范围 |
| Prompt | 中文、内联 | 路线在 shared、问答在 main 内联、英文 | 3–4 个 prompt 构造器，无公共模块 |
| 请求生命周期 | 单飞 + AbortController + `current()` `cruise-requests.ts:7-17` | 几乎同样的代码 + 上下文校验 `surfing-requests.ts:26-49` | 重复实现；取消 key 不同（requestId vs context） |
| 输出校验 | **不解析**，原文流式给 UI | 严格 JSON `{text,passageIds}`，剔除内部 ID | 分歧 |
| 预算/计数 | 无 | o200k 或 DeepSeek 字节估算，仅 openai-chat 白名单 + deepseek `surfing-tokenizer-models.ts:4` | 其他 5 种协议在 Surfing 下不可用 |
| 同意 | 仅提示文字 | renderer 勾选，字面量 `consent:true`，不持久 | 宿主无记录 |
| 会话/保存 | renderer 拥有，`cruise_sessions`，结果只按 block.id 缓存 | main 权威 `SurfingRuntime`，`surfing_sessions` | 两种权威模型 |
| 打断/接管 | `takeover` 计数 + 旧 `pause_session` | `takeoverRef` + `host.invalidate` | `notifyCruiseTakeover` 同时驱动两者；Escape 只停通用 host（T10） |
| “revision” | — | runtime revision + renderer epoch | 编辑 IPC、阅读 host 各有一个，**三个 revision 不可比** |
| 取消错误码 | `AI_CANCELLED` | `AI_CANCELED` / `SURFING_CANCELED` | 另有 `COMMAND_CANCELED`/`EDIT_CANCELED`/`PDF_CANCELED` |
| 模型能否动阅读器 | 否 | 否：只返回 passageIds，用户点按钮才跳 `SurfingPanel.tsx:51,70` | 规格 §5 提的 `actions[]` 从未实现 |
| 模型能否改批注 | 否 | 否：编辑 actor 写死为 user `editing-workspace.ts:80`，确认端口返回 null `editing-ipc.ts:52` | AI 编辑路径不存在 |
| 分层 | `shared/model.ts:4` 引 main 类型；`SurfingPanel.tsx:9` **值导入** main 模块 | | 线类型应下沉到 shared |

---

## 1. 产品面：两种模式到底差在哪
- **Reader**：没有 AI。**Surfing**：你不带问题来，AI 给出方向和切入点，**你推进**。**Cruise**：你带着问题来，AI 去找、比、追，**AI 推进但随时可被你打断**。
- 差别在**起点和推进者**，不在“深度”。所以底座只需要一个会话，模式是会话上的一个字段 + 一种策略。
- 模式切换（计划 §2.2）：Surfing → Cruise 带上文档、当前锚点、已看过的内容和问题；切换瞬间暂停自动导航；回来不自动续播。

## 2. 会话核心（Session Core，主进程权威）
```
ReadingSession {
  sessionId, documentId, fingerprint, contextRevision      // 文档身份；换文档/重绑即新 revision
  mode: 'reader'|'surfing'|'cruise'
  goal: { text, version }                                  // Surfing 可为空；Cruise 的问题
  cursors: { surfing?: RouteCursor, cruise?: ResearchPath } // 两个模式各自的游标，不共用
  play: 'idle'|'running'|'paused'|'awaiting_user'
  navigationGeneration                                      // 每次用户接管 +1
  conversation: Turn[]                                      // 现在仅本次打开；以后可持久
  ledger: RequestRecord[]                                   // 发了什么、多少、花多少
}
```
- **唯一接管入口** `session.userTookOver(reason)`：滚动、翻页、选区、批注、Escape、切后台、开设置 → `navigationGeneration++`、`play='paused'`、取消在飞请求的“动作”部分（文字回答可以保留为“已过时”）。替代今天的 `notifyCruiseTakeover` + 两套 takeover + Escape 分叉（顺带修 T10）。
- **一个 revision**：`contextRevision` 只在主进程递增，三个 host 都引用它；renderer 不再自造 epoch 作为身份。
- **所有权检查**（计划 §5.2，规格 §6）：任何模型结果在**到达时**和**执行前**两次核对 `sessionId / goal.version / navigationGeneration / contextRevision`，任一不符：文字降级为“过时回答”，动作一律丢弃。

## 3. 原文层（Passage Layer，单一可信来源）
- 只保留**一个抽取器**：主进程调 Python，renderer 永远不自报原文（沿用 Surfing 的信任结论）。
- 存两级：**行级 passage**（定位精确，现 Surfing 的 `surf-p-b-l`）+ **段级 group**（给模型读和给人看更自然）。模型引用 passageId；UI 可以把同段的相邻行合并成一个“原文片段”。
- 编辑锚点（文字批注的 anchor）改为引用 `passageId + 字符区间`，不再有第三套 id。Cruise 的旧 block 读历史数据时映射到 passage 区间（只读兼容）。
- **诚实覆盖**：每次请求记录“本次实际发送了哪些页/段/字符”，扫描页、空页、超限页明确标注，绝不把“已索引”说成“模型看过”。

## 4. 能力表（Capability Registry：人和模型共用一张）
每个能力一行：`name / 参数 schema / 效果类别 / 谁能调 / 在哪执行 / 怎么撤回`。人点按钮和模型输出 `actions[]` 走同一个校验和执行器（规格 §4“不另造总线”）。

| 效果类别 | 例子 | 模型调用策略 |
|---|---|---|
| T0 只读 | get_reading_state、get_passages、search_text | 自动 |
| T1 视口 | go_to_page、show_evidence（多 passage + 主 passage） | 自动，**每次回答最多 1 个**，且自请求发出后用户未接管 |
| T2 临时视觉 | spotlight、临时高亮原文、放大镜（PRD §06） | 自动；用户一接管即清除；不入库 |
| T3 AI 自有批注 | AI 标记（未固定） | 自动写入 AI 层，与用户批注分开显示；用户可“固定”转为自己的 |
| T4 触碰用户/固定批注 | 改、删、移动 | 宿主生成差异预览 → 用户确认（已有 confirmation 绑定机制，需补 UI 与 IPC） |
| T5 导出/网络/设置/付费 | 导出 PDF、换服务、发起额外付费请求 | **模型永远不能发起**，只能建议 |

- actor 由宿主绑定（编辑库已有 `EditActor user|ai`），模型无法冒充用户。

## 5. 模型回合流水线（介入层核心）
```
意图 → 上下文计划 → 预算闸门 → 调用(流式) → 解析输出契约 → 校验 → 所有权复核 → 提交 → 回执/账本
```
1. **上下文计划**：由策略决定（Surfing：全文 + 当前页 + 最近对话；Cruise：问题 + 检索到的段 + 研究路径），统一产出 `ContextPack`，带覆盖报告。
2. **预算闸门**：模型窗口显式配置（不从模型名猜）；本地估算与服务端回报分开记；请求前**预占**持久配额（计划 §5.3）；超限明确失败，不静默截断。
3. **输出契约 v1**（与供应商无关，不依赖原生 tool-calling；规格 §5“输出是数据不是代码”）：
```json
{ "say":      [{"kind":"text","text":"…"},{"kind":"quote","passageId":"…"}],
  "evidence": [{"passageId":"…","role":"primary|support|contrast"}],
  "actions":  [{"type":"show_evidence","passageIds":["…"],"primary":"…"}],
  "next":     [{"label":"接着看实验设置","why":"…","passageId":"…"}],
  "uncertainty": "low|medium|high" }
```
   - `say` 可**流式**显示（解决 Surfing 现在“等半天一次性出来”）；`actions` 只在完整解析后才考虑执行。
   - 未知 passageId、超出白名单的动作、超过 1 个视口动作 → 整个 actions 作废（文字仍可显示并提示“已忽略不可核验的指令”）。
4. **提交**：同一回答里的动作要么全做要么全不做；结果写入会话账本，形成可撤回的回执（T3/T4 复用编辑库的 receipt/undo）。
5. **策略**：`SurfingPlanner`（切入点路线、用户推进）、`CruiseResearcher`（围绕问题多步检索，可提议下一处，但每一步视口移动仍受 T1 规则）。两者只实现“上下文计划 + 提示词 + 如何更新游标”，其余全部共享。

## 6. 呈现层与 Intelligent UI
- 呈现层**只消费输出契约**，不关心来自哪个策略。今天：右侧共读面板（已改成原文为主、输入常驻）。
- **Intelligent UI 的落地方式（建议）：受约束的生成式呈现**——模型不写 HTML，而是在契约里给出“呈现意图”，从一个**封闭词汇表**里选：`card`、`evidence_chip`、`margin_note`、`subtitle`、`nearby_bubble`、`spotlight`、`comparison`、`step_list`。应用决定放在哪、怎么动、何时消失。
  - 好处：模型能“塑造界面”，但不能注入代码、不能挡住原文、可被无障碍工具读取、能被测试。
  - 对应 BACKLOG FUTURE-02（阅读优先、无传统对话框：字幕/邻近气泡/临时原文注记，面板可召回）。底座现在只需保证：输出单元带 `passageId` 锚点、角色和“放置提示”，而不是面板专用的一段文字。
- 用户主权不变：任何呈现都可关、可暂停、不抢焦点、不自动翻页超过 T1 规则。

## 7. 供应商层
- 现有 `ai-client.ts` 5 种 HTTP 协议 + Spark WS 保留。为每个服务档案补一个**能力描述**：`{protocol, model, contextWindow(显式), tokenizer, jsonMode, streaming}`；Surfing 不再只认 openai-chat 白名单 + deepseek。
- **按任务路由**（以后）：快速问答 / 路线规划 / 深度研究可选不同模型；默认同一个。保持 BYOK，你提到的“试 Claude、长期用 GPT”只是不同档案。
- 缓存键：文档 + 锚点 + 模式 + goal.version + 深度 + 服务配置签名（计划 §5.3），不再只按 block.id。

## 8. 记忆
- 现在：对话仅本次打开（6 轮 / 18000 字符）。
- 下一步（建议 11/4 后）：**按文档本地持久**对话与“已读过/已解释过”的记录，用户可一键清除；跨论文记忆、用户思维模型属于远期，不在本底座里预建，但 `ReadingSession.conversation` 与 `ledger` 的结构要能直接落库。

## 9. 生命周期与失败
- 统一错误词表：`*_CANCELED` 一种拼法；`AI_*` 只保留 `ai-client` 真会产生的码。
- 换文档、关标签、关窗口、切后台：全部走 `userTookOver`/`session.end`，保存先于取消的顺序固定（总账 T02–T04 的那类竞态在一个地方处理一次）。
- 超时按“首字超时 + 总时长”两段计，长回答不再被 120s 总超时误杀。

## 10. 隐私与同意
- 同意由**宿主记录**：`{documentFingerprint, profileSignature, scope:'extracted-text', at}`；换服务或换文档需重新同意；可在设置里撤销。
- 账本对用户可见：“本次发送：11 页 / 924 段 / 约 2.3 万 tokens / 服务 X”。

## 11. 评测与可观测
- 三层证据分开写：**离线 mock**（契约、生命周期）/ **真实模型**（语义质量）/ **你的确认**（体验）。
- 金标论文 2–3 篇 + 固定问题集（摘要、与 RNN 区别、“这里”、实验设置），每次改提示词/策略跑一次，记录 passage 命中率、是否越权动作、耗时、费用。
- `scripts/surfing-real-paper-check.mjs`（今晚新增）是离线那一层的雏形。

## 12. 迁移路径（不推倒重来）
| 阶段 | 内容 | 风险 |
|---|---|---|
| **P0：11/4 前（小步、可回退）** | ① 统一接管入口（修 T10）；② 线类型下沉 shared、去掉 renderer 值导入 main；③ Surfing 问答升级到输出契约 v1 的子集：`say` 流式 + `evidence` + **至多 1 个 `show_evidence`**（“AI 带你翻到那里”，用户接管即作废）；④ 账本可见（本次发送了什么） | 低：都在 Surfing 现有链路上，Cruise 不动 |
| P1：11 月 | Session Core 主进程权威、Cruise 重写为策略、单一 passage 层、错误词表、宿主同意记录、能力表 T0–T3、AI 自有批注层 | 中：涉及会话与批注数据 |
| P2：12 月起 | Intelligent UI 呈现意图（字幕/气泡/边注）、T4 确认 UI、对话持久化、按任务路由、白板 | 需真实用户反馈驱动 |

明确不做：通用 agent 平台、插件市场、向量数据库（各文档均已排除）。

---

## 需要你拍板的 7 个决定
1. **原文粒度**：行级 passage + 段级 group 双层？（建议：是）
2. **旧 Cruise**：现在冻结旧逐块界面，等 P1 用新底座重写为“问题驱动研究”？（建议：是，11/4 演示只讲 Surfing）
3. **流式**：`say` 边生成边显示、动作等完整解析后再执行？（建议：是）
4. **契约 vs 原生 tool-calling**：先用供应商无关的 JSON 契约，原生工具调用以后做适配器？（建议：是）
5. **11/4 前模型能否自己翻页**：只允许每次回答最多 1 次 `show_evidence`、用户一碰就失效？（建议：是，演示效果明显，风险可控）
6. **AI 批注**：11/4 前只做 T2 临时高亮，不落库？（建议：是）
7. **Intelligent UI**：采用“封闭词汇表的呈现意图”，而不是让模型生成界面代码？（建议：是）
