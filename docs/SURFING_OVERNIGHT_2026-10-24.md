# 基础 Surfing 夜间设计、挑刺与执行台账

截止：Asia/Taipei 2026-10-24 08:00；07:30停止开新任务。用户已授权本轮先review、挑刺、计划、连续推进。只在现有候选工作树推进；不提交、不发布、不修改个人数据。负责聊天01a16949-eadc-7591-b182-77e6a6d59d01；重复20min heartbeat已暂停，仅20min-enlumor-2在本聊天接续。

## 已有进度与挑刺
- 正式0.1.15保留。候选HEAD ac6d4ac含大量未提交编辑接入代码，历史150 Electron通过/1密集笔迹失败；当前状态不得简单写成生产接入完成。
- 单测已在本聊天上一轮实跑468通过，但不是全文上下文或真实Surfing的证明。
- 新阅读命令能读页、定位、取消；缺统一全文快照、严格路线输出合同、新Surfing UI与会话恢复。
- 旧Cruise当前块输入不符合用户已确认的全文共读方向；不要改名冒充Surfing。
- PDF文字不等于图表理解；空页、超限、错序/提取失败必须显式表达。容量按已确认模型与输出预留处理，不能按显示名猜测。
- 来源必须绑定文档指纹/修订；生成切入点不能信任模型页码/坐标，必须只引用本地passageId。
- 用户打开文件不触发网络。全文发送必须先显示文档、服务、范围与局限并由用户发起。个人凭据与付费调用不在本轮自动化中读取/执行。
- 新编辑导出仍未接通，不能连带声称本轮完成；Surfing首版只使用已有阅读命令与临时强调，不自动编辑用户批注。

## 最小设计与取舍
选择现有阅读器侧栏中的独立Surfing入口：准备本地文档→用户选择模型并确认发送范围→生成最多5个有证据的探索切入点→用户选择后解释并定位原文→继续/跳过/回看/暂停。采用已有协议适配与文档命令；不做自主Agent框架、不复活逐块自动播放、不做SaaS。
候选对比：只做普通问答不能证明Surfing；完整自主编排风险大；有界探索路线是本轮方案。用户已明确要求基础Surfing并授权设计后直接推进，本规格的细节为工程判断，记录后执行，不等待重复确认。

## 文件与接口计划
T1 src/shared/surfing-context.ts：prepareSurfingContext(input)逐页读取CruiseBlock，校验文档身份、revision与来源，给出完整/部分文字范围、空页列表和容量失败；不网络、不渲染、不导航。测试tests/surfing-context.test.ts。
T2 src/shared/surfing-route.ts：严格解析模型JSON切入点（标题、理由、passageIds），白名单字段/大小/数量/重复与ID校验；生成只含文字+来源ID的提示；测试tests/surfing-route.test.ts。
T3 src/renderer/SurfingPanel.tsx与main.tsx最小接入：复用AiProfile、aiText与createReaderCommandHost，显式确认外发、用户驱动生成、接管取消和迟到响应防护。新增真实Electron本地模拟流程测试，不读取个人配置。
T4 复用现有SQLite工作区接口前先审核最小会话保存合同；暂停恢复、文档/指纹/模型隔离与缓存上限，失败可重试；恢复不发API。若需要schema升级先写迁移/备份测试，绝不直接迁移个人库。
T5 完整回归、性能、两篇论文人工验收材料、隔离包与最终review；真实模型仍明确标待验收。

## 执行顺序与验收
- [x] T1：测试先失败；实现本地快照；覆盖取消、切文档、空页、超限、重复ID、坏几何、读取失败、输入快照隔离；专项+类型检查。
- [x] T2：测试先失败；解析并验证路线，未知证据/恶意指令/畸形JSON无导航；专项+全部单测；两项完成后挑刺。
- [x] T3：界面和服务接通；模拟流式失败/取消/切文档不串；用户主动选择切入点才导航。
- [x] T4：会话恢复与失败可重试；保存成功后再报告已保存；两项后挑刺。
- [ ] T5：打包、完整回归与性能门禁，不用历史通过代替当前快照。容量与真实模型未验收就标明。

