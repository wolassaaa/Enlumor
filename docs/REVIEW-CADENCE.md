# Enlumor 两项一 Review 记录

当前执行位置：第4轮已完成，计数0。下一项擦除，继续两项一 Review。

## 第1轮：侧栏与标签

日期：2026-10-15；基线 0192aaa；分支 feat/layout-tabs。

## 本轮两个任务

1. UX-01：左右侧栏拖动调宽、键盘微调、双击恢复、紧凑/标准/宽松间距、SQLite 保存、窄窗口正文宽度保底。
2. RDR-01：多文档标签、同文档去重、切换前保存阅读状态、每标签撤销/重做、关闭不删除工作区、重启恢复、Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+W。

采用单个 PDF viewer，只保存非活动标签的 DocumentInfo 与本会话操作历史，不保留所有 PDF 字节或给每个标签复制一个 viewer。

## 成熟设计参考与本轮操作逻辑

- [VS Code Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)：参考可调整、可恢复的工作台与侧栏，保留正文优先，而非引入可随意拆分的布局框架。
- [Adobe Acrobat viewing preferences](https://helpx.adobe.com/acrobat/using/viewing-pdfs-viewing-preferences.html)：参考同窗口多 PDF 标签与会话恢复。关闭标签只关闭视图，不等于删除文档或批注。
- 操作采用可预测的单击切换、独立关闭按钮、当前标签标记、方向键/Home/End 标签导航；左右分隔线支持方向键、Shift 大步、Home/End。
- 宽度设置与实际窄窗口显示尺寸分离；宽度、间距写入 SQLite，不另建 sidecar。间距仅作用界面留白与页面间隔，不修改 PDF 正文、坐标或导出。

## 实际 Review 与修复

使用一次独立只读代码/截图审查（首次模型容量错误后重试；不是对修复的二次审查）。检查 shared/main/preload、迁移、异步状态、标签历史、分隔线及两张真实界面截图。

Important 1：便签模态编辑期间 Ctrl+Tab/Ctrl+W 可切换/关闭文档，随后保存会让文档 A 的批注显示在 B 上。
- RED：note drafts block tab navigation and close shortcuts until saved or cancelled 失败，活动文档变成 beta.pdf。
- GREEN：模态编辑期间阻断导航/关闭、保留草稿；关闭应用的刷新也要求先保存或取消便签。业务提交另校验批注 documentId 等于活动文档。

Important 2：reader.open 失败后文档标签、撤销历史和 SQLite 活动会话不一致。
- RED：failed PDF renderer opening restores prior document, undo history and persisted active session 失败，旧批注数量变成 0。
- GREEN：新 PDF 成功渲染后再写会话；加载失败恢复旧 PDF、位置/缩放、批注、历史及会话。恢复失败时清空活动视图，避免挂着旧文档标题继续编辑另一个文档。

两条修复以测试失败→成功验证；最终全套及实际打包门禁结果见 evidence/layout-tabs/VERIFICATION.txt。

## Deferred minors

- 关闭被聚焦的标签后，尚未主动把键盘焦点移到下一标签；可再次 Tab 定位。下一轮键盘体验完善时处理。
- 分隔线有悬停/焦点态和说明，但静止状态缺少明显拖动握柄。保留克制界面，本轮不追加视觉重做。

## 后续规则

两个独立功能任务记为一轮；完成后必须 review 再继续。每个任务先失败测试→实现→回归；Review 同时检查代码/数据安全与操作逻辑，参考官方成熟产品设计，不能只看视觉。Important/Critical 必须修复并补测试；Minor 如暂缓则记录。
本轮 Review 已完成，计数清零。下一轮：① RDR-02 单页模式；② ANN-01 下划线（包括标准 PDF 导出）。两项后执行第 2 轮 Review，继续不提前引入 AI/白板。

## 第2轮：单页模式与下划线/导出（0.1.6）

两个任务的单独测试先失败后通过，再进行一次独立代码/截图 Review。参考 [Acrobat 页面布局](https://helpx.adobe.com/acrobat/using/adjusting-pdf-views.html)区分单页与连续滚动；复用 PDF.js ScrollMode.PAGE，而不是隐藏整本已渲染页面。标准导出参考 [PyMuPDF 页面批注](https://pymupdf.readthedocs.io/en/latest/page.html)。

Important：单页会复用已完成渲染的缓存页面，离屏删除/改色后只更新当前页面，翻回可能显示旧批注。相邻页删除测试 RED（预期0条线，实际1条），修复为 pagechanging 重新挂载后重绘，模式切换刷新附着页面；测试 GREEN，覆盖删除、撤销恢复与切回连续模式。最终51项测试和实际打包/双压力样本门禁通过。

Deferred minor：页1的上一页与末页的下一页仍可点击但不跳转，后续应按边界禁用。第1轮焦点接续和分隔线握柄提示继续记录，不在本轮扩展。

阅读模式作为可选 ReadingState.layout 写入 SQLite JSON，旧记录默认连续模式，不迁移 schema。旧程序不识别新的下划线批注类型；回退仅在独立副本验证，保留新版工作区，新批注继续由新版处理。

第2轮已完成，计数归零。下一轮：删除线（含导出）、直线（含导出），两项完成后 Review；之后再推进箭头、画笔与擦除。

## 第3轮：删除线与直线/导出（0.1.7）

参考 [Acrobat 文本标记](https://helpx.adobe.com/acrobat/web/share-review-and-export/review-pdfs/markup-document-redlining.html)的“选区→标记”操作与 [PyMuPDF 页面批注](https://pymupdf.readthedocs.io/en/latest/page.html)的标准 StrikeOut / Line。直线是可撤销的批注，而不是把图形烧入原 PDF；拖动只在本页进行，Esc 取消，忙碌与未保存操作优先。

一次独立只读源码/截图 Review；作者在同一修复阶段用测试验证：
- Important：短点击无有效线段时内部工具退出而按钮仍选中。RED，改为短点击保持待绘，下一次拖动可直接完成；GREEN。
- Important：绘图只检查 viewer ready，可能在导出/锁定期间丢弃操作，或覆盖待重试操作。延迟导出及注入写失败两条 RED；增加 readiness 业务检查、忙碌时取消工具、禁止新提交替换 pending（明确重试仍允许）；GREEN。
- Minor→Important 重评：旋转时未显式取消手势，可能用新坐标变换解释旧起点。真实事件同一轮释放复现意外写入，RED；rotationchanging 取消草稿，GREEN。
- 原审查建议补充旋转后“创建”而非只检查数量；已补90°/150%及270°/200%创建，独立比较 PDF 原生端点、SVG 与导出端点。DOM 宽度存在取整，测试按 PDF CSS 单位96/72核算，而非把取整后的宽度当精确比例。

完整发布门禁第一次返回3个失败（既有100%/150%/200%浮栏边界测试），latest仍为0.1.6；根因新增按钮超过旧固定310px宽度假设。改为布局阶段测量实际浮栏尺寸、限制宽度并换行，三个测试 GREEN。重新执行整套：30 Vitest + 5 unittest + 29 E2E=64，打包及双压力样本通过后才更新0.1.7。

Deferred minor：直线草稿固定绿色，保存颜色使用当前选择器，后续统一草稿色与实际色。此前页边界按钮、关闭标签焦点、分隔线握柄继续记录。未做第二轮审查，修复以小测试及全套结果为准。

新增类型由新版本处理，代码回退仅在独立副本验证，不以旧程序覆盖新版工作区。第3轮完成，计数0；下一轮箭头、画笔，之后第4轮 Review。

## 第4轮：箭头与画笔
日期：2026-10-15；基线48ab539；分支feat/arrows-ink；版本0.1.8。
两个任务：原生箭头 + 标准Line/ClosedArrow导出；有界有序画笔 + 标准Ink导出。复用SQLite事务/撤销/重试，不新增存储权威源或数据库版本。
成熟设计参考：[Adobe shapes and drawings](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/add-shapes-drawings.html)、[PyMuPDF Annot](https://pymupdf.readthedocs.io/en/latest/annot.html)、[Page](https://pymupdf.readthedocs.io/en/latest/page.html)。
保留简单“选工具—页内拖动—一次提交—恢复选择”、Esc取消、当前工具pressed反馈。画笔暂为单笔独立操作，不做压感/平滑/多笔合并。

### 独立 Review 与修复
只进行一次整分支只读独立review（48ab539..ee57b8b），作者一轮修复，不对修复再派审查。
Important：布局变更未取消正在进行的绘制。布局变化使页面DOM原点移动，旧采样与新端点混合；审查实际复现仍有草稿且松手保存1条错误笔迹。
作者新增16条真实Electron测试，箭头/画笔×同一回合/渲染后松手×左右侧栏收起/间距/右分隔线，全部RED（REVIEW_RED.log）。
修复：persistLayout、两侧显隐和右divider start在改变几何前同步resetDrawing；左divider已有同等取消。
首次修复测试12通过、4失败于收起批注栏后默认role查询排除隐藏工具；草稿与批注数断言已通过。改为includeHidden检查真实工具状态，不改产品以迎合测试。
最终16通过（REVIEW_GREEN.log）。全量发布、实际EXE与性能结果在VERIFICATION.txt。
另：Ink初次导出受PyMuPDF参数契约拒绝Point对象；检查安装版原生sequence检查后转换为数值对，现有Python/Electron导出测试转绿。不是改坐标算法掩盖问题。

### 判定与暂缓
- Minor deferred：SVG实心三角头与标准PDF空心ClosedArrow的填充及头部比例不同。端点/方向有独立测试；本轮不宣称像素级外观一致。
- Ruling：压感、平滑、多笔合并与保持工具选中不加入此批；代价是连续手写需重新选工具、没有压感。
- Ruling：擦除/已保存图形直接拖动仍按后续清单；代价是本版删除整条批注而非局部路径。
- Ruling：未运行独立Acrobat；采用实际Edge视觉核验和标准PDF结构测试，代价是尚未确认独立Acrobat特有显示差异。
- 审查暂缓的实际打包/性能判断通过最终release门禁补齐，不能用开发版结果代替。
- 旧minor（页边界按钮、关闭标签焦点、分隔握柄）仍暂缓；上一轮固定绿色草稿已随共享渲染修正。
- rollback仅在隔离副本恢复原代码与新测试profile；个人数据库不降级或清除。旧版本不保证理解新arrow/ink载荷。

## 2026-10-16 用户主动操作规则专项 Review
用户要求先核对操作规则，再review。本次为当前0.1.8实际EXE的独立专项，不是上一轮修复的重复派审，也不新增功能计数；未派子代理。
核对工具状态/退出、模态隔离、保存确认、失败恢复、标签事务隔离、布局取消、边界反馈。规则与复现报告见 [2026-10-16-operation-review.md](reviews/2026-10-16-operation-review.md)。
发现P1便签焦点逃逸→背景取消选区→保存静默丢弃草稿；P2关闭错误提示→重试入口隐藏但pending锁定。两项待修，应先于擦除。
P3边界按钮反馈继续暂缓。既有操作33条实际EXE回归通过，不覆盖本次两个新故障序列。
报告截图均为当次捕获并查看，DOM/数据库查询支持结论；本轮只审查，业务代码/发布包不变。

### 2026-10-16 专项修复（0.1.9）
用户确认“修理”后只修P1/P2，不把修复计作新功能两项，也不再次派reviewer重复上一轮专项。
先跑0.1.8实际发布EXE：首版测试3失败1通过，P2用例的等待断言被500ms阅读flush重新暴露错误掩盖；改为关闭提示后立即检查，4项全部失败。另增失败编辑明确放弃1项失败。
原生dialog实现真正模态隔离；便签打开时固定锚点，commit返回成功/失败，只有成功才关闭；pending草稿只重试原操作或明确放弃。全局恢复区域按pending/layoutError独立存在。
首次修复4通过1失败：点击便签按钮为保持选区使用preventDefault，原生焦点恢复目标不是触发按钮；显式记录触发点并在dialog关闭后恢复，禁用/移除时回到阅读区。原失败测试转绿。
最终5通过；完整32+7+63=102通过、实际发布EXE5项再测通过、双样本性能/无外部Python通过。原始记录在evidence/note-recovery。
P3边界按钮、箭头外观等旧Minor不进入这次修复。复制回退恢复旧非模态行为，个人工作区与当前源码不回退。
