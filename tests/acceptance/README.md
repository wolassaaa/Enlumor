# 真实模型验收 / Benchmark

用你自己的服务和 key，在一篇**自带测试题**的论文上自动跑完 Surfing 的全部检查，生成网页报告。

## 一键运行（Windows）

双击仓库根目录的 `真实模型验收.cmd`，按提示填接口地址、模型（可留空自动选择）和 API 密钥（输入不显示）。

- 下载文件夹里有 *Attention Is All You Need*（文件名含 `attention` 或 `1706.03762`）时，用它和 `attention-benchmark.json`；
- 否则用内置的测试论文和 `lumen-benchmark.json`。

跑完自动打开 `.cache/acceptance/<时间>/report.html`：每项检查的结果、模型原话、报错码、耗时和截图。报告和历史记录都**不含 API 密钥**。

## 基准 PDF：二维码里装着测试

基准 PDF = 论文 + 末尾一页二维码。二维码和 PDF 内嵌文件 `enlumor-benchmark.json` 是同一份清单（问题、预期答案、哪些检查需要看图），所以**打开这份 PDF 就知道要测什么**。

```sh
# 把任意论文做成基准（会校验二维码能解回清单）
python tests/acceptance/benchmark.py add paper.pdf my-benchmark.json paper-benchmark.pdf   # 加 --qr-only 则只印二维码，不附内嵌清单
# 读出一份基准 PDF 里的清单
python tests/acceptance/benchmark.py read paper-benchmark.pdf
```

清单格式见 `lumen-benchmark.json`：`ask`（提问，`expect` 里用正则写 `all` / `any` / `none`，以及是否要求原文证据、中文回答；可分别为能看图和只读文字的模型写 `vision` / `textOnly` 预期）、`route`（生成切入点）、`guided`（带着读）。

## 命令行

```sh
ENLUMOR_ACCEPTANCE_ENDPOINT=https://api.openai.com/v1 ENLUMOR_ACCEPTANCE_KEY=... \
ENLUMOR_ACCEPTANCE_PDF=paper.pdf ENLUMOR_ACCEPTANCE_MANIFEST=tests/acceptance/attention-benchmark.json \
npm run acceptance
```

每次的得分追加到 `.cache/acceptance/history.jsonl`，报告里会列出同一基准最近几次的得分，方便比较不同模型和版本。