## 当前执行记录
2026-10-24 00:55：核对候选及旧自动化。另一个旧heartbeat报告原Task2因用量中断；未向其他聊天发送指令。本聊天作为唯一实施接续。下一步T1 RED→GREEN。

## 下一次唤醒
先核对本文件和测试在途状态。只接着下一项，不重做已通过项，不运行竞争构建。07:30之后只验证收口，08:00暂停20min-enlumor-2并报告已完成/失败/待验收。

### T1/T2 初次验证（00:54）
新增surfing-context.ts与surfing-route.ts，专项38通过，类型检查通过，全套32文件/506测试通过。RED为模块不存在，退出1；GREEN退出0。新文件尚未接入应用，不代表Surfing已可操作。只读独立review进行中，完成后先修Important再进入T3。

### T3预检发现与计划修正
现有window.enlumor只提供startBlockExplanation，主进程ExplanationRequests合同严格限1200字符单块，因此T3不能直接将全文塞入旧入口。须先新增独立受限Surfing请求合同与主进程服务，复用generateText和AiProfiles，不暴露任意prompt IPC。主进程从已打开工作区文档与可信PDF提取验证文本快照；renderer路线只能引用该快照。容量先要求明确配置并计入输入包装/指令及输出预留，不把T1的字符上限当作模型token容量。禁止静默截断。
T3应再拆：T3a 请求服务合同/可信来源校验/容量与取消测试；T3b 独立SurfingPanel入口与来源范围确认，复用阅读命令定位；T3c 真实Electron本地模拟联测。根据耗时顺延T4，不跳过来源验证去赶界面。未实际完成保持未勾选。

### 两项后挑刺已处理（00:58）
独立只读review 1 Important：稀疏/退化几何可混入可信证据。三条回归先RED（3 failed /19 passed）后GREEN；新增几何密集性/有限坐标/非零面积检查。Minor补充九个合法不同证据ID仍因超限被拒绝的测试。最终专项42通过；审查修复后全套509通过（之后补1个仅测试用例，最终全套结果见FINAL-ALL-UNIT.txt）。类型检查通过。详细REVIEW.md与原样日志在evidence/surfing-2026-10-24。
下一未完成项：T3a Surfing独立请求通道；本轮没有启动T3实施或构建，没有在途工作。自动接续按本计划推进；T1/T2不要重建。
最终复验00:58：npm run typecheck退出0；npm test -- --reporter=dot：32文件/510测试通过，退出0。最终专项42项通过。最终哈希核验与隔离副本回退退出0，源工作树保留新文件。证据文件已重新打开。T3a待执行；本轮无在途测试/构建。不要把这42项底座测试解释为Surfing产品已完成。

### 01:02 T3a 请求服务第一片（未接IPC）
新增src/main/surfing-requests.ts与tests/surfing-requests.test.ts。请求只接requestId/profileId/context/consent，拒绝renderer任意prompt、来源和路径；从注入的可信host加载源快照、解析完整路线后才发结果。取消/切文档/替换请求抑制迟到结果；未知错误不泄露原文异常。模型窗口和输入计数必须由host明确提供，输入计数含协议框架且加maxOutputTokens，未知容量/计数即拒绝，不拿字符数充token。
RED（模块缺失）退出1；GREEN19专项通过退出0；typecheck退出0。只是服务类离线测试；尚无主进程注册/可信PDF加载host/实际tokenizer/Surfing界面，不能宣称模型通道可用。
下一项T3a后半：新增可信host适配器，复用runPdfTask的editing-page/verify-block核验或有界文档文字提取，来源ID必须能映射到阅读器；明确实际支持的模型计数方式与用户可见容量配置。不接受renderer全文自报完整。随后T3b接IPC和UI，做本地模型模拟Electron端到端。
注意：Python editing-page与PDF.js buildPageBlocks的文本分块/ID不相同，不能直接把Python生成ID交给现有show_evidence。可选择校验renderer快照与每页可信文字/锚点并核对完整范围，或让阅读器命令支持经验证的本地映射；先写相关失败测试再选择最小实现，不做两套权威来源。
01:03本轮收口：T3a服务类19专项通过，类型检查通过，全套33文件/529测试通过，隔离两文件回退通过；四件证据在evidence/surfing-2026-10-24/T3A/。未接host/IPC/UI。无在途测试或构建。下一轮从T3a可信来源适配开始，先明确PDF.js/Python分块映射与实际token计数，不重复做服务类。

