# 下一项执行结果：文档编辑指令库差距审计

状态：基础两项收口后执行的现状审计；不是编辑功能上线或正式实施计划。源码基准 `2d45f0e`。

## 审计问题与实测

把现有编辑库草案中的16个命令名，以最小 `{type:命令名}` 输入交给真实 `runDocumentCommand`，并让所有业务端口在调用时计数。这验证的是命令名称尚未注册，不验证未来命令的参数合同。

实际结果以同目录 `EDIT_COMMAND_AUDIT.json` 和 `EDIT_COMMAND_AUDIT_RUN.txt` 为准。当前五个阅读指令仍是 `read_page`、`go_to_page`、`show_evidence`、`clear_focus`、`pause`；既有人工编辑与旧IPC不等于新执行器可执行能力。

## 逐项复用与缺口

下表路径均相对于已核对的工作区 `D:/codex project/Enlumor/.worktrees/v04-wave-ab`。

| 草案命令 | 已存在、应复用的底座 | 仍需实现与证明 |
|---|---|---|
| list_marks | `src/main/workspace.ts:115` 的 `Workspace.annotations`，旧 `getAnnotations` IPC | 新标识来源/版本/显隐/保留查询与命令合同 |
| get_mark | 同一现有批注列表可按ID查询 | 严格ID、归属、对象版本与不存在结果 |
| create_mark | `src/shared/model.ts` 七类人工批注、`validateAnnotation`、`Workspace.apply` | 宿主赋予来源；新对象版本、默认覆盖/恢复语义 |
| update_mark | `src/renderer/main.tsx` 已有颜色/便签修改 | 按类型限制patch；对象版本冲突、保护内容预览与确认 |
| set_mark_geometry | `src/shared/geometry.ts:21`、`:40` 原生几何/线条路径校验 | 真实移动/端点编辑；严格页边界、路径与包围框一致 |
| set_mark_placement | 当前没有独立标签呈现位置模型 | 显示偏移与原文坐标分开，移动显示不篡改引用 |
| replace_mark_anchor | 基础 `show_evidence` 可从真实页重新解析原文 | 独立换锚点编辑合同；不可只移动高亮矩形保留假引用 |
| delete_marks | `Workspace.apply` 已有批量deletes及inverse | 全量归属/版本校验、来源保护与确认差异绑定 |
| erase_ink | `src/renderer/eraser-tool.ts` 与 `strokeIntersectsEraser` | 命令适配与版本原子删除；仍明确是整笔擦除 |
| undo_edit | `main.tsx:75,191` 每文档历史及成功提交后更新 | 按明确操作组/来源撤销，不撤掉后来的人工作业 |
| redo_edit | 同一旧历史Map和inverse | 撤销后新编辑清理redo；失败不先弹历史 |
| set_marks_visibility | 隐藏面板不是逐标识显隐能力 | 显隐独立于删除、保留和导出，工作区恢复需验收 |
| set_marks_retention | 旧人工批注按保存内容存在，无fixed新模型 | 固定/解除固定、来源保护分别定义，保留旧人工内容 |
| apply_edit_batch | `Workspace.apply` 使用 `BEGIN IMMEDIATE` 和一次inverse | 新模型compare-and-commit；非法一项全不写，幂等和冲突 |
| prepare_mark_export | `main.tsx:263` 和旧导出入口可复用 | 来源/显式ID选择、指定版本快照、取消/不支持呈现结果 |
| export_marked_pdf | `preload.ts:26` 的 `document:export` 与Python链路 | 新快照接入实际文件导出；不假报保存成功，不覆盖原PDF |

## 本次形成的约束，不冒充实现

- 原 `Annotation.author` 仍是 `'user'`；现有 SQLite v4 未迁移。新增来源/版本不能通过放宽旧校验偷偷落库。
- 显隐、保留、编辑保护与导出选择分别建模；不把 Acrobat 的 Locked 或 Zotero 的导入动作直接映射为 AI 权限。
- 七类标识共享有限业务接口；来源由宿主可信上下文决定，不从模型参数接收 `confirmed=true` 或任意文件路径。
- 继续复用原文锚点、原生坐标、批量事务及inverse，不重建PDF渲染、OCR、高级高亮或通用Agent总线。
- 下一实施批次仍按草案的两项推进：①合同/校验/变更及逆操作；②执行器/原子版本提交/撤销重做。持久化新模型与真实界面/导出接入需各自验收，不用纯逻辑通过冒充软件可用。
- 书面编辑库规格当前仍为草案；本次完成审计与决策输入，不把自主定时执行当成对尚未审阅新架构的确认。

## 可复用续跑提示词

```text
在 D:/codex project/Enlumor/.worktrees/v04-wave-ab 继续 Enlumor。
先读 docs/WAVE_A_TASKS.md 顶部当前状态、docs/WAVE_A_STATE.json 和本批次 VERIFICATION.txt。
基础 Task1 653acb4 与 Task2 2d45f0e 已收口，不重复实现。
先检查编辑库书面草案是否已有用户审阅结果；只从当前未完成阶段推进。
复用本审计的16项能力映射，切勿把旧人工IPC当作新的已注册命令。
一次一个产品写入者。Electron UI/回退/打包检查串行运行，避免失焦暂停互相污染。
每完成两项后研究相关成熟软件的真实操作逻辑，再执行下一项。
保持实际测试、失败记录、原始哈希和隔离副本回退；有实质进展才通知。
```
