# Enlumor

Windows-first, local-first PDF reader foundation. Electron + React + TypeScript + PDF.js; SQLite workspace; PyMuPDF native annotation export. 普通阅读无需账户或云服务；可选 Cruise 使用用户配置的模型 API。

## 0.1.15 模型配置简化

模型设置默认仅显示服务商、API 密钥和模型；DeepSeek 预设自动填写 `deepseek-chat`，支持手填模型 ID。协议、地址、名称、超时、输出上限、JSON 与维护操作折叠到“高级设置”。主按钮“保存并测试”使用当前编辑内容，字段缺失就地提示；连接失败后保留已保存配置与凭据，可直接修改重试。连接测试只发固定短句，不发送 PDF。110 单测、8 Python、97 最终 EXE 流程和原性能门禁全部通过；真实厂商密钥仍需实际连接验收。

## 启动

项目目录：`D:\codex project\Enlumor`

```powershell
cd 'D:\codex project\Enlumor'
.\setup.ps1       # 首次安装，需 Node 24+、Python 3.10+ 和网络
npm start          # 启动已构建的桌面应用
```

开发：`npm run dev`。主进程修改后需重新启动开发命令。

推荐发布：`npm run release:verified`。全部测试及暂存包性能门禁通过后生成 ZIP 和解压目录；双击 `启动 Enlumor.cmd` 使用 latest.json 指向的已验证版本。ZIP 解压一次后启动，比每次自解压的便携 EXE 更快。`npm run portable` 保留为手动构建，不经过完整发布门禁。

**当前发布包已内置 PDF 处理程序**，运行不需要安装Python或配置环境变量。请用“启动 Enlumor.cmd”或latest.json指向的最新解压目录；0.1.1起引入内置程序，旧包不包含后续修复。

仅开发/重新构建需要 Node 和 Python。`setup.ps1` 安装 requirements-build.txt；打包命令通过 PyInstaller 收集解释器、PyMuPDF 和依赖到应用资源目录，运行时优先使用内置程序。Windows 构建不作为 macOS/iPad 的二进制包使用。

0.1.10 新增“整笔擦除”：仅擦除本软件新建画笔笔迹。一次拖动可擦多条，一次撤销全部恢复；Esc取消，失败可重试。原PDF及其自带批注、高亮和便签保持不变。

此前0.1.9 修复便签模态焦点隔离、原文锚点固定与失败草稿保留；保存失败后收起详情仍能重试。明确放弃失败便签编辑不会删除旧的已保存内容。

此前0.1.8 新增箭头与画笔（标准PDF批注导出）。右栏选择工具后页内拖动，一次笔迹保存后恢复文字选择；Esc或布局改变取消。画笔每条最多4096采样点，长笔迹抽样降密度，不模拟压感。箭头头部应用内实心、导出空心，端点方向保持一致。保留删除线、直线、下划线、高亮、便签、侧栏调宽/间距、多标签及按需渲染。完整清单与每两项review见 [docs/FEATURES.md](docs/FEATURES.md)、[docs/REVIEW-CADENCE.md](docs/REVIEW-CADENCE.md)。

## 0.1.13 Cruise 共读

打开 PDF → 顶栏 Cruise → 在模型设置保存服务、接口地址和模型 ID → 开始共读。开始前显示目标服务和发送范围；只发送当前块，不上传整份 PDF。
默认手动继续，可选择自动推进和20/12/6秒节奏；解释成功且会话保存确认后才倒计时。暂停、正文手动接管、窗口失焦均停止推进；重启恢复为暂停，不自动调用。来源按钮返回当前原文，临时强调不新增永久批注。
支持 OpenAI Chat/Responses、Claude Messages、Gemini 原生格式；国内兼容预设含 DeepSeek、百炼、方舟、千帆、混元，模型 ID 可手填。凭据系统加密；加密不可用只留会话。配置支持不等于厂商真实连接实测，本轮仅本地模拟契约测试。DashScope/星火专有原生接口已在0.1.14接入，见下节。
扫描页可略过，不增加OCR；常见横排文本优先，锚点验证不一致时停止解释。近期完整解释缓存最多64条、合计512K字符，超出后逐出较早结果；单次解释上限64K字符。

## 0.1.14 国内原生接口

模型设置新增DashScope原生文本HTTP/SSE、Spark WebSocket。Spark填写APPID/APIKey/APISecret和匹配版本的domain；凭据加密保存，编辑时三项一起填写或全部留空保留。
两个协议共用现有Cruise，不另开一套聊天界面；支持错误/超时/取消和旧响应隔离。Spark WS使用Node内置直连，不自动继承Electron HTTP代理。完整配置与测试等级见 [API兼容矩阵](docs/API-COMPATIBILITY.md)。
本轮110单测＋8Python＋95最终EXE流程通过；厂商真实密钥连接仍待用户配置后验证。

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

不打开加密 PDF；扫描页可阅读但没有文字选择/搜索能力。不做 OCR、白板、完整画笔或原文覆盖保存；AI/Cruise 范围见0.1.13说明。任意倾斜字形的像素级四边形精度尚未承诺；首期面向常见横排文本及页面旋转。

macOS 后续可复用桌面与文档逻辑，但尚未构建/验收。iPad 需要独立客户端，Electron 不是其运行壳。

PyMuPDF 使用 AGPL/商业双许可，当前仓库用于个人开发；分发前需按实际分发方式处理其许可。第三方依赖版本锁定在 package-lock.json / requirements.txt。

初始底座证据见 `VERIFICATION.txt`；0.1.1 UI 与内置运行时修复证据见 `evidence/ui-runtime/VERIFICATION.txt`。整体实施进度见 `docs/IMPLEMENTATION.md`。

目前SQLite schema4。v3→v4升级前创建workspace.sqlite.pre-v4.bak，保留文档/批注/模型配置；旧程序不直接读取v4库，回退仅在隔离副本验证。

SQLite v1 升级到 v2 前创建 workspace.sqlite.pre-v2.bak（已有同名备份则追加时间戳，不覆盖）。旧程序不直接读取 v2 数据；代码回退时保留当前工作区及备份，不以旧备份静默覆盖新批注。每两项功能一次整体 Review，见 docs/REVIEW-CADENCE.md。
