# dense1000 擦除/撤销门禁修复 · 进度（2026-10-25，已暂停，未完成）

## RED（原样复现）
- preview dense1000：eraseUndo 1420ms（>1000），mutation worst longtask 75ms（>50）。RED/RED-run1.txt。
- 主进程：delete 384 + view 100 + undo 438 + view 104ms。每条命令把1000笔读取/校验/深拷贝3次。

## 已做修复1（主进程定向快照）— GREEN for eraseUndo
- executor 新增 snapshotScope：定向命令（delete/update/visibility/retention/undo/redo/create/get）只读自身id；erase/list/export 仍全量。
- EditHost/EditTransaction.readSnapshot(context, ids?) 可选参数；EditingWorkspace 用 json_each 过滤 marks/versions；IPC host 与测试 editingHost 透传。
- 新单测3项（tests/editing-workspace.test.ts「targeted snapshot scope」）：RED→GREEN；含 scoped/full 写入字节一致。editing五套205/205通过，tsc通过。
- 实测 eraseUndo 874/829/841ms（≤1000，阈值未改）。

## 已做修复2（渲染端投影复用）— 有效但不足
- projectEditingView(view, prior?) 同版本直接复用旧投影；main.tsx 传 old。单测 RED→GREEN（tests/editing-view.test.ts 第3项）。
- 对 longtask 无可测改善；收尾时考虑保留或回退以保持最小改动。

## 仍 RED：mutation worst longtask 63–68ms（>50）
- trace：长任务都是 "Receive mojo reply"（完整1000笔视图回复），70–80%为原生(program)。
- 诊断：getEditingView 往返 ~170ms，主进程处理 ~100ms；renderer structuredClone 全视图仅 ~15ms → 剩余主要是 contextBridge 逐个复制 512k 数字。
- 实验（未改产品代码，仅诊断里临时替换主进程 handler）：points 改 Float64Array 后往返 170→~120ms。下一步：测长任务是否降到 <50，再决定是否在 IPC 层编码 points（投影 [...points] 天然兼容）。
- prepareNearby 每次保存后还会再拉 page 视图（同样完整视图），也计入长任务。

## 临时文件
- tests/e2e/zz-diag-dense-trace.spec.ts：诊断用，非门禁，结束时删除。
- originals/ 与 ORIGINALS.sha256：改动前原件。注意 editing-workspace.test.ts、helpers/editing-fixtures.ts 原件未留副本：我的改动仅为末尾追加 describe 块和 editingHost 一行 readSnapshot 透传。