## 01:23 来源方案裁定与第二批进度
Ruling：不让renderer自报“完整全文”。新Python surfing-document操作一次读取可信源文件，以原生PDF坐标提供稳定surf-页-块-行ID；前后校验原文件hash，保留每一页含空页，不读图像像素、不做OCR。新TS loader通过workspace.verified取得路径，核对响应页数/指纹/完整页序，再复用T1快照验证。PDF.js与Python的ID不同并不需要互相猜测：下一步Surfing专用DocumentCommandPorts.readPage从此可信快照取passages，focus仍复用reader.locateCruiseBlock，保留现有runDocumentCommand取消/当前文档防线，不改变旧命令host行为。
已完成：tests/python/test_surfing_source.py 先模块缺失RED后7通过；包括四旋转+裁剪与现有verify_block实核验、hash不变、CLI、容量失败。tests/surfing-source.test.ts先RED后12通过；typecheck通过，全部Python21通过。候选新增src/main/surfing-source.ts并修改python/export_pdf.py，原件/hash保存在evidence/surfing-2026-10-24/T3A-source/originals与ORIGINAL_HASH.txt。第二批独立review进行中。
限制：原生垂直/反向几何不满足当前reader定位合同会显式拒绝，不标成完整支持；单行>1200、全文>160k字符/5000段/2000页或worker响应>1MiB拒绝而不截断。文字阅读顺序采用提取器顺序，尚须真实论文人工验收。未接IPC/UI，token测量仍须后续具体实现。
01:25第二批挑刺完成：独立review无Critical/Important；Minor实际错误码退化已5项RED→GREEN修复。来源提取去掉图片像素保留，仅读取文字；reviewer独立36项+7Python来源测试通过。T3b待做：可信快照证据端口→实际容量配置/计数→main/preload/Bridge接入→SurfingPanel与Electron本地模拟，不重新做前面服务/提取器。真实模型仍NOT EXECUTED。
01:26最终复验：34文件/546单测、21 Python、typecheck均退出0；第二批review完成；隔离副本回退恢复3原件hash并删除3新增文件，Python行为确认旧操作保留且surfing_document消失；活候选保留修改，正式包与个人库未动。无在途构建/测试，下一轮从可信快照命令适配与明确模型容量配置继续，再接IPC/UI，不重复底层。四件证据已重新打开。

