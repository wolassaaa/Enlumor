# 文档指令基础层：真实 PDF 阅读器接入

本轮交付是本地确定性基础指令的真实阅读器接入，不是全文上下文或新 Cruise 的完成声明。旧 Cruise 仍使用原有逐块共读流程与旧同步接口，本轮没有连接模型或发出真实 API 请求。

## 五个支持的指令

| 指令 | 真实适配与现有人工入口 |
| --- | --- |
| `read_page` | 阅读块按钮 → `runDocumentCommand` → `PdfReader.readPageBlocks`，只返回当前源文档、指定零基页的原文与原生几何，不翻页。 |
| `go_to_page` | 上一页、下一页、有效页码提交 → 执行器 → `PdfReader.go`，执行器零基页转换为阅读器一基页；输入校验和草稿行为保持。 |
| `show_evidence` | 人工阅读块定位 → 只提交页码与 passage ID → 执行器重新读取源页并按 ID 解析 → `locateCruiseBlock`；不接受调用者提交的几何。 |
| `clear_focus` | 收起阅读块 → 取消旧任务并清除临时强调；不删除正式批注。 |
| `pause` | Escape → 停止本地指令并失效旧上下文；不启动解释或自动翻页。旧 Cruise 的暂停按钮语义保持原状。 |

`src/renderer/document-command-reader.ts` 只保存宿主 revision、AbortController 与请求序号，端口通过 getter 读取最新 reader/document ref。执行器没有挂到 window、preload 或通用 IPC。文档替换、关闭、手动接管、取消会失效旧指令。关闭 Cruise 时接管不会增加 React state；没有临时强调时失效不会重绘全页覆盖层。

临时 focus 同步强调前检查源身份与有效性，实际延迟帧滚动前重新检查文档 generation、最新 focus epoch、宿主 guard。清除、更新 focus 或切换文档后，旧帧不会滚动或覆盖新强调；旧计时器不会清掉新的 focus。现有注释定位调用未要求传入 guard，默认行为保留。

## 可复现验收

在仓库根目录执行，Electron 使用测试自行创建的 OS 临时 userData；不会使用用户候选包或其 profile。

```powershell
npx vitest run tests/document-commands.test.ts tests/cruise-reader.test.ts tests/cruise-takeover.test.ts tests/reading-commands.test.ts
npm test
npm run build
npx playwright test tests/e2e/document-commands.spec.ts tests/e2e/cruise-anchors.spec.ts tests/e2e/page-navigation.spec.ts tests/e2e/reading-tools.spec.ts
```

- 新 Electron 测试生成两份三页 PDF，每页有两处重复句和可区分的左右上下文；人工从 1 页到 3 页，验证右侧原文与强调在屏幕上的几何对应。
- 创建真实便签、重新定位、清除临时强调后正式便签仍在，撤销/重做和导出标准 PDF 注释成功；原 PDF SHA256 保持不变。
- 测试侧拦截并保留浏览器实际 rAF，完成 wheel 接管、Escape 暂停或切文档后才释放；断言原位置和新源阅读块，不使用任意 sleep。测试变量只由测试注入，不存在生产后门。
- 单测调用实际 PdfReader 方法，延迟 `getTextContent` 边界，验证暂停/接管/文档或源 hash 变化后旧读取结果取消，下一次指令读取最新 ref。另验证旧 focus 帧不覆盖新 focus、clear 后旧结果不假报成功、缺少 reader 时不假报导航成功。
- 真实故障 RED 是旧延迟 focus 帧在接管后仍滚动，不是将已存在的人工翻页或阅读块按钮描述成缺失。初始正向路径已经通过。原始命令输出、退出码和过程失败记录见 `evidence/document-command-task2/TASK2-*.txt`，最终计数见 Task 2 报告。

## 尚未进入指令库

搜索、缩放/旋转/视图设置、目录/缩略图导航、全文上下文、新 Cruise 调度、标识创建/编辑/保存、导出没有注册为新指令。现有人工功能仍可独立使用，但这不表示模型或新执行器已具备这些能力；它们没有空实现或伪成功项。本轮没有新增依赖、DB schema、模型 API、编辑库或高级高亮。

新鲜独立 Review、全批回归、性能门禁、隔离回退与新路径候选打包由父任务继续验收；本地接入测试通过不替代这些发布条件。

## 2026-10-20 当前验收结果
本轮从已提交实现恢复收口，复验261单测、16专项EXE（含30/300/1000笔画）、141完整候选EXE、8Python、构建和无外部Python的打包阅读器通过。文本/扫描200页各1000批注，原性能阈值通过。源快照31份哈希、隔离回退110执行器测试及真实三页PDF通过；当前修改源码保留。两项整轮独立Review PASS。上文父任务待验收语句保留为实现时历史。详细命令、literal结果、退出码与失败修正记录见 D:\Codex\2026-10-20\new-chat-2\outputs\enlumor-20261020-0408/VERIFICATION.txt。
