# Wave A Task 2：用户优先控制复核

## 本地能力清单

| 能力 | 复核前 | 本次处理/证据 |
| --- | --- | --- |
| 当前页分块 / 原文块定位 | 已有 | 复用 `PdfReader.readPageBlocks`、`locateCruiseBlock` 与 finite `ReadingCommand`；不为 search/get_block 命名新建目录、总线或 schema |
| 全文搜索 / 下一结果 | 已有定位；追问接管缺失 | 保留 `PdfReader.search`，在现有工具栏点击/搜索提交回调通知现有 takeover |
| 滚轮 / 页码 / 阅读器翻页键 | 已有接管 | 原始 RED 中 wheel/page、扩展 RED 中 key-page 均直接通过；保留，不制造失败 |
| 选区（mouseup / 键盘 keyup） | 选区功能已有，追问接管缺失 | 只在现有 reader 回调收到非空选区时通知 takeover；空选区/程序化滚动回调不反向暂停 Cruise 自己的定位 |
| 放大缩小 / 适宽适页 / 旋转 / 阅读模式 | 功能已有，追问接管缺失 | 复用工具栏点击 capture 与阅读模式 change；不修改 reader 内部事件或视口算法 |
| 批注颜色操作 / 批注定位 / 绘图工具 | 功能已有，追问接管缺失 | 复用批注侧栏 click capture；不改变批注写入/撤销事务 |
| 独立阅读块 / 收起侧栏 / 分栏调宽 | 功能已有，追问接管缺失 | 现有点击、divider start 与布局保存回调通知 takeover |
| 暂停 / 切块 / 切服务 / 设置 / 后台 / 退出 / 切文档 | 已有 Task1 ownership 失效 | 保留原实现并随完整 Cruise Electron 文件回归 |
| 旧 auto 会话恢复 | 已有 manual + paused | 保留既有 session 单元测试与真实 Electron 重启检查，不自动请求，不清除成功结果/来源 |
| 真实 DeepSeek 解释、追问与断网重试 | NOT EXECUTED | 本地 fixture 不替代真实验收；维持 `wave-a-real-api.md` 中待执行 gate |

## 修正边界

本次生产代码只改 `src/renderer/main.tsx` 的现有 takeover 通知回调；`CruisePanel` 已有取消请求、epoch/requestId/文档/块/服务归属校验直接复用。没有新事件总线、轮询、session engine、远程检索、外部服务、schema、依赖或新 UI 模式。

## 可复现的晚响应检查

`tests/e2e/cruise.spec.ts` 增加 19 个手动控制场景：wheel、key-page、page、selection、key-selection、zoom、zoom-out、fit-width、fit-page、annotation、annotation-source、drawing、search、search-next、rotation、layout、blocks、sidebar、divider。

每个场景使用生成 PDF、临时独立 userData 和 localhost SSE：

1. 普通解释完成并保存，开始追问并收到 `Old partial`。
2. 用户执行实际读取器/工具栏/侧栏控制；追问变为 `追问已取消`，Cruise 变为 `已暂停`。
3. 先记录用户操作后的 viewport 与当前原文，再同时尝试旧 HTTP 完成及真实 renderer IPC 的旧 requestId delta/done/error。
4. 旧事件不改变追问 partial、原解释、当前原文或 viewport；问题保留，结果 cache/来源与既有批注保持相等，原 PDF SHA256 前后相同，仍只有两次显式请求。

键盘选区场景直接执行真实 DOM Range + PdfReader keyup 选区回调，不使用会先触发翻页键暂停的 keydown 来掩盖缺失的 selection 接管。

执行命令与 literal 结果由 `evidence/v051-wave-a/TASK2*.txt` 及 `.superpowers/sdd/2026-10-18-v051-wave-a-closeout/task-2-report.md` 记录。最终候选打包、整轮独立 review、隔离副本 rollback 验证和真实 API gate 由 controller 后续统一执行；此文不宣称这些步骤完成。