## 01:49 可信证据定位与模型预算裁定
- 新createSurfingCommandHost直接用已验证snapshot提供readPage，再复用runDocumentCommand和reader.locateCruiseBlock；不混用PDF.js旧ID。9专项通过，包括错误页/未知ID、用户接管、快照替换、跨文档和待执行focus迟到抑制。一次2项失败根因是缺context被旧executor判INVALID；适配器明确返回STALE，未弱化断言。
- 新增精确依赖js-tiktoken1.0.21，为明确列出的openai-chat/o200k模型计数；未知模型/协议返回null，不猜DeepSeek等的编码，不把字符数当token。模型窗口仍由用户明确配置，计数含role/chat framing和1024保守余量，不声称服务端精确账单计数。首版Surfing模型支持边界须在UI明确，其他BYOK/旧Cruise不改。
- tokenizer表和运算在独立Node Worker，不在Electron main/renderer计数；请求服务await异步计数，并再次检查取消/文档身份；计数取消/失败/缺worker/超时不发模型请求。scripts/build.mjs已包含独立workerentry。
- npm install --ignore-scripts将本工作树node_modules共享入口替换为本地依赖目录；未修改主checkout依赖。为避免下载Electron，工作树node_modules/electron/dist仅链接已存在主checkout发行目录，path.txt复制；未改源发行目录。依赖安装日志保留，npm报告0 vulnerabilities。
- 目前46专项、typecheck、build通过。第三批独立review进行中。下一项必须开始main/preload/Bridge与SurfingPanel，避免继续只积累底层；仍不跳过IPC来源、文档切换与外发确认。会话恢复最后补。尚未接IPC/UI，模型实测未执行。
01:50第三批挑刺完成：Important新导航不能抢占旧focus，已两条RED→GREEN修复；当前48专项/typecheck通过。旧文档命令实际Electron4项通过，说明既有阅读命令链未被改坏，不算新Surfing端到端。新模型预算依赖已安装并构建worker通过；具体UI仍未接入。接下来不再追加抽象底座，直接做main/preload/Bridge与SurfingPanel的纵向连接；沿用首版明确模型支持边界和用户填窗口值，真实API仍不调用。
01:52本轮收口：37文件/570单测、typecheck、最终build均通过；既有文档命令Electron4通过（非SurfingUI验收）。隔离回退恢复5原件hash、移除8新增文件，再执行旧请求24测试通过。第三批review Important已处理。所有代码与证据留在本工作树，未提交/推送/发布。没有在途测试/构建。下一轮直接接main/preload/Bridge与SurfingPanel；需要用户显式选择服务/窗口值并确认全文范围才允许网络，夜间只使用本地mock。07:30/08:00收口不变。

## 02:14 首次界面纵向闭环
main/preload/Bridge与SurfingPanel已接入：本地准备全文→明确范围/服务和用户同意→模型探索路线→用户选切入点→可信快照原文定位→携带全文的解释→暂停/跳过/回看。配置区生成后折叠，避免挤占阅读。当前仍为开发候选，不自动发布。
新增SurfingRuntime仅从host取源；请求附显式窗口值，后台tokenizer计数。解释只接受已验证路线的stopIndex，返回完整校验的text/证据ID，无模型任意动作。打开/准备无网络；夜间测试只127.0.0.1模拟服务，未读取个人配置或调用真实API。
第四批review两项Important已实际Electron RED四失败→GREEN五通过：阅读区wheel/PageDown/点按原先只取消旧host，已走同步takeoverRef立刻取消Surfing；重新生成时旧路线在后端失效但UI残留，已同步清route/refs/selected/answers，取消或429失败后可手动重试。自查Runtime stale提交改为明确SURFING_STALE，新增RED→GREEN，避免UI等不到事件。
完整单测初跑有一处旧Cruise接管测试选错新插入的第一个0/false hook：保留既有Cruise hooks顺序，把新Surfing hooks放在其后，未修改测试或弱化断言；旧专项3通过。当前全部单测结果以FINAL-ALL-UNIT.txt为准。既有文档命令4+新Surfing5真实Electron共9通过；这是本地模拟模型流程，不是真实模型质量/性能验收。

