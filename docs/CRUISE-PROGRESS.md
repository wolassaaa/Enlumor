# Cruise 夜间执行记录

计划：docs/superpowers/plans/2026-10-17-cruise-overnight.md
设计：docs/superpowers/specs/2026-10-17-cruise-design.md
用户已于2026-10-17明确回复“确认执行”。不再请求重复批准。
截止：2026-10-17 08:00 Asia/Taipei。07:40后不开始新任务；保留原已验证构建，截止后收集结果并暂停自动任务enlumor。
工作目录：D:/codex project/Enlumor；分支feat/cruise-overnight；用户批准在此项目顺序实施，单一实施者。不要另建竞争项目、重复实施或上传GitHub。

## 当前状态

- Task1：模型设置与四协议底座已实现，专项31项单测、2项实际Electron流程通过；已提交9bafc46；全部66项单测通过，开发构建通过。不是完整Cruise，也不是正式发布。
- Task2：完成并提交e91e19e；11项分块/生命周期测试、全部77项单测、4项实际Electron（设置2＋定位2）通过；四种裁剪源旋转、150%/200%显示缩放。临时强调不入批注表。Task1+2独立review的1项Important和2项Minor均已修复并有回归测试。
- Task3+4：完成且统一review通过修复，提交14b50c6 / 1d72b3f / dbd7668。2项Important各RED→GREEN；0.1.13完整release:verified已通过，最新指针已更新。
- Task5/6：DashScope/星火原生尚未实现；不能在设置中作为可用协议出现。
- 两任务一review：Task1+2与Task3+4均完成唯一独立review及Important修复，不重复派审。Task5/6后移，本轮优先候选发布门禁。
- 当前最新已验证发布为0.1.13（保留0.1.12目录），开发源代码为SQLite v4模型配置/会话表；个人userData未迁移，测试全用临时profile。

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

1. 读取Git状态、计划与本记录；Task1/2已完成，勿重写。Task3从状态机失败测试开始，解释IPC必须在主进程验证文档/指纹/当前页原文锚点。
2. 完成Task3再做Task4；两项完成后调用一次只读独立review，修复Important。
3. 完整release:verified通过后才更新latest；目前保留0.1.12。每批证据四件套与隔离回退。到点停止新增任务。

## Task2补充记录
- src/renderer/cruise-blocks.ts只用原生PDF坐标，按近邻基线聚行、双栏与跨栏页眉/页脚分带，段落按原文item边界限制1200字符。
- Ruling：单个text item超过1200字符时明确CRUISE_BLOCK_TOO_LONG，不按字符等宽猜位置；后续Task3可从真实文字选区起点处理，代价是极端排版页不能整页自动分块。
- readPageBlocks缓存最多6页，返回深拷贝；换文档/clear清理，异步代次不符则拒绝旧结果。locateCruiseBlock校验doc/fingerprint，复用临时flash，不写annotation表。
- UI提供实际可点击的本页阅读块列表；这不是完整巡航，更没有模拟AI解释。扫描页不生成假块。
- 全部77项单测、开发构建/类型检查与Electron4项通过；完整发布门禁尚未跑。
- Review回归：20px/40px栏间距且左栏宽260px，不再串栏；翻页清空面板并拒绝旧异步结果；reader换文档/clear/缓存6页和深拷贝有直接测试。

## 2026-10-17 02:55续跑检查点
- 当前无在途产品修改或测试。定时任务enlumor保持ACTIVE，每15分钟续跑本线程，截止08:00。下一步Task3；Task3未开始，不把预研读取算实现。
- Task1+2修复及证据已提交；下一批Task3+4完成后才review。暂停/持久化及原生厂商适配均仍待办。

## Task3实施记录
- 状态机6项、requestId/取消/脱敏5项；全部88项单测、8项Python测试、2项Cruise Electron流程、build/typecheck通过。隔离回退恢复Task2（CRUISE0 READ_BLOCKS1 SCHEMA3），原PDF/个人数据不变。
- Python仅新增只读verify-block：主进程先校验doc/fingerprint/页码/有界quote+quads，再用原文件字符中心与quad核对原文；校验失败不发网络。字体提取差异可能保守拒绝，不伪造证据；Task4/发布须重打包worker。
- 解释只发JSON blockId+当前quote，不发路径/整份PDF；模型文字只作React纯文本。引用回跳仅指向当前内部块，不接受模型任意URL/ID执行。
- 窄接口start/cancel/onAiText；取消验证中任务会阻止后续网络，旧回调全部隔离。手动wheel/pointerdown/页码/导航与后台暂停；程序focus的scroll不触发手动接管。模型设置关闭刷新服务，不自动请求。
- 更正Task2验证记录：最后新增生命周期测试后typecheck曾报测试私有字段类型错误，之前串联命令只检查最终退出码，误记类型检查通过。Task3开工已将harness返回类型限定为测试any并重新独立运行tsc通过；其余Task2单测/E2E/回退输出真实。后续所有命令逐项检查退出码。
- 下一步Task4：自动20/12/6秒、后台停止、数据库schema4迁移备份、保存确认/恢复paused与来源。Task3+4后一次统一review；不提前标发布。

