# Enlumor Surfing 交接 · 2026-10-24 · 修复版为准

## 先看结论
**当前交接对象是 Surfing-Repair，不是早期 T5b 候选。** 基础流程与后续“全文对话＋原文旁共读”修复已实现和打包；用户对新修复版的实际试读结果仍待收集，不等于产品体验已获认可。
唯一工作树：`D:/codex project/Enlumor/.worktrees/v04-wave-ab`。分支 `feat/v04-wave-ab`，HEAD `ac6d4ac6d8e31342332a1601a8ba46470c2a325f`。工作树含既有编辑集成与Surfing未提交改动，不是干净分支；本轮没有提交/推送/发布，也没有清理这些改动。

## 1. 唯一当前测试入口
[双击开始测试](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/Surfing-测试入口.cmd) → [实际启动器](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/OPEN-REPAIR.cmd)。

[实际修复包](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/MODIFIED_FILE/win-unpacked/Enlumor-Surfing-Repair.exe)；必须保留整个 win-unpacked 目录，不能只搬exe。独立测试数据位于同一修复证据目录的 `user-data`；没有迁移个人库或旧候选密钥，首次需配置模型。当前打开的修复版窗口保留，未强制关闭。

旧 `T5b-negatives/OPEN-CANDIDATE.cmd` 与 `T5-package` 仅供历史对照，**不要用来验收本轮修复**。正式0.1.15及release未替换。

## 2. 用户反馈与已确认方向
用户截图显示旧Cruise仅把论文标题发给模型，回答“abstract没有提供”；大面板又将原文挤到下方。用户明确否定该体验，并确认：打开论文后能直接说“带我读懂这篇”，结合整篇结构与当前阅读位置探索，随时插话并承接前文，而非管理阅读块或路线。
[原始反馈截图](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-handoff-2026-10-24/USER_FEEDBACK.png)。

## 3. 当前实现与边界
- **全文提问**：`askSurfing / surfing:ask / SurfingRequests.ask` 独立于路线生成。每次带可信本地全文、当前页、同一文档/模型的最近成功对话；不是仅发标题块。
- **对话记忆**：主进程维护，最多6轮且JSON累计18000字符；只保留验证过的完成回答。取消的迟到结果不入记忆；换文档/服务隔离，修改同一模型配置须重新准备。
- **原文旁共读**：右侧面板，原文保持左侧主视图；打开时隐藏批注栏并适宽。每个回答有1–8处已知来源ID，显示页码按钮，点击后定位。旧Cruise明确标为“逐块阅读（旧）”。
- **两条路径分开**：可直接提问/点“带我读懂这篇”；探索路线为可选。原有继续/跳过/回看/暂停与路线保存恢复保留。
- **发送仍需确认**：准备全文仅本地处理；模型与上下文窗口显式配置，用户确认全文发送范围后才请求。
- **模型预算**：已识别OpenAI Chat模型使用o200k；DeepSeek Chat/Reasoner经OpenAI Chat兼容协议，以UTF8字节数+4096做保守预算，非精确token数，不自动推断窗口。
- **尚未实现/未证明**：对话只保留本次打开，不持久化；不是无限记忆、自动导航代理或任意协议通用支持。图表/扫描件视觉理解、跨论文、SaaS/计费未加入。证据ID合法不等于模型语义正确；实际服务质量仍待用户试读。

## 4. 验证账本（时点分别记录）
|对象|实际结果|解释|
|---|---|---|
|修复版冻结源单测|39文件 / 619通过|FROZEN-UNIT.txt；本轮交接只校验日志与hash，不重跑长套件|
|修复版build/package|退出0|独立产品/包名，旧候选保留|
|实际修复包Surfing专项|15通过，约1分钟|PACKAGED-E2E.txt；含DeepSeek本地mock整篇提问、历史、当前页、证据定位、适宽、取消和恢复负例|
|隔离来源回退|14原文件hash恢复；旧相关56测试通过|活源与新候选保留|
|中间版本大输入专项|17项通过|含42页96096字符/86页超限；不是最终修复包全量门禁|
|历史完整旧候选回归|165项：164通过/1失败|旧editing-preview dense1000：1273ms>1000ms、worst62ms>50ms；本轮未修复/未重跑整包|
|Python|历史21通过|本轮Python源及worker未改；不是交接时新跑|
|真实模型＋两篇论文|NOT EXECUTED／待用户记录|不以本地mock替代阅读质量验收|

[修复验证原文](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/VERIFICATION.txt) · [修复差异](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/DIFF_FILE.patch) · [修复源码快照](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/SOURCE_SNAPSHOT.zip) · [修复候选SHA清单](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/CANDIDATE_FILES.sha256) · [修复操作说明](D:/codex%20project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-repair-2026-10-24/README.md)。

## 5. 接手后优先做什么
1. 先核对修复入口与候选hash，不重做夜间T1–T5，也不拿旧窗口测试新修复。
2. 收集用户对修复版的实际阅读反馈。用两篇实际论文：停在标题问摘要→追问“它与RNN有什么不同”→核对引用→打断/暂停→测试路线恢复。记录具体原文、期望、实际回应及操作顺序。
3. 区分上下文漏传、原文定位、模型语义、界面交互四类问题；只对一条可复现失败先RED、最小修复、GREEN、回归、独立打包和隔离回退。
4. 对话持久化/更主动带读等需求先向用户展示具体交互，获得方向确认，再实施；不要把更多测试通过等同于更符合用户心中体验。
5. 11月4日目标先证明可重复、可理解、有价值的单篇阅读闭环。真实反馈未通过前不扩SaaS、计费、跨论文或复杂AI编辑。

## 6. 协作状态
夜间自动化 `20min-enlumor-2` 当前PAUSED，交接未恢复它。当前无新实施任务或在途测试/打包；用户测试窗口可以保持打开。已有review agent完成的是夜间只读审查，不应当作本轮修复的独立评审通过。旧Escape接管只取消旧host问题仍为历史Minor，本轮使用Surfing暂停入口。

## 7. 可直接粘贴给接手者
```text
接手Enlumor基础Surfing，只用D:/codex project/Enlumor/.worktrees/v04-wave-ab。先读docs/SURFING_HANDOFF_2026-10-24.md、docs/WAVE_A_STATE.json和evidence/surfing-repair-2026-10-24/VERIFICATION.txt，核对Git差异、在途任务与修复包hash。最新入口是根目录Surfing-测试入口.cmd，实际包名Enlumor-Surfing-Repair；T5b是历史候选。用户已否定旧逐块聊天体验，要求整篇理解、原文旁共读、随时插话和上下文承接。当前619单测及实际修复包15项本地mock专项通过；真实模型、两篇论文和用户体验尚待验收，对话仅本次打开保留。先接用户实际反馈，不重做已有实现、不扩新功能；具体失败先RED再最小修复、GREEN、包内回归、留hash/diff/原样日志和隔离回退。没有用户明确操作不读个人密钥、不调用付费API；不覆盖正式0.1.15、个人库或其他工作树，不提交/推送/发布。保持夜间自动化PAUSED，不强制关闭用户测试窗口。别把测试通过当作体验已获用户认可。
```