## 下一步T4（不得重复界面接入）
当前界面明确写“进度仅本次打开保留”。下一任务是在同一workspace SQLite新增有界Surfing会话表/存取类，仅隔离测试数据，不改个人库；保存route、selected、已验证解释、文档指纹与来源模型元数据，设置容量上限。恢复必须先重新取得可信snapshot并核对文档/模型/证据，再恢复paused状态，不能自动发送API或自动跳页。恢复后重新同意范围才继续；后端也须恢复经过校验的route，避免只恢复UI导致ROUTE_REQUIRED。保存失败保留本地进度和重试入口，已保存只在COMMIT后；接入flushRef和关闭/切文档保护，真实Electron重启/失败重试验证。先RED后GREEN，最后两项review，再完整候选打包与性能。真实模型仍单独待验收。
02:16本轮最终：38文件/581单测通过，最终build退出0，最终Surfing真实Electron本地mock5项通过；合并旧文档命令共9项通过。隔离回退7原件hash+删5新文件，再旧服务26测试通过；四件证据已重开、UI截图已视觉检查。无在途测试/构建，无真实API调用/提交/发布。T3基本离线纵向闭环已通；继续T4会话持久恢复（详见上一节），之后补跨文档/异常和最终候选门禁，不把mock结果说成真实模型验收。

## 02:21 T4a 持久恢复存储合同
新增有界surfing_sessions表仅在首次保存创建，不修改user_version、不迁移个人库。session字段version=1/documentId/fingerprint/source(profileId,name,model,signature)/route/selected/answers/contextWindowTokens/status=paused；≤262144 UTF8 bytes、≤5切入点、每解释≤8192字符。保存只接runtime权威已验证结果，renderer仅提交context+selected，不能提交模型文本。source.signature仅hash公开配置，不含密钥；恢复用profileView元数据核对，不解密凭据。先重提可信snapshot，再检查全部证据与模型签名，后端恢复route合同，UI保持paused、不同意网络、不自动定位。恢复/保存失败不覆盖旧记录；SQLite单语句提交完成才回执。
02:29第五批只读review完成：未确认Critical/Important，独立重跑3文件/58相关测试通过。SQLite存储/权威runtime进度层完成，尚未接UI。原件在T4-store/originals。现在接UI/IPC与flush；恢复需“已保存”实测、重启不请求、不导航，保存失败必须保留草稿与可重试。


## 02:44 T4持久恢复纵向闭环与第六批挑刺完成
- 新增surfing_sessions有界SQLite存储与runtime权威进度，保存只收context/routeRevision/selected；模型文本和证据由主进程已验证结果提供。原有user_version未修改，表仅首次保存创建。恢复核对文档指纹、全部证据及公开模型签名，拒绝损坏/变更记录，不解密密钥。
- UI已接入：路线/所选处/解释落库成功才显示“已保存”；重启后重新准备本地文字，恢复暂停、不勾选同意、不调用API、不自动跳页；缓存阅读无需API，主动再同意可继续解释；SQL失败保留进度、阻止关闭、支持明确重试。
- 两项初次Electron RED（缺保存状态）→中间失败（普通阅读500ms autosave错误调用pause）→取消普通flush里的pause后GREEN。第六批独立review发现原生关闭门禁竞态：专用reading:flush在保存前须停止请求；新增实际Electron关闭通道RED（仍解释中）→main onFlush专用handler先同步surfingCancel再flush→GREEN。日常autosave不会中断活动解释；迟到解释也不会在关闭保存门禁后新增进度。
- 最终：39文件/602单测、21 Python、build、旧文档命令4+Surfing8共12真实Electron本地mock测试均退出0。独立review复核关闭修复解决所报竞态。真实模型质量/容量人工验收仍NOT EXECUTED，未调用付费API。
- 四件证据在 evidence/surfing-2026-10-24/T4-combined：MODIFIED_FILE.zip（12文件）、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh。隔离回退恢复9原件hash、删除3新增文件；原runtime/request37测试通过，旧UI会话内保留文案恢复；活候选12文件hash仍与修改档一致。回退fixture最初checksum CRLF/测试发现目录错误已修正并实际重跑，失败日志不作为通过证据。四件文件均已重新打开核验。

