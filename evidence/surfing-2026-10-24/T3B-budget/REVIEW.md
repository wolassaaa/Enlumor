# 第三批两项审查与处理
Critical无。Important：新导航/新证据定位没有抢占旧pending focus，旧异步任务可拉回上一页。独立review实际复现；新增两种新viewport意图测试先2 failed/9 passed后修复：仅在有旧viewport任务时invalidate并取消，按job token清理，read_page不抢占。修复后48专项通过，typecheck通过。
Token worker未知模型拒绝、计数后再次身份检查、取消监听清理、错误/退出终止路径未发现确定Important。仅本地离线验证，尚未接SurfingPanel/IPC，不等于Surfing产品完成。
