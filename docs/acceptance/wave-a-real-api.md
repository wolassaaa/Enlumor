# Wave A / A1：真实 API 闭环与错误恢复验收

## 状态

- 自动化准备：已运行本地 fixture 单元测试、构建和 Electron 验收；实际结果见 `evidence/v04-wave-a/A1_*.txt`。
- **真实服务验收：NOT EXECUTED（未执行）。A1 整体门槛保持未完成；A 阶段不发布，B 阶段不启动。**
- 用户提供厂商 `deepseek`、显示名称 `DeepSeek v4.1 flash`。该名称不是已验证的 API 模型 ID；本轮没有据此猜测或替换模型 ID。
- 用户随后提供下载目录中的《Attention Is All You Need》；已定位11页真实PDF并完成本地阅读/标题锚点核验。用户明确表示DeepSeek连接尚未测试；本轮没有读取个人凭据或发起真实厂商请求。
- 本地 fixture 的通过只证明自动化准备，不证明真实厂商、模型或真实论文闭环通过。

## 已验证的自动化行为

- 主进程收到空或纯空白的成功返回时发出 `AI_INCOMPLETE`，不发出 `done`。
- 本地 HTTP fixture 覆盖空回答、429、断流、部分回答后超时；错误不写入成功结果，保留手工重试入口。
- 手工重试成功后同一个块仅保存一份成功结果；失败的部分文本不拼入重试答案。
- 暂停后的旧 delta/done 即使忽略 abort 仍不覆盖暂停状态；原有 requestId 接口不变。
- Electron fixture 检查重试不新增或改变用户批注、原 PDF SHA256 不变、暂停/恢复不重复发送；既有引用定位、滚动接管、退出和重启恢复 paused 场景继续执行。
- 六类协议保持原实现；本次没有基于未发生的问题扩展协议。

## v0.5.1 Task 1：当前原文追问的输入与外发范围

- 普通解释仍发送原有 `{blockId,text}` JSON；追问沿用同一 `requestId`、文本事件和单一活动请求槽，不新增协议或远程检索。
- “当前原文追问”只接受 1–1000 字符且非纯空白的问题；主进程在锚点验证和生成前拒绝畸形输入、非字符串问题、超长问题，以及非字符串或超过 8192 字符的 `previousAnswer`。
- 追问只发送 `{blockId,text,question,previousAnswer?}`：当前块原文（最多 1200 字符）、本次问题及当前块已完成普通解释的最多前 8192 字符。没有已完成解释时不发送 `previousAnswer`；失败或取消的 partial 不作为成功历史。其他块、其他页、整篇 PDF、之前的追问回答不外发。
- 固定说明将 `text` 视为原文证据，将 `previousAnswer` 标为先前模型解释摘录、不是原文且不保证正确；问题也不是系统或操作指令。界面显示外发范围及“解释摘录不是原文”。
- “提交追问”后在独立“追问回答”区域流式显示；“取消追问”或 429、超时、断流后保留问题，仅点击“重试追问”才再次发送。原普通解释保留，追问不写入 `results[blockId]`、会话或批注；关闭组件后完整问答消失。
- 普通解释与追问互斥。追问响应绑定请求 ID、reader/epoch、文档、当前块及服务；切块/服务/文档清除追问，暂停/设置/后台/卸载先取消并使旧流失效。暂停或设置后保留的问题需手动重试。
- 本地 fixture 检查流式追问、上下文上限、错误恢复、旧事件抑制，以及普通解释缓存、批注、源 PDF 哈希保持不变；执行记录见 `evidence/v051-wave-a/TASK1*.txt`。这些检查不替代真实 DeepSeek 验收。

## 真实验收开始条件

1. 在隔离验收实例中配置真实服务；由用户确认厂商、服务端点、精确 API 模型 ID，以及允许发送当前块。
2. 用户选择一篇获准使用的真实论文。先记录原 PDF SHA256、文档指纹和已有批注快照；不记录密钥或原始认证头。
3. 使用独立 userData，不打开、迁移、覆盖或降级个人数据库。真实 PDF 保持只读。

## 待执行检查表

| 顺序 | 操作与预期 | 当前结果 |
| --- | --- | --- |
| 0 | 确认精确 API 模型 ID，手动测试 DeepSeek 连接；不将本地 fixture 当作真实连接 | NOT EXECUTED |
| 1 | 确认仅当前块外发；解释当前块得到非空完整回答，并记录来源 | NOT EXECUTED |
| 1a | 输入当前原文问题并提交，核对仅当前块/问题/已完成解释摘录外发；追问流式回答且普通解释仍保留 | NOT EXECUTED |
| 1b | 取消或暂停追问，旧流不改答案；保留问题、仅手动重试；追问不写入解释缓存和批注 | NOT EXECUTED |
| 2 | 点引用或返回当前原文，核对锚点页码与引用文本 | NOT EXECUTED |
| 3 | 滚动接管后保持 paused，旧流不改变答案；手工恢复 | NOT EXECUTED |
| 4 | 模拟断网，错误不显示成功；恢复网络后仅手工重试，结果不重复 | NOT EXECUTED |
| 5 | 退出 Cruise 回 Reader，原有批注仍在 | NOT EXECUTED |
| 6 | 退出应用后重启，恢复为 paused，不自动发送请求 | NOT EXECUTED |
| 7 | 再算 PDF SHA256 与批注快照，核对原文和批注未被改变 | NOT EXECUTED |

## 真实执行记录模板（只写实际观察，不记录密钥）

```text
结果: PASS / FAIL / NOT EXECUTED
服务厂商 / endpoint origin:
精确 API 模型 ID:
模型显示名称:
用户确认当前块外发的时间:
文档指纹 / 原 PDF SHA256（前 / 后）:
测试时间（含时区）:
解释块 ID / 锚点页码:
当前原文追问 / 外发字段核对 / 追问回答结果:
追问取消或暂停 / 问题保留 / 手动重试 / 普通解释缓存核对:
引用定位结果:
滚动接管 / 暂停后旧流结果:
断网错误 / 手工重试结果 / 成功结果条数:
退出 Reader / 重启 paused 结果:
批注前后核对结果:
失败项与恢复结果:
```

## 本轮结论

真实执行字段全部待填。模拟测试与真实 API 验收分开记录；完整打包、独立 review 与真实验收门槛另行完成，本轮没有发布。

## 真实论文的本地检查（不等于真实API验收）

- 文件：C:/Users/woola/Downloads/NIPS-2017-attention-is-all-you-need-Paper.pdf；11页，569417字节。
- SHA256：d87d482d5ae7960e2e43d7dd6d21377e60e73e8fce1bf2a01aff7aca8a08c537，检查前后相同。
- `node scripts/check-wave-a-paper.mjs <明确PDF路径>`：真实Electron打开，Cruise手动定位标题，PyMuPDF verify-block验证实际文字/四边形；临时userData，无远程请求。
- 实际结果：PDF_READ=PASS / ANCHOR_VERIFIED=PASS / MANUAL=PASS / REMOTE_REQUESTS=0 / SOURCE_UNCHANGED=YES。
- 仅验证当前标题块，不宣称全部论文锚点或语义回答通过；上方真实API全部检查仍NOT EXECUTED。