## 下一未完成任务：T5候选门禁（不要重做T1—T4）
先检查没有在途实施者/测试，再对当前候选运行完整既有Electron UI回归，明确记录原编辑preview性能门禁是否仍失败；再做隔离候选打包（独立输出目录，不覆盖release或0.1.15），本地mock包内Surfing验收。补两篇真实论文的本地提取/证据定位样本和人工真实模型验收清单；真实API不自动运行。不扩展SaaS/跨文献/复杂AI编辑。出现失败先review根因、RED再修复，按两项挑刺。当前没有在途构建/测试，未提交/推送/发布。07:30只验证收口，08:00停止并暂停同一自动化。


## 02:56 T5进行中（当前只接续，不重跑在途套件）
完整开发版UI初跑159项：157通过/2失败。现有editing-preview dense1000仍超预算（1307ms>1000ms，mutation worst longtask67ms>50ms），不改门槛、不声称已修复；另一个packaged-only用例因默认release/win-unpacked/Enlumor.exe不存在失败，现以独立候选环境变量重新验收。
第七批全链路只读review发现标签切换/关闭同类竞态：load/closeTab未在flush前停止Surfing。新增延迟reading:save真实Electron两项RED（解释中而非已暂停）→在load guard后和closeTab合法id后同步surfingCancel→两项GREEN，602单测通过；reviewer复核已覆盖所报竞态。Escape只暂停旧host列Minor，未扩展。
独立候选已构建至 evidence/surfing-2026-10-24/T5-package/MODIFIED_FILE，产品名和包名带Surfing-Candidate；未动release/正式0.1.15，也不签名/发布。PyInstaller重新构建bundled PDF worker。实际包内Surfing10项本地mock全部通过，包括ASAR tokenizer worker、重启恢复、SQL失败重试、关闭/切文档边界。真实API仍未运行。
当前在途：完整包内161项串行Playwright回归（T5-package/FULL-PACKAGED-E2E.txt）。不要并发启动第二套UI或性能测量/构建。待完成再记录整体结果；候选不是正式发布。工作区没有可识别的两篇真实论文样本，不能把合成fixture冒充论文验收，后续验收表保留待提供样本/用户真实模型操作。


## 03:06 T5第一批收口：独立包与完整门禁已实跑
完整包内161项回归已结束：160通过/1失败；唯一失败仍是既有editing-preview dense1000（eraseUndo1251ms>1000ms，mutation worst63ms>50ms）。开发版那项“包路径不存在”的失败在正确指向独立候选后通过；实际无外部Python打开/导出通过。未改旧门槛，整包未全绿，不称发布验收通过。
候选text/scan两组200页/约32MB/1000标识+缩略图基准均通过原门槛：text滚动p95 11.5ms/保存p95 4.4ms；scan 12.5ms/5.9ms；实际exe启动三样本中位数分别434.9ms/458.4ms，均<1500ms。Surfing本地mock10项在专项及整包套件均通过。当前单测602、Python21、typecheck、build通过；真实模型/真实论文仍未验。
第八批只读结论审查确认：基础Surfing包内离线闭环通过；整包性能门禁未全绿；真实模型和两篇论文未验收，三者不能混写。Escape只取消旧host列Minor，不为凑进度扩功能。
独立入口：evidence/surfing-2026-10-24/T5-package/OPEN-CANDIDATE.cmd，固定独立user-data，--check已实际通过，未启动个人库。验收表：docs/acceptance/surfing-overnight-2026-10-24.md。候选产品名/包名带Surfing-Candidate，正式0.1.15和release/latest未改，不提交/推送/发布。
四件主证据：T5-package/MODIFIED_FILE（实际候选包目录）、DIFF_FILE.patch（夜间来源改动）、VERIFICATION.txt、可执行ROLLBACK.sh。另有SOURCE_SNAPSHOT.zip、原/改hash、完整原样日志、旧密集笔迹失败trace及性能JSON；隔离夜间来源回退恢复10原件、移除27新增来源/文档文件，旧App接管3测试和旧Python14测试通过，活源和独立包保留。生命周期小片的四件证据另在T5-lifecycle。当前无在途实施者/构建/测试。

