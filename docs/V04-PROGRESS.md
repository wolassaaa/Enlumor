# Enlumor v0.4 执行进度

日期：2026-10-17（Asia/Taipei）。状态：Wave A自动化/审查/验收候选通过，真实API待验收，未发布。

## 工作区
- 原项目：D:/codex project/Enlumor，保留已验证0.1.15。
- 隔离实施：D:/codex project/Enlumor/.worktrees/v04-wave-ab。
- 分支：feat/v04-wave-ab；起点a7ff6aa。
- 用户已批准计划与子代理执行。实施者逐项独立上下文；每项审查，每两项整体review。
- 原生worktree工具在父目录返回Not a git repository，已使用Git隔离worktree；依赖和Python虚拟环境使用现有锁定运行时的目录联接，不共享.cache/测试数据库。

## 已观察基线
- 初次测试5项因新worktree没有.cache父目录报ENOENT；补建工作区缓存目录后110单测全部通过，build通过。
- 未修改原PDF、个人数据库、原PRD、主目录产品源文件或latest版本指针。

## 任务
- A1：自动化错误恢复与验收准备已完成并审查通过；真实API尚未执行，任务整体未完成。
- A2：手动Cruise与薄命令入口已实现，任务审查及整轮审查通过。
- 后续B：按v0.5.1为Surfing MVP，等待A真实验收；旧B1/B2方案不再执行。

## 真实验收依赖
用户提供服务商deepseek，模型显示名DeepSeek v4.1 flash。
这不等于已验证API model ID或已完成真实连接。真实论文已提供并通过本地读取与标题锚点校验；仍缺隔离实例的实际连接/验收结果。
不读取个人加密凭据，不擅自替换模型名，不使用模拟输出冒充真实结果。

## 执行裁定
A1真实验收待完成不阻止同轮A2自动化实施；整轮A不标完成、不发布、不推进B。
C/D、Surfing与定时任务不在当前执行范围。

## 实施更新
- A1自动化提交836ae3e：实际空回答成功误判RED后修复；121单测/12Electron通过；独立任务review PASS，无发现。
- A2实施提交eda05b2：移除自动推进、旧auto归一化paused/manual、三种薄本地命令；139单测/build/typecheck/10Electron通过；任务review PASS，无发现。
- 真实论文11页/SHA256d87d482d5ae7960e2e43d7dd6d21377e60e73e8fce1bf2a01aff7aca8a08c537；本地实际Electron读取/标题定位/PyMuPDF校验通过，网络请求0；不冒充真实API验收。

## 2026-10-18 Wave A 验收候选
- 整轮A1+A2 review完成：产品无发现；P2回退清单漏reader已补齐、增加覆盖守卫并实际重跑，定向复核通过。
- 候选包139单测+8Python+101最终EXE流程全通过；reader/SQLite/无外部Python和两样本/密集画笔门禁通过。
- 文本启动中位423.4ms/滚动p9513.6ms/保存p955.9ms；扫描402.1ms/14.7ms/7.8ms；零长任务；预算未放宽。
- 真实论文最终EXE本地读取和标题锚点核验通过；只验证标题，不称整篇语义验收。外发0，原文件哈希不变。
- 独立验收入口：D:/codex project/Enlumor/.worktrees/v04-wave-ab/Wave A 验收.cmd，使用单独.cache/wave-a-live-userdata；尚未自动启动用户交互实例。
- 正式版仍0.1.15；真实DeepSeek连接/解释/暂停/重试闭环NOT EXECUTED。A1整体未完成、A轮未发布、B未启动。
- 用户下一步：打开验收入口，在模型设置填服务商实际API模型ID和密钥，点击保存并测试（密钥无需发到聊天）。成功后对该真实论文完成A的共读验收，再单独拆解Surfing B。

## 2026-10-18 v0.5.1文档收束
- 正式产品文档：docs/product/Enlumor_Product_Plan_v0.5.1.md；由用户v0.5原文与本轮确认整合，未覆盖下载原件。
- 顺序锁定：A真实DeepSeek验收→B Surfing MVP→C Cruise深度研究/切换→D完善可靠性。
- 旧v0.4 B计划已标历史，不继续摘要硬门槛或优先完成完整研究功能；已实现的A与PDF底座保留。
- 缓存和基础阅读事实随B前置；A追问仅限当前块，目前输入/处理缺口需要在A验收前补齐，不称已有功能。
- 新想法先登记Backlog；架构变更需实际原因和测试依据；每轮只实施两项，验收后继续。
- 本次只整理文档，未修改任何src/tests/python/scripts/package文件，未运行API或重跑产品测试。应用正式版仍0.1.15，真实API未验收，Surfing未实现。
