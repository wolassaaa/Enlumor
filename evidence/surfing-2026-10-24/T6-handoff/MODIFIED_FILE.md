# 基础 Surfing 夜间交接 · 2026-10-24

## 当前结论
基础 Surfing 的离线候选闭环已有实际 Electron 本地 mock 证据；真实模型质量、两篇真实论文与正式发布门禁尚未完成。这三项不混作同一个“完成”。本交接只整理证据，不改变生产代码、候选字节或既有验收门槛。

## 从哪里打开
[打开独立候选](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T5b-negatives/OPEN-CANDIDATE.cmd)。此入口固定独立 user-data；保留整个 win-unpacked 目录，不单独搬走 exe。候选名称为 Enlumor-Surfing-Candidate；正式 0.1.15 未替换。

## 规格 → 实现 → 证据

|链路|实现及已验边界|原样证据|
|---|---|---|
|可信本地全文|本地主进程导出、指纹与几何核验、包含空页；超限不截断后继续|[T3A-source/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T3A-source/VERIFICATION.txt)|
|有证据切入点|最多5项，严格JSON和已知段落ID；发送全文须显式同意，未知容量/模型失败关闭|[T3B-budget/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T3B-budget/VERIFICATION.txt)|
|原文定位与解释|复用原生文档命令，先选切入点再定位；解释只接受验证过的证据|[T3C-ui/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T3C-ui/VERIFICATION.txt)|
|继续/跳过/回看/暂停|无自动播放；缓存回看无请求；关闭/切标签先取消，拒绝迟到结果|[T5-lifecycle/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T5-lifecycle/VERIFICATION.txt)|
|持久恢复|SQLite提交后才显示已保存；重新核验指纹/模型；恢复暂停、不同意发送、不自动跳页；失败可重试|[T4-combined/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T4-combined/VERIFICATION.txt)|
|负例|来源替换零请求且SOURCE_CHANGED；模型签名隔离、主进程后台处理、保存失败关闭保护|[T5b-negatives/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T5b-negatives/VERIFICATION.txt)|
|大输入|42页924段96096字符，三次全量请求逐段核页码/文本；86页196768字符超限零请求|[T5c-large/VERIFICATION.txt](D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/surfing-2026-10-24/T5c-large/VERIFICATION.txt)|

## 测试读数与尚存缺口
- 最近单测原样记录：39文件 / 608通过；Python 21通过；typecheck通过。这些是对应日志时点结果，不是本交接重新跑了一次测试。
- 当前候选最近完整包内165项：164通过 / 1失败。失败是既有 editing-preview dense1000：eraseUndo 1273ms >1000ms，mutation worst 62ms >50ms。门槛未放宽，整包不是全绿。
- 大输入测试新增后，相关包内20项通过（Surfing16项、既有文档命令4项），增强大输入断言后2项再次通过；新增后的167项全套未重跑。14个生产源文件和264个候选文件hash在交接时重新核验。
- text/scan默认阅读器基准通过原门槛，不代表大输入Surfing或密集编辑性能通过。大输入耗时包含Playwright和mock等待；renderer帧观测无新增性能门槛。
- 合成单栏ASCII不是论文；定位测试检查几何重叠，不等于所有版式精确覆盖。后台用真实main处理器注入，不是OS真实切后台；模型变更通过IPC，不是设置页全交互。
- Escape仍只暂停旧host，记为Minor；使用Surfing暂停入口。未为凑进度扩展快捷键。
- 真实模型与两篇真实论文：NOT EXECUTED。无付费调用；没有用mock代替语义质量验收。OCR/扫描件无文字、跨文献、SaaS与计费未加入本次基础范围。

## 用户验收与下一优先级
1. 用独立入口打开两篇实际论文，先准备本地全文，核对页序、空页、缺段和原文定位。
2. 用户选择实际服务/支持模型/窗口并明确同意后，逐条检查切入点的阅读价值、解释忠实性与证据相关性；记录服务、延迟、费用和错误原文。
3. 走完继续、跳过、回看、暂停、已保存、重启恢复；恢复后应保持暂停，主动再同意才请求。
4. 对一个具体失败写RED再最小修复；独立处理旧密集编辑性能门禁，不能用基础Surfing通过掩盖它。
5. 11月4日演示以可重复的单篇闭环和明确真实验收记录为目标；先拿证据，再评估赞助和后续SaaS，不扩大本轮范围。

[逐项人工验收表](D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/acceptance/surfing-overnight-2026-10-24.md)；[完整夜间进度](D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/SURFING_OVERNIGHT_2026-10-24.md)；[机器状态](D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/WAVE_A_STATE.json)。

## 接续提示
```text
只在 D:/codex project/Enlumor/.worktrees/v04-wave-ab 接续。先读本交接、夜间计划和WAVE_A状态，核对Git差异、当前候选hash与在途任务。不要重做T1—T5c。针对真实论文验收中的具体失败先RED再最小修复、GREEN、回归及隔离副本回退；保留原hash与原样日志。真实模型验收单独记录，不自动付费调用，不读个人密钥，不提交/推送/发布。07:30后只测试、记录和收口；08:00停止实施并暂停原20min-enlumor-2自动化，不提前暂停、不新建重复自动化。
```
