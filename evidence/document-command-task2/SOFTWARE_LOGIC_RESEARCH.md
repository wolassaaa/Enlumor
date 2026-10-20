# 成熟软件操作逻辑 → Enlumor 编辑库决策

记录日期：2026-10-20（Asia/Taipei）。研究方法：查阅官方操作文档，不把文档研究写成实际安装、点击或体验软件。

## 1. Zotero：原文、批注、笔记、导出分开

Zotero 的默认文本选区弹出颜色选择；锁定高亮工具后连续选区可直接生成批注。批注可以加入笔记，笔记中的批注可用 Show on Page 返回原文页面。其工作流把“阅读时操作”与“整理笔记”连接起来，而不是要求先进入聊天。

来源：[Zotero PDF Reader and Note Editor](https://www.zotero.org/support/pdf_reader)。

Zotero 自有批注存在数据库中，向外分享时另行导出含嵌入批注的 PDF 副本；外部嵌入批注默认只读，导入后才可编辑。

来源：[Why does Zotero store PDF annotations in its database instead of in the PDF file?](https://www.zotero.org/support/kb/annotations_in_database)。

**Enlumor 设计推论（不是 Zotero 功能声明）：**工作区持久化不等于修改原 PDF；阅读器内标识必须保留真实原文锚点；显示位置与引用位置分离；导出使用明确选定的快照。已有 `show_evidence` 继续承担回到原文，编辑库不得用移动标签代替更换原文锚点。

## 2. Acrobat：列表选定对象，再执行明确动作

Acrobat 的 Comments 面板支持排序、筛选、显示/隐藏批注，并区分导出全部与导出所选。修改、删除分别作用于所选批注；属性中的 Locked 可防止编辑和删除。

来源：[View comments](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/manage-reviews/view-comments.html)、[Edit comments](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/edit-comments.html)、[Delete comments](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/delete-comments.html)、[Set comment properties](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/manage-comment-preferences/set-comment-properties.html)。

**Enlumor 设计推论：**查询/选中、编辑、显隐、删除、保留、导出是不同操作；隐藏不等于删除，导出也不隐式固定。批量命令绑定明确对象集合，预览与提交必须针对同一版本。保留状态与编辑保护不能合并为一个含义含混的布尔值：草案中 fixed 对 AI 提交的确认要求需明确，而不是照搬 Acrobat 的 Locked。

## 3. 应用到下一项工作的可检查决策

| 决策 | 现有实现 | 下一项检查 |
|---|---|---|
| 先查对象、后编辑 | 旧 `getAnnotations` 可读人工批注 | 查询命令与新来源/版本模型尚缺 |
| 原文位置和标签显示位置分离 | 五类基础指令已做原文定位 | `replace_mark_anchor` 与 `set_mark_placement` 分开 |
| 显隐/保留/导出分别表达 | 旧工作区只有人工批注模型 | 不把不存在的新字段写进旧 SQLite |
| 一次批量提交对应一次历史 | 旧 `Workspace.apply` 有事务与 inverse | 新模型增加对象版本检查；事务成功后才更新历史 |
| 输出分享副本而非覆盖原件 | 既有导出路径可复用 | 选择来源/标识集合、版本快照及取消结果仍待适配 |

后续不是重做阅读器，也不是立即把整个草案注册为可执行工具。本轮下一项是**编辑指令库现状审计**：以实际执行器验证目录中的命令名是否可执行，并把既有底座与真实缺口逐项对应。
