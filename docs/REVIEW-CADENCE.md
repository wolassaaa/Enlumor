# Enlumor 两项一 Review：第 1 轮

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
