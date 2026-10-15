# Enlumor

Windows-first, local-first PDF reader foundation. Electron + React + TypeScript + PDF.js; SQLite workspace; PyMuPDF native annotation export. No account, cloud service or AI dependency in this phase.

## 启动

项目目录：`D:\codex project\Enlumor`

```powershell
cd 'D:\codex project\Enlumor'
.\setup.ps1       # 首次安装，需 Node 24+、Python 3.10+ 和网络
npm start          # 启动已构建的桌面应用
```

开发：`npm run dev`。主进程修改后需重新启动开发命令。

推荐发布：`npm run release:verified`。全部测试及暂存包性能门禁通过后生成 ZIP 和解压目录；双击 `启动 Enlumor.cmd` 使用 latest.json 指向的已验证版本。ZIP 解压一次后启动，比每次自解压的便携 EXE 更快。`npm run portable` 保留为手动构建，不经过完整发布门禁。

**0.1.1 已内置 PDF 处理程序**。可直接双击 `D:\codex project\Enlumor\release\Enlumor 0.1.1.exe`，无需安装 Python、配置环境变量或经过启动脚本。旧的 0.1.0 缺少这一组件，请使用新文件。

仅开发/重新构建需要 Node 和 Python。`setup.ps1` 安装 requirements-build.txt；打包命令通过 PyInstaller 收集解释器、PyMuPDF 和依赖到应用资源目录，运行时优先使用内置程序。Windows 构建不作为 macOS/iPad 的二进制包使用。

0.1.7 新增删除线选区和直线拖拽（含标准 PDF 导出）；点击右栏“直线”后页内拖动，Esc 取消，有效绘制完成后退出；短点击可继续绘制。保留连续/单页模式、下划线及每文档恢复。保留 0.1.5 的侧栏调宽/间距与多文档标签。拖动侧栏边缘或聚焦后按方向键；顶栏“布局”选择阅读间距。Ctrl+Tab 切换标签、Ctrl+W 关闭当前标签；关闭标签不删除文档。便签编辑时先保存/取消再切换。保留此前按需缩略图、目录与性能优化；最新执行状态与逐项功能清单见 [docs/FEATURES.md](docs/FEATURES.md)。

## 已有功能

- 打开文本型 PDF、连续阅读、原文选择、全文搜索与命中定位、页码跳转、缩放、适宽/适页、旋转。
- 暖白纸面与深墨工具栏；顶栏按钮收起/展开文档与批注侧栏。选区旁提供高亮/便签浮栏；滚动、缩放或布局改变后关闭旧浮栏，避免遮挡无关正文。
- 多行/跨页选区高亮、选区便签、颜色修改与删除；跨页操作一次撤销，支持重做。
- 自动保存批注与阅读位置；最近文档、启动恢复、相同文件内容重新关联。
- 原 PDF 自带批注只读展示。原文件被替换时阻止误用旧批注。
- 标准 PDF 高亮/便签另存导出，保留源 PDF 既有批注。导出不覆盖源文件。
- 写入失败保留待提交操作，可重试；也可明确放弃未保存操作并关闭当前文档。已保存批注不会因此删除。

工作区：Electron `userData` 下的 `workspace.sqlite`，Windows 默认位于 `%APPDATA%\Enlumor`。代码回退不删除该目录。
批注写入事务提交后才显示已保存；阅读位置合并延迟约 500ms，正常关闭刷新，异常结束可能损失最后不足一秒的滚动位置。

## 验证

```powershell
npm run typecheck
npm test
npm run test:python
npm run test:e2e
```

E2E 启动真实 Electron，只替换系统文件选择对话框；使用真实 PDF.js、SQLite 和 Python 导出。测试文档、临时配置位于系统临时目录，不覆盖个人工作区。

## 当前边界

不打开加密 PDF；扫描页可阅读但没有文字选择/搜索能力。不做 OCR、AI、白板、巡航、完整画笔或原文覆盖保存。任意倾斜字形的像素级四边形精度尚未承诺；首期面向常见横排文本及页面旋转。

macOS 后续可复用桌面与文档逻辑，但尚未构建/验收。iPad 需要独立客户端，Electron 不是其运行壳。

PyMuPDF 使用 AGPL/商业双许可，当前仓库用于个人开发；分发前需按实际分发方式处理其许可。第三方依赖版本锁定在 package-lock.json / requirements.txt。

初始底座证据见 `VERIFICATION.txt`；0.1.1 UI 与内置运行时修复证据见 `evidence/ui-runtime/VERIFICATION.txt`。整体实施进度见 `docs/IMPLEMENTATION.md`。

SQLite v1 升级到 v2 前创建 workspace.sqlite.pre-v2.bak（已有同名备份则追加时间戳，不覆盖）。旧程序不直接读取 v2 数据；代码回退时保留当前工作区及备份，不以旧备份静默覆盖新批注。每两项功能一次整体 Review，见 docs/REVIEW-CADENCE.md。
