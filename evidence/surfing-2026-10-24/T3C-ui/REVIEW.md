# 第四批两项审查与修复
独立review Critical无；Important两项：阅读区手动事件未取消Surfing；重新生成路线留下已失效旧路线。四个真实Electron回归先全部失败，修复后全部通过，并保留原始成功闭环，共5通过。
修复1：root user wheel/point/key统一通知，Surfing同步takeoverRef立即取消本地定位与在途请求，不等React effect。修复2：新route提交同步清路线、选择、解释和对应refs，取消/失败允许手动重试，不留假可点击路线。
自查：Runtime被invalidate后提交不能静默成功等不到事件，新增失败测试后明确SURFING_STALE；7runtime+30requests通过。
旧Cruise hooks测试出现一次失败：新hook插入使按首个0/false查找的测试读到Surfing状态；保留既有Cruise hooks顺序后旧3项和全套581项通过，未弱化或改动旧测试。
设置区在生成后折叠；窗口配置/同意/模型元数据刷新；当前UI进度仅本次打开保留，T4未完成。真实API/实际用户试用/打包性能仍未验收。
