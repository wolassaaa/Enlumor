# Enlumor v0.4：已批准方向与 Wave A/B 范围

日期：2026-10-17。应用起点：0.1.15 / commit 0f9959a。
本文件整理用户批准的输入；不是新功能已实现的声明。原 PRD 和用户附件保持不变。

## 输入与优先级
- v0.4 原文：C:/Users/woola/.codex/attachments/379527cd-6b6f-42a6-b7a4-f3841c96e1f0/已粘贴的文本.txt
- 原文 SHA256：c5c117355bae3241ecfa61cffc6c1f1bbf29983c8d7992fb369ecad83df5cba1
- 此后用户明确批准六项收敛，并补充目标版本、独立阅读事实、事务预算三条规则。
- 用户最新决定优先于原附件：仅先做 A、B，不批准大型架构重构；C、D需后续决定。

## 核心价值
Reader 本地阅读；Cruise 围绕用户问题、每一步由用户推进；Surfing 后续零问题自动带读。
第一目标不是增加锚点数量，而是让用户找到支持回答且不隐去局限的原文，继续阅读与追问。

## 硬约束
- Windows first / Local first / Source first；保留 Electron/React/TypeScript/PDF.js/SQLite/PyMuPDF。
- 原 PDF 只读；SQLite 为权威存储；迁移前备份；不得删除或降级个人数据库。
- 本地命令复用已有函数，不新增通用 Agent、插件系统、脚本 DSL、微服务或向量数据库。
- renderer 不获得任意 IPC、路径读写或命令执行；主进程继续验证来源、文档、坐标和数据。
- 文档内容视为数据，不执行文内指令；模型只建议解释/锚点，本地程序验证后定位。
- AI 永久批注本轮不增加；用户原有批注操作、撤销、保存和导出保持原链路。
- 每轮两任务后一次独立 review；完整打包门禁通过才发布。真实 API 验收与模拟测试分开。

## 三条一致性规则
1. 执行上下文绑定 session_id + goal_version + request_id；暂停另增加 generation_id。
   同一目标暂停/恢复也必须失效旧结果。主进程和renderer分别检查，旧结果不控制界面。
2. presented / skipped / user_confirmed_read 是独立事实；ai_explained 是独立事件。
   A/B只落实摘要主动确认；不提前实现全量reading_events或对用户理解作推断。
3. Surfing请求预算未来用SQLite事务发送前原子占用；失败/取消不退还，重启不清零。
   本轮不新增预算表和Surfing入口，但C的硬门槛必须保留，不以UI计数代替事务。

## 范围与阶段门
A1：真实API闭环验收；A2：Cruise固定手动和薄本地命令入口。
B1：Abstract/导言/目录的原文入口、主动确认、版本化研究目标。
B2：分级证据检索、验证、目标隔离缓存和围绕问题解释。
A通过review/真实验收/打包后再进入B；B完成后再决定C。
缓存隔离和目标版本随B1/B2交付，不拖到Surfing。A/B不引入完整多模式架构。

## 当前事实与差距
- 已有readPageBlocks和六页LRU、locateCruiseBlock、PDF.js搜索、主进程verify-block。
- 已有requestId取消与renderer epoch；没有持久研究目标和目标版本。
- 当前结果按block.id缓存；没有目标驱动解释、分级证据排序、Abstract确认入口。
- 有Cruise manual/auto，尚无独立Surfing；移除auto需保留旧数据且恢复为paused/manual。
- 真实厂商API尚未验收，历史110+8+97模拟/打包通过不替代新门槛。

## 非目标
白板、Spotlight、局部放大、OCR、跨平台、云同步、知识图谱、通用工具调用平台。
