<p align="center"><img src="docs/assets/github/hero.svg" width="100%" alt="Enlumor：读得深入，想得更远。发光书页品牌横幅。" /></p>

# Enlumor

**让阅读安静一点，让思考延续下去。**

本地优先的学术 PDF 阅读应用，把阅读、批注与可选的段落级 AI 放在原文旁边。[English](README.md)

## 最新开发快照 · 2026年10月24日

`main` 已同步编辑库接入与 **Surfing 全文共读**源码：在明确确认全文发送范围后，结合全文、当前页和本次会话的近期对话进行提问。它与旧版逐块 Cruise 分开。

本次是开发源码同步，**不是新的正式安装包发布**；下文正式 Windows 版本仍指0.1.15。能力、验证及未完成验收见[当前开发状态](docs/CURRENT_DEVELOPMENT.md)。

## 先把阅读做好

普通阅读不需要账户、云服务或 API Key。你可以搜索、跳页、缩放、旋转，使用标签页和缩略图；通过高亮、下划线、删除线、便签、箭头与画笔留下想法。批注和阅读位置保存在本地 SQLite 工作区，支持撤销、重做与恢复。

批注可以导出为**独立的 PDF**，原文件不被覆盖。Windows 发布包内置 PDF 处理程序，无需另装 Python。

<img src="docs/assets/github/reader-windows-0.1.15.png" width="100%" alt="Windows 0.1.15 真实运行界面：演示PDF、正文高亮和右侧已保存批注。" />

*截图来自 Windows 0.1.15 发布验证，使用自建演示 PDF；不是生成的界面、用户测试或真实 AI 回答。保留该版本当时的界面标识。*

## AI 是选择，不是门票

- **自带密钥（BYOK）**：你选服务商、填密钥，并向服务商支付推理费用。
- **围绕当前段落**：Cruise 共读发送当前阅读块，不上传整份 PDF；启用 AI 时，该上下文可能离开设备。
- **保留主动权**：暂停、取消、手动接管、回到原文；对取消和过期响应设置隔离。
- **测试边界如实写**：本地契约和模拟服务测试不等于每家厂商的真实密钥实测，配置细节见[接口兼容矩阵](docs/API-COMPATIBILITY.md)。

当前正式 Windows 版本为 **0.1.15**，包含阅读与批注底座、Cruise 控制和模型配置。后续候选分支的来源校验和独立编辑库不自动算作正式版已集成。真实模型服务、AI 流式输出和导出并行时的前台阅读体验，仍需按实际环境验收。

长远愿景是理解并延伸用户思考的认知伙伴。持久思维模型、跨文献研究记忆是方向，不是已经实现的能力。

## 启动与开发

已有本地验证版：解压 ZIP，运行 `Enlumor.exe`。开发仓库中的 `启动 Enlumor.cmd` 跟随 `release/latest.json` 指向的本地版本。本说明不代表 GitHub 已上传公共下载包。

从源码构建需要 Windows、Node.js 24+、Python 3.10+，首次安装需要网络：

```powershell
git clone https://github.com/wolassaaa/Enlumor.git
cd Enlumor
.\setup.ps1
npm start
```

开发使用 `npm run dev`；修改主进程后重启开发命令。

```powershell
npm run typecheck
npm test
npm run test:python
npm run test:e2e
```

`npm run release:verified` 在暂存包通过功能和性能门禁后才更新发布指针。历史测试数量与性能结果只对应记录时的环境和样本，不作为普遍性能保证。

## 当前边界与许可

不打开加密 PDF；扫描页可读，但不提供 OCR、文字选择或搜索。不做白板或完整绘画软件，不覆盖原 PDF 内容。macOS 尚未完成构建验收；iPad 需要独立客户端。前台响应是工程目标，不承诺所有电脑和文档都零延迟。

项目坚持开源方向，不以强制订阅为前提；普通阅读与可选 AI 分开。**项目级开源许可尚未选定**，不可默认按 MIT 等许可使用。PyMuPDF 采用 AGPL／商业双许可，分发前需处理项目和依赖许可。

## 继续了解

[功能交付清单](docs/FEATURES.md) · [实现记录](docs/IMPLEMENTATION.md) · [Review 节奏](docs/REVIEW-CADENCE.md) · [归档开发说明](docs/DEVELOPMENT_NOTES.zh-CN.md)

反馈请描述可复现的阅读任务、应用版本和预期行为；不要公开密钥或私有文档。
