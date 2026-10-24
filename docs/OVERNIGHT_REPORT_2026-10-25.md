# 夜间报告 · 2026-10-25（Claude 接手 Codex）

## 先看这三件事
1. **试读**：双击 `Surfing-测试入口.cmd`（已指向新候选 Enlumor-Overnight），按 `docs/MORNING_TRIAL_2026-10-25.md` 走 15 分钟。只有真模型 + 你的判断能关掉总账里的 U01–U08。
2. **审设计**：`docs/superpowers/specs/2026-10-25-reading-companion-foundation-design.md` 末尾 7 个决定，每个回“是/否/改成…”即可。
3. **看界面**：新视觉与 logo 是否是你要的（前后对比图：`evidence/overnight-2026-10-25/02-redesign/before|after-v2/`）。

## 做完了什么（都有证据，阈值未放宽）
| 事项 | 结果 | 证据 |
|---|---|---|
| 接手基线 | 本地备份分支 `backup/overnight-baseline-2026-10-25`；你的分支未提交、未推送 | `01-baseline/`（623 单测、21 Python、tsc 0） |
| T05 密集笔迹擦除/撤销门禁 | **修复**：预览 1000 笔 1420ms → ~750ms，最长任务 75ms → 0；dense 全 6 项通过 | `evidence/dense1000-fix-2026-10-25/` |
| 前端重设计（你的新需求） | 按品牌色重做：暖纸底、墨蓝文字、蓝色操作、琥珀色只给 AI；Surfing 输入框常驻底部；顶栏不再是黑块 | `02-redesign/` |
| Logo（你的新需求） | 用批准的 logo-v1 浅色版；**拆分用法**：左蓝页=你的批注、右暖页=Surfing、中缝发光=AI 思考中 | 同上 |
| T10 Esc 不能暂停 Surfing | **修复**（先写失败测试再修） | `03-escape-*.txt` |
| 真实论文离线核对 | Attention 论文：停第 1 页问摘要，发出的内容包含摘要原文（11 页/662 段全发）；内部 ID 不显示；追问带上一轮；“这里”=当前页；暂停后无迟到回答 | `04-real-paper/RESULTS.json` |
| 新候选包 Enlumor-Overnight | 打包全量 e2e：168 过 + 1 项挂起重跑 3/3 过；文本/扫描 × 普通/编辑预览 4 项性能全过；包与源码构建 0 不一致 | `05-candidate/VERIFICATION.txt` |
| 共同底座 + 模型介入层设计 | 设计稿 v0：12 个面、权限分级 T0–T5、输出契约、Intelligent UI 落地方式、三阶段迁移、7 个待拍板决定 | `docs/superpowers/specs/2026-10-25-…` |
| Skills / MCP 同步 | 从 Codex、`.agents`、`.dsh` 补装 40 个 skill；MCP 加了 xiaohongshu、clash_verge_private、playwright、context7（重启 Claude Code 后生效） | `~/.claude/skills`、`~/.claude.json`（已备份） |
| 文档 | 问题总账、交接、状态文件已更新；新增 N01–N03、P03 | `docs/SURFING_ISSUES_2026-10-25.md` |

## 没做 / 不能替你做
- 没调用任何真实模型 API，没读你的密钥。
- 只有一篇真实论文（Attention）；第二篇需要你挑。
- 没有改正式 0.1.15、你的个人库、原 PDF；没有提交到你的分支、没有推送、没有发布。
- 没装 `.dsh` 里的 `dsh-infinite-gen-4`：它自述是“系统提示词注入”的越狱插件。Codex 的 `gpt-5.6-sol-unrestricted` 指令文件同理没搬。
- Windows 图标（.ico）没换：品牌说明要求单独做打包图标变更。

## 需要你知道的
- 夜里一度有两个代理（Codex 与我）同时写同一个工作树；总账 T11（dist 与包不一致）就是我那次重建造成的，已查明并用新候选给出一致性证据。以后建议同一时间只让一个代理动手。
- 全量 e2e 里有 3 项偶发（文件锁、计时、一次挂起），都已重跑通过并原样留档，没有当成通过隐藏。