## 2026-10-17 06:50 Task4检查点
- 用量限制导致03:20中断，06:47恢复；未重复实现Task1-3。Task3提交14b50c6。
- Task4：schema4 cruise_sessions、升级前pre-v4备份、事务单语句提交、原文/结果大小边界；保存失败有重试且未确认前不自动推进。20/12/6秒，只有解释完成+保存确认才倒计时；重启读取已完成解释及原服务/模型，状态paused，不发API。
- 已通过94项单测、8项Python、3项Cruise Electron流程（含暂停>6秒无新请求、自动继续、强退重启无请求、返回缓存旧答案）；开发构建/类型检查通过。Task4隔离回退恢复CRUISE1 PACING0 SCHEMA3，live unchanged。
- 修复本次真实RED：flush最前新增await使flight.current取值延后，load自等待导致PDF不显示；将Cruise flush放在原flight await之后，3项Electron均转绿。历史schema2模拟测试必须删除后来新增cruise表后再标version2，最终schema断言更新4，保留原pre-v3备份检查。
- Task3+4唯一只读reviewer cruise_batch_two_review已运行，不重复派审；收到Important后RED→GREEN。全套Electron正在跑。Task5/6本轮后移，优先完整发布门禁及性能验收。
- 仍保留已验证0.1.12，个人userData从未用于测试；当前修改未作为release发布。

## 2026-10-17 06:57 review完成与发布候选
- Task4提交1d72b3f。唯一reviewer cruise_batch_two_review报告2项Important：空文字页skip重复读取、可见但失焦仍自动调用。两项各实际RED，已修复后Cruise4项Electron通过23.8s、全部94单测通过，隔离回退再次通过。
- 修复空页先reader.go同步页码；主进程BrowserWindow blur取消解释并发窄background事件，Panel停止计时器。没有第二轮review空转。
- 全套开发Electron92项通过3.7m（在两项修复前）；下一步版本0.1.13候选完整release:verified，含最终EXE全套93项及200页压力两样本/画笔门禁。通过前latest仍0.1.12，不推GitHub。
- 本轮不再扩展Task5/6。若发布失败修门禁，保留原latest；07:40后不开新任务，08:00停止并暂停automation enlumor。

## 06:58 在途发布（历史记录，07:03已完成）
- 唯一实施者/root正在等待 npm run release:verified（统一exec session45522），日志 evidence/cruise-session/RELEASE.log；已完成build/unit/Python/worker/打包，进入最终EXE全套93项E2E。不要启动第二个构建或修改产品。完成后收集压力报告、检查latest、提交版本号和证据；本轮不做Task5/6。

## 2026-10-17 07:03 已验证发布
- npm run release:verified退出0：94Vitest +8Python +93最终EXE E2E（3.7m）；PACKAGED_READER/PORTABLE_STARTUP_SQLITE/PORTABLE_NO_PYTHON_OPEN_EXPORT全部PASS。Edge截图已实际查看，高亮与便签显示正确。
- release/latest.json现在0.1.13；EXE release/Enlumor-0.1.13-win-x64/Enlumor.exe；ZIP release/Enlumor-0.1.13-win.zip，SHA256 81ef041afb624737c60952312f9f0e1f72118a40a8f694810b47a81696571b41。已重新打开并校验hash。
- 200页文本32MiB/1000批注：便携解压启动中位591.9ms，framep9512ms，保存p955.6ms，8正文canvas/4缩略图canvas；扫描样本420.8ms/11.7ms/5.1ms；均零长任务。1000条画笔×256点，擦除撤销384ms，零长任务。
- Ruling：结果缓存限定64条且合计512K字符，单次输出64K，避免长文Cruise无界内存；超限逐出较早完整解释，UI/README明确说明，旧结果再次解释必须用户显式继续/解释。个人原PDF与userData不变，无GitHub推送/真实收费API。
- Task5/6专有原生接口本轮后移，不在UI暴露。剩余窗口只复核已验证包与证据，不新增产品功能/重复review/发布；08:00暂停自动任务enlumor并汇总。

## 07:06 定时任务状态
- enlumor已通过工具更新，ACTIVE，每15分钟仅做已验证包/证据复核至08:00；无新问题安静，到点PAUSED。当前无在途实施/测试。工作树产品代码已提交，latest0.1.13。
