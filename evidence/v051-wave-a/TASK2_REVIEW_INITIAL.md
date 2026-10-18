### Spec Compliance

- ❌ Issues found — Important [P2]: D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/main.tsx:305,314 的批注侧栏 capture 未覆盖独立浮动选区工具；“手动批注撤销晚追问控制”仍有遗漏，见下方问题。
- ✅ 本次改动限定为 main.tsx 回调接线、19 项 Electron 回归和能力矩阵；沿用 takeover/finite ReadingCommand，未新增 bus/schema/polling 或改写 UI。证据：D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/main.tsx:37,90,266,279,290,292,295,304–305；D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/acceptance/wave-a-controls.md:5–20。
- ⚠️ Cross-task gate：独立候选 EXE、无外部 Python、真实论文本地、双 200 页/32 MiB/1000 批注及 startup median≤1500ms/frame p95≤34ms/save p95≤20ms/canvas≤30/thumb≤8、四件回退证据及副本恢复、真实 DeepSeek 全闭环、独立 aggregate reviews、自动任务暂停/最终发布均由 controller 验收；本 diff 不构成这些项目完成的证据。D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/acceptance/wave-a-controls.md:16,35。
- ⚠️ 1000 字问题、8192 字 previousAnswer、当前 verified block 归属，以及后台/服务/设置/退出失效和旧 auto→manual/paused 恢复主要属于 Task1/未改代码；此包只显示既有失效测试上下文，最终合并/候选验收仍需归属对应门槛。定点检查确认 CruisePanel.tsx:21–31 仍沿用既有 job ownership 和输入截断。

### Strengths

- ✅ 非空选区才通知接管，空回调不反向暂停 Cruise 自身定位；缩放/阅读模式、搜索、divider 复用已有入口。D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/main.tsx:90,279,290,292,304。
- ✅ 测试在真实 Electron/SSE 路径收到 partial 后执行用户控制，并注入旧 requestId 的 delta/done/error；检查 viewport、原解释、追问问题、cache/来源、原 PDF hash 和请求次数。D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/e2e/cruise.spec.ts:155–188。
- ✅ 能力矩阵明确区分已有、缺口和真实 API 未执行，没有把 fixture 当作真实验收。D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/acceptance/wave-a-controls.md:5–20。

### Issues

#### Critical (Must Fix)

- 无。

#### Important (Should Fix)

- [P2] D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/main.tsx:305,314 — 浮动选区工具与 .annotations 是兄弟节点，不经过新增批注 capture。可先选择原文，保持选区开始/重试追问（paused 状态允许 ask），收到 partial 后点击浮动工具的“高亮/下划线/删除线/写便签”；这些动作直接进入 add/openNote，commit 完成时仅 setParts([])，不会更新 takeover。CruisePanel 的 followText 仅校验 job/epoch/block/profile/document/reader，故旧追问仍被接受，没有实现批注操作撤销其控制权。应将浮动工具接入相同 takeover，或在实际批注命令入口撤销；补充“已有选区 → 开始追问 → 浮动工具批注 → 晚 delta/done/error”的回归，而不只在追问期间重新选区或点击侧栏。定点调用链证据：main.tsx:180–201,247–250；CruisePanel.tsx:21–31。现有 tests/e2e/cruise.spec.ts:158–169 的 annotation 用例只点击侧栏“应用颜色”，selection 用例则因重新选区提前取消，均未覆盖该时序。

#### Minor (Nice to Have)

- [P3] 保留并标记已有非失败噪声，不能将最终输出称为 pristine：D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/v051-wave-a/TASK2-unit-FULL.txt:8 的 SQLite experimental、TASK2-electron-GREEN.txt:6 的 NO_COLOR/FORCE_COLOR 冲突、TASK2-build.txt:18 的 >500 kB chunk 提示及 TASK2-diff-check.txt:1 的 CRLF 转换提示。环境/构建维护时消除可控噪声，或为已知项保留明确基线；本次未据此增加阻断问题。

### Assessment

- **Task quality: Needs fixes.** 主路径接线简洁且晚事件回归扎实，但浮动选区批注仍绕过接管边界，修复并验证该时序后再过本地 task gate；整轮候选及真实 API gate 继续保持待验收。
- **Checks:** 阅读 task brief/report/review package；首次合并工具输出被截断后仅恢复缺失的 diff 前段和报告尾段。未重跑 git 命令或测试套件；针对“浮动工具是否绕过接管”这一具体风险，仅定点查看 add/openNote/commit 与 CruisePanel ask/followText 调用链，未遍历代码库。
- **Evidence inspected:** TASK2-unit-FULL.txt:21–22 为 21 files / 152 tests passed，EXIT: 0；TASK2-electron-GREEN.txt:64 为 49 passed (2.7m)，EXIT: 0；TASK2-build.txt:16 为 built in 318ms，EXIT: 0。此为既有执行记录，不是本 reviewer 新运行结果。

