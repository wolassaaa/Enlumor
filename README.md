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

便携构建：`npm run portable`，然后双击项目目录下的 `启动 Enlumor.cmd`，或运行 `launch-enlumor.ps1`。

此阶段 EXE 不包含 Python。启动脚本会设置 `ENLUMOR_PYTHON` 指向项目 `.venv\Scripts\python.exe`。将 EXE 拷到其他机器时，需要安装 requirements.txt 并设置这一环境变量；不是完整独立安装包。

## 已有功能

- 打开文本型 PDF、连续阅读、原文选择、全文搜索与命中定位、页码跳转、缩放、适宽/适页、旋转。
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

实际测试、构建、已知问题与回退证据见 `VERIFICATION.txt`。整体实施进度见 `docs/IMPLEMENTATION.md`。
