# Enlumor 0.1.14 API配置与兼容矩阵

六种协议共用Cruise控制、取消/超时、原文锚点验证和加密配置；不按模型名称猜协议。所有协议有本地契约测试及实际Electron流程；本次没有厂商真实密钥连接实测。

|协议|认证与输入|地址/模型配置|验证|
|---|---|---|---|
|OpenAI Chat|Bearer；messages|Base URL或完整chat/completions，手填model|JSON/SSE契约|
|OpenAI Responses|Bearer；input/instructions|Base URL或完整responses，手填model|独立JSON/SSE契约|
|Claude Messages|x-api-key/版本头；system/messages|Base URL或完整messages|JSON/内容块流契约|
|Gemini|x-goog-api-key；contents/parts|v1beta基础地址或完整生成接口|JSON/SSE契约|
|DashScope原生文本|Bearer；input.messages/parameters|完整text-generation/generation或/api/v1基础地址|JSON/SSE增量/累计、null及字符串null契约；真实Electron模拟|
|Spark原生WS|APPID/APIKey/APISecret；HMAC-SHA256签名|完整wss地址；模型ID填写domain，与版本路径对应|固定时钟签名、真实本地WS、多帧/错误/截断/取消；真实Electron模拟|

## 国内服务

现有兼容预设：DeepSeek、百炼/通义、火山方舟/豆包、百度千帆、腾讯混元。其他符合所选协议的厂商可手填其官方地址/模型；不等于每一家、每一种模型或专有签名已实测。
DashScope原生预设保留现有有效域名，也支持用户填写业务空间专属完整endpoint。仅支持文本生成，不把多模态/应用编排接口当作同一种格式。原生模型列表没有统一GET端点，本实现明确返回不支持发现并保留手填入口。
Spark预设使用Lite地址wss://spark-api.xf-yun.com/v1.1/chat，domain填写lite。更改版本时同时核对官方地址/domain；不自动换厂商/模型或重试计费。Lite等不支持system角色时，将固定指令与当前原文数据折入单条user输入。

## 凭据与网络

Spark三项凭据一次完整填写，或编辑时全部留空保留；保存后不回显。变更服务origin或协议且未重填凭据时清除旧凭据，避免错误复用。系统加密不可用时仅保留本次会话，不落明文。
HTTP协议使用Electron网络栈。Spark使用Node内置WebSocket直连，不自动继承Electron HTTP代理，设置界面有提示。默认HTTPS/WSS，仅显式loopback允许HTTP/WS；URL内嵌认证、查询参数/认证字段覆盖被拒绝。

## 官方核对来源（2026-10-17）

- [DashScope请求/响应](https://www.alibabacloud.com/help/zh/model-studio/qwen-api-via-dashscope)
- [DashScope SSE，包括字符串null生成中标记](https://help.aliyun.com/en/model-studio/stream)
- [Spark接口、domain与版本地址](https://www.xfyun.cn/doc/spark/Web.html)
- [Spark WebSocket签名](https://www.xfyun.cn/doc/spark/general_url_authentication.html)

## 本轮验证与后续

完整release:verified：110Vitest、8Python、95最终EXE流程通过，内置PDF程序无需外部Python；200页文本/扫描样本及密集画笔预算通过。具体原始记录见evidence/native-apis/VERIFICATION.txt与evidence/releases/0.1.14。
扫描压力样本首张缩略图准备曾测得约5.15秒，已记录待后续优化；准备等待与计时阶段分离，滚动/保存/启动阈值未放宽。此次没有宣称优化这段准备延迟。
