# Cruise 夜间执行记录

计划：docs/superpowers/plans/2026-10-17-cruise-overnight.md
设计：docs/superpowers/specs/2026-10-17-cruise-design.md
用户已于2026-10-17明确回复“确认执行”。不再请求重复批准。
截止：2026-10-17 08:00 Asia/Taipei。07:40后不开始新任务；保留原已验证构建，截止后收集结果并暂停自动任务enlumor。
工作目录：D:/codex project/Enlumor；分支feat/cruise-overnight；用户批准在此项目顺序实施，单一实施者。不要另建竞争项目、重复实施或上传GitHub。

## 当前状态

- Task1：模型设置与四协议底座已实现，专项31项单测、2项实际Electron流程通过；本次里程碑与证据一并提交。不是完整Cruise，也不是正式发布。
- Task2：下一项，按需原文分块与锚点定位；尚未开始，不提前标完成。
- Task3/4：巡航解释/控制/接管，节奏/恢复尚未实现。
- Task5/6：DashScope/星火原生尚未实现；不能在设置中作为可用协议出现。
- 两任务一review计数：1/2；Task2完成后只派一次独立整体review，修复Important再推进下一批。
- 当前最新已验证发布仍为0.1.12，开发源代码引入SQLite v3模型配置表；个人userData未迁移，测试全用临时profile。

## Task1 已做与证据

src/main/ai-client.ts：Chat Completions、Responses、Anthropic Messages、Gemini JSON/SSE；逐字节UTF-8分片、截断、错误事件、401/429/500、超时/取消、重定向不转发认证、大小限制、受控参数；GET模型列表归一化。
src/main/ai-profiles.ts：SQLite配置＋系统加密密钥，读回仅hasCredential/credentialStorage；系统加密不可用则只在会话Map保留，不落明文；普通编辑保留密钥，服务origin改变时不静默复用旧密钥。未知额外输入不写入metadata。
Workspace schema3迁移前备份：v2->v3，旧文档/偏好保留。原v1迁移测试按新最终版本更新，仍验证pre-v2备份内容。旧v2程序会拒绝打开v3库，代码回退测试只用隔离副本，不降级个人库。
模型设置：原生dialog、关闭恢复焦点、阻断背景Ctrl+W/Tab；四协议选择、八个配置预设（OpenAI、五家国内、Claude、Gemini）、手填模型、密钥留空保留、JSON参数、输出/超时上限；模型列表不可用仍可手填。测试连接只发固定短句。
官方已核对国内兼容预设：DeepSeek、百炼、方舟、千帆、混元。额外Kimi/GLM/MiniMax/硅基流动预设待核对后再加；无真实服务密钥实测，不冒充厂商全部验证。

测试日志：evidence/cruise-protocols。初始缺模块失败；参数类型/Claude初始块、未知metadata、origin变更、模型列表与UI均观察红→绿。实际SQLite加密/会话fallback用注入SecretBox单测，Electron设置测试调用实际系统加密。

## Rulings（续跑必须沿用）

- 在既有专用项目非main分支顺序实施，未创建新worktree；用户批准的路径和单一实施者优先，避免定时任务读错目录。现有Git分支保留原发布历史。
- Task1解释requestId注册表及start/cancel/onAiText IPC移到Task3：真实块身份校验由Task2提供，不先暴露未校验的解释接口；当前固定连接测试有单flight和退出取消。代价：Task3必须完成注册表而非误以为Task1已经接好Cruise。
- AiProfileView补credentialStorage只读字段，以便明确显示session-only fallback；不回传秘密。
- 核心四协议/五国内兼容预设先交付；额外预设与原生协议不阻塞可用Cruise，在官方核对/专项测试后再添加。
- 不对真实收费模型跑自动压测；协议模拟测试≠真实厂商实测。

## 接下来具体动作

1. 确认本任务提交与证据已落盘，检查Git状态；读Task2 brief，从Task2开始，别重写Task1。
2. Task2写cruise-blocks失败单测：双栏/中文/重复句、跨行、四旋转crop与无文字页、稳定块ID和异步旧文档隔离；再接PdfReader按需页读取与临时定位。
3. 完成Task2后reviewTask1+2累计变更，特别检查凭据/IPC/分块精度与内存、模型设置模态操作。修复Important后继续Task3。
4. 只有完整release:verified通过后更新latest；每批证据四件套与隔离回退。到点停机不把未完成代码标记发布。