## 下一未完成项 T5b（不是重做完整回归）
优先补基础Surfing已有接口的真实Electron离线负例：后台取消、改变模型配置后的恢复/解释隔离、已准备来源替换、保存失败时标签关闭保护。只增测试验证现有合同；发现实际RED再最小修复，不以新功能填时间。复用本地SSE与临时profile，不读个人密钥、不调用付费API。两项后整体挑刺/回归；若源码未改，不重复8.7分钟完整套件来制造进度。
两篇真实论文样本及真实模型质量验收需要另外的实际输入/用户操作，不能用合成PDF或mock代替。旧编辑预览性能1251ms/63ms失败独立保留，不把修旧复杂编辑列入基础Surfing新增功能。07:30后只测试/收口，08:00停实施并暂停20min-enlumor-2。


## 03:19 T5b在途记录（继续同一候选，不重启套件）
第一批后台/模型变更两项旧候选包首次PASS，属于补充回归，不虚构RED。后台用注入真实main blur/focus处理器，未声称OS实际切后台或提供商忽略abort；模型项通过IPC更新公开配置，未声称设置面板全交互。只读review确认断言有效。
第二批来源替换/SQL失败Ctrl+W：旧包1失败/1通过。实际SOURCE_CHANGED:详细说明被请求服务的整串白名单误降级为AI_FAILED；无网络泄出，但诊断不明确。新增6单位回归先4失败/32通过，再只提取第一个冒号前prefix且保留精确publicErrors白名单后36通过。未知/相似前缀仍AI_FAILED，后缀路径/说明不输出。新开发版两项Electron8.7秒通过，PDF hash恢复、保存失败原记录保留、重试提交后才允许关tab。只读review未发现新增Critical/Important。
已创建新独立候选 T5b-negatives/MODIFIED_FILE（旧T5-package候选及证据保留），源Python未变，复用上一批bundled worker。当前在途：全单测后启动完整包内165项串行回归（T5b-negatives/ALL-UNIT.txt与FULL-PACKAGED-E2E.txt）。不要并发UI/性能/构建；结束后再更新实际数量与当前候选入口。错误分类是唯一生产代码改动，未改性能门槛或旧编辑预览实现。


## 03:31 T5b收口：4项负例、错误分类修复与新候选
- 背景/模型两项首次即PASS，只作为补充覆盖；第二批SQL失败Ctrl+W首次PASS，来源替换首次RED（AI_FAILED而非SOURCE_CHANGED）。六单位先4失败/32通过→仅改公开错误prefix分类→36通过；未知/相似prefix继续AI_FAILED、无私有后缀输出。两项开发版ElectronGREEN8.7秒。
- 最终608单测、21Python、typecheck/build通过；新独立包完整165项中164通过/1失败，Surfing14项全部通过。唯一旧编辑预览dense1000仍1273ms>1000ms，mutation worst62ms>50ms；不放宽门槛，不冒充整包全绿。当前text/scan原性能门槛均PASS：启动中位数445.1/428.4ms，滚动p95 11.5/12.9ms，保存p95 4.9/4.7ms。
- 两批只读review确认断言与修复；最终边界核对确认无新增已确认Critical/Important。后台仅注入main blur/focus，模型仅真实IPC签名校验；真实服务与两篇论文仍未验收。源PDF测试finally恢复并验hash，临时SQLite finally关闭。
- 当前候选入口为 evidence/surfing-2026-10-24/T5b-negatives/OPEN-CANDIDATE.cmd（固定独立user-data，--check通过），旧T5-package包与证据原样保留。新包编译字节与dist一致，构建map中surfing-requests.ts与当前源一致。四件证据和源码小快照在T5b-negatives；隔离回退恢复6原件，旧服务30项+显式“装饰SOURCE_CHANGED回退AI_FAILED且零外发”1项共31通过，活候选保留。来源错误和旧性能失败trace均保存。无提交/推送/发布/真实API调用，当前无在途实施者/构建/测试。

