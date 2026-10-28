# 交接说明（2026-10-25）

给接手的对话：先读这一页，再读 `docs/product/Enlumor_Product_Plan_v0.5.1.md`（产品设想）。

## 代码在哪
- 第一批改动（审查修复、界面打磨、Surfing 1/4/5、一键 BYOK、多模态看页、带着读、即将推出占位）已合进 `main`（PR #1）。
- 测试基准相关改动在分支 `claude/admiring-brahmagupta-p3zevs`，PR #2 未合并，合不合由用户决定。

## 本地准备
```
git fetch origin
git checkout claude/admiring-brahmagupta-p3zevs
git pull
npm install
npm run build
```
Python 环境用 `setup.ps1`；跑基准还需 `pip install -r requirements-acceptance.txt`（segno、opencv，只用于生成/校验二维码）。

## 测试基准怎么用
- 题目清单（manifest）格式见 `src/shared/benchmark.ts`；示例 `tests/acceptance/attention-benchmark.json`、`lumen-benchmark.json`。
- 生成测试 PDF：`python tests/acceptance/benchmark.py add 论文.pdf 题目.json 输出.pdf [--qr-only]`，在末页加一页二维码（默认同时内嵌一份清单作备用）。
- 软件打开 PDF 时会扫末页二维码（`src/renderer/benchmark-qr.ts`，zxing-wasm 随包，不联网）；识别到就显示"测试基准"横幅 → 进入测试模式 → 勾选确认 → 开始测试，逐项打分。
- 也可整套自动跑：Windows 双击 `真实模型验收.cmd`，报告在 `.cache/acceptance/<时间>/report.html`。

## 下一步（用户要做的）
1. 用 DeepSeek（`https://api.deepseek.com/v1`，模型回车自动选）在 Attention 论文上跑一次真实测试，看报告。DeepSeek 不能看图，看图题会标"需人工确认"，这是预期。
   - 注意：Attention 清单里的期望数字（BLEU 28.4 / 41.8；6 层、8 头、d_model 512）来自论文，但还没对照真实模型回答核对过。
2. 根据报告修 Surfing 的回答质量问题。
3. 之后的功能（已有"即将推出"占位，等资金）：AI 标注、深入阅读/新 Cruise、跨论文记忆、MCP/读 PDF 技能。
- 截止：11 月 4 日前全部推出。

## 测试现状
- `npm run typecheck`、`npm test`：44 个文件 / 658 项全过。
- 端到端（`npx playwright test`，Linux 用 xvfb）：170 过 / 3 败。3 个失败是已知环境问题，旧代码一样失败：打包版 exe 测试、两个 dense-ink 1000 笔的长任务门槛。

## 坑
- 端到端测试会改动 `evidence/` 目录，跑完用 `git checkout -- evidence; git clean -fd evidence/` 还原，不要提交。
- `tests/cruise-takeover.test.ts` 依赖 `main.tsx` 里 effect 的顺序（第一个必须是阅读器 effect），新加 effect 放在 JSX return 前面。
- 二维码必须画成单一矢量路径；位图或逐格方块都会解不出。jsQR 解不了大二维码，所以用 zxing。
- API 密钥只能放环境变量或软件自己的加密存储，绝不写进文件、提交或日志。