## 下一未完成项T5c：大输入合成压力验证（不新增功能）
现有Surfing大多采用2页短PDF；默认阅读器200页基准不等于全文Surfing性能。下一轮用本工作树临时合成约40页以上、80–120k字符的可核验PDF，测本地完整快照、全文路线请求、原文定位和取消，记录覆盖计数、实际时延与UI响应；证据必须含首/中/末页，不静默截断。另用超160k字符样本确认明确拒绝且零请求。合成样本不称真实论文，也不代替真实模型质量。先写验证测试；现有行为直接PASS则不虚构RED、也不强行改生产代码。只有实际失败才最小修复，按两项review/回归；源码未改不重跑11分钟完整套件。保持07:30/08:00收口不变。


## 03:43 T5c收口：大输入与超限验证（仅测试/文档）
- 首次两项直接PASS，不虚构RED、不改生产实现。42页/924段/96096字符合成单栏ASCII，三次路线/解释请求全文均与独立生成清单相等；review后增强为完整{pageNumber,text}序列相等，并核对app注册页数/源SHA。首/中/末导航，末页flash与真实首行span重叠，暂停后不接迟到内容，hash保持。
- 86页196768字符明确SURFING_CONTEXT_TOO_LARGE、零请求、无部分范围/路线、按钮保持禁用、hash保持。观测值见T5c-large原样metrics；最终prepare1397ms、route978ms、定位+mock解释+等待906ms、pause55ms，renderer帧p95约11.6ms/longtask0。这些含Playwright操作等待，不是纯处理/真实模型延迟、精确几何或整机性能门禁；不拿合成样本充真实论文。
- 两项后只读review无Critical/Important；页码绑定建议已增强。608单测、typecheck通过；当前实际候选相关20项（旧Surfing14+大输入2+文档命令4）通过，增强页码断言后两项再次通过。14个Surfing运行时源文件及现有T5b候选全部file hash保持。未重复167项全套；最后完整165仍164通过/1旧dense性能失败，真实模型/两篇论文仍未验。
- T5c-large四件证据为MODIFIED_FILE.zip（测试、合成输入与文档快照）、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；当前exe仍T5b-negatives，不另造包。原hash与隔离副本回退记录保留；无提交/推送/发布或真实API调用。当前无在途测试/构建。

## 下一步：只读整体挑刺、证据索引与交接收口
现有计划中的基础Surfing离线实现、恢复、负例和大输入验证已有证据。接下来复核规格→实现→验证的缺口和证据路径，整理用户可执行的验收入口与剩余项；只对新出现的实际失败做最小修复，不为占满时间添加功能或重复长跑。真实模型和真实论文需要实际输入/用户操作，旧编辑预览性能独立未通过。未变化保持安静，07:30后只验证/记录/收口，08:00停止实施并暂停同一自动化。


## 交接更新：后续用户试读与全文对话修复已接续
用户否定旧Cruise标题块追问体验后，已实现并打包Surfing-Repair：可信全文+当前页+最近对话，右侧共读，DeepSeek兼容，原文适宽。冻结源619单测、实际修复包Surfing15项通过，隔离回退14原件/旧56项通过。真实模型、两篇论文与修复版用户体验仍待收集。T5b候选和以上夜间各轮数字为历史记录，不再是当前入口。当前请只读 docs/SURFING_HANDOFF_2026-10-24.md 和根目录 Surfing-测试入口.cmd；旧夜间自动化保持PAUSED。此轮只更新交接/状态，不修改生产源或包，不关闭用户窗口，不提交/推送/发布。
