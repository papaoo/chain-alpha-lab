# 系统架构设计

## 1. 推荐技术栈

默认建议：

- 前端：Next.js + TypeScript + Tailwind CSS
- 后端：Next.js API Routes 或 Node.js 服务
- 数据库：SQLite
- 定时任务：Node cron
- 数据源：westock-data CLI
- 大模型：DeepSeek 可配置 API
- 通知：飞书 Webhook、企业微信 Webhook

## 2. 架构图

```text
Web UI
  |
  | HTTP API
  v
Backend API
  |
  |-- Config Service
  |-- Scheduler Service
  |-- Market Analysis Service
  |-- westock-data Adapter
  |-- Parser
  |-- Rule Engine
  |-- Fact Package Builder
  |-- Company Knowledge Builder
  |-- DeepSeek Client
  |-- LLM Output Validator
  |-- Notification Service
  |-- Report Repository
  |-- Simulated Position Service
  |-- Position Tracking Service
  |
  v
SQLite
```

## 3. 模块职责

### 3.1 westock-data Adapter

- 执行 CLI 命令。
- 解析 Markdown 表格。
- 处理超时、失败和重试。
- 保存原始输出。
- 提供白名单方法，不暴露任意命令执行能力。
- 不允许 DeepSeek 或前端直接调用 CLI。

### 3.2 Rule Engine

- 判断大盘环境。
- 识别主线阶段。
- 过滤候选股票。
- 生成结构化分析上下文。
- 判断公司主营业务与当前主线的匹配状态。
- 生成仓位上限和风险约束。
- 在不调用 DeepSeek 的情况下也能输出基础结论。
- 现行策略入口统一使用 `src/lib/strategy/rules.ts` 的 `buildFactPackage`；旧版 `ruleEngine.ts` 已删除，避免新旧规则并行误用。

### 3.2.1 Company Knowledge Builder

- 基于 `profile` 生成公司基础信息摘要。
- 基于板块和主线数据判断主题匹配关系。
- 可接入 `finance`、`shareholder`、`reserve` 增强公司认知。
- 标记哪些内容来自数据源事实，哪些内容来自规则计算或模型归纳。
- 公司信息不足时，禁止生成长期持有理由。

### 3.3 DeepSeek Client

- 读取配置。
- 调用大模型。
- 校验输出。
- 处理重试。
- 只接收 Fact Package，不接收工具权限。

### 3.4 LLM Output Validator

- 校验模型输出股票是否来自候选池。
- 校验模型引用数据是否来自事实包。
- 校验仓位是否超过规则引擎约束。
- 拦截保证收益、必涨等违规表述。

### 3.5 Notification Service

- 发送飞书和企业微信消息。
- 支持测试发送。
- 记录发送状态。

### 3.6 Scheduler Service

- 按配置运行定时分析。
- 记录每次任务开始、结束、错误。

### 3.7 Simulated Position Service（MVP 后第一增强）

- 创建、编辑、关闭模拟持仓。
- 保存模拟买入价格、仓位、买入理由、买入逻辑、计划周期和失效条件。
- 支持从候选股一键创建模拟追踪。
- 不接券商账户，不读取真实持仓，不自动交易。

### 3.8 Position Tracking Service（MVP 后第一增强）

- 定时追踪启用中的模拟持仓。
- 调用 westock-data 获取分时、K 线、技术指标、资金流和板块状态。
- 判断原买入逻辑是否仍成立。
- 输出继续持有、减仓、退出、等待确认、数据不足等条件化建议。
- 触发通知并保存追踪历史。

## 4. 数据库表设计

### settings

- id
- key
- value
- encrypted
- updatedAt

### notification_channels

- id
- type
- name
- webhookUrl
- enabled
- createdAt
- updatedAt

### scheduled_jobs

- id
- name
- cron
- enabled
- jobType
- lastRunAt
- nextRunAt

### analysis_reports

- id
- reportType
- title
- summary
- rawDataJson
- ruleResultJson
- factPackageJson
- llmResultJson
- createdAt

### market_snapshots

- id
- timestamp
- rawJson
- createdAt

### sector_snapshots

- id
- timestamp
- rawJson
- createdAt

### stock_candidates

- id
- reportId
- code
- name
- role
- action
- companyKnowledgeJson
- evidenceJson
- createdAt

### prompt_templates

- id
- name
- content
- version
- enabled
- updatedAt

### run_logs

- id
- jobName
- status
- message
- rawOutput
- createdAt

### simulated_positions（MVP 后第一增强）

- id
- code
- name
- buyPrice
- quantity
- positionPct
- buyTime
- planType
- sectorName
- buyPointType
- buyReason
- initialRuleResultJson
- initialCompanyKnowledgeJson
- invalidCondition
- reduceCondition
- holdCondition
- enabled
- status
- createdAt
- updatedAt

### position_tracking_snapshots（MVP 后第一增强）

- id
- positionId
- timestamp
- latestPrice
- estimatedPnlPct
- marketState
- sectorStage
- trendState
- fundFlowState
- dataCompletenessJson
- rawDataJson
- ruleResultJson
- createdAt

### position_tracking_reports（MVP 后第一增强）

- id
- positionId
- snapshotId
- action
- summary
- evidenceJson
- riskFlagsJson
- llmResultJson
- notificationStatus
- createdAt

## 5. 板块归一化模块

`src/lib/sector/normalization.ts` 是全系统唯一的板块命名归一入口。

- 规则引擎使用它合并主线、判断阶段迁移、匹配成分股和核心股连续性。
- 报告记忆使用它查找同名主线，避免历史里“元件/被动元件概念”被当成两条线。
- 数据适配器使用它做同义板块兜底；如果使用的是近似别名，必须保留 warning，不能伪装成直接命中。
- 新增板块别名时只能加入高置信同义项；产业链相关、上下游扩散和资金竞争不在归一化层合并。

## 6. 安全设计

- API Key 不在前端明文展示。
- Webhook URL 不在日志中完整输出。
- 配置可加密存储。
- 命令执行只允许白名单命令，不允许用户输入任意 shell。

## 7. 错误处理

错误类型：

- westock-data 调用失败。
- DeepSeek 调用失败。
- 通知发送失败。
- 数据解析失败。

处理方式：

- 保存错误日志。
- 页面提示失败原因。
- 定时任务失败不阻塞其他任务。
- 数据缺失时报告中必须说明。

## 8. 数据源解耦与真实来源留痕

系统采用 Provider + Fusion 的数据层设计，不采用“一键切换单一数据源”的方式。原因是 A 股投研所需字段分散：一个来源很难同时稳定覆盖全 A 宽度、涨跌停池、板块成分、个股 K 线、技术指标、资金流、公司 F10、财务和交易日历。

当前 Provider 注册表位于 `src/lib/data/providerRegistry.ts`。字段级真实来源必须按以下规则记录：

- `tencent_zixuangu`：腾讯自选股行情数据，访问路径为 `westock-data CLI`，展示为“腾讯自选股行情接口（通过 westock-data-skillhub 访问）”。
- `eastmoney_public`：东方财富公开数据，访问路径为 `Eastmoney public HTTP API`，展示为“东方财富公开行情/F10接口”。
- `tushare`：Tushare Pro，当前为待配置来源。用户提供 token 后再启用，优先用于交易日历、基础资料、复权日线、财务、指数成分和长期历史数据校验。
- `local_cache`：本地缓存，只能用于历史复盘、连续性和接口失败时的降级参考，不能伪装成最新行情。
- `rule_engine`：规则引擎计算结果，只代表由真实数据推导出的结论，不是外部行情数据源。

每个关键字段进入 FactPackage 时都应该携带 `DataSourceTrace`，至少包含 `provider`、`providerName`、`accessPath`、`sourceLabel`、`quality`、`freshness`、`sourceUrl` 或 `command`、`warning`。页面和 DeepSeek 事实包不得把 `westock-data` 技能名当作最终数据来源。

历史记忆与模型上下文：

- 系统长期保存分析报告和增量事件，但进入本次规则/模型上下文时必须压缩。
- 大盘与主线连续性使用短线窗口和中线窗口：短线负责边际变化，中线负责主线持续性。
- 质量窗口统计最近已保存报告的可展示数量、过滤数量、解析失败和时间跨度，生成 `memory.market.timeline_quality`。
- DeepSeek 只能拿到压缩后的最近时间点、阶段路径和质量 fact；不得把完整历史报告直接放进 prompt，避免 token 成本随时间线性膨胀。
- 如果时间链可靠性为中/低，模型只能输出“连续性证据不足/需重新验证”，不得把断档当成真实行情转弱或主线失效。

融合原则：

- 腾讯自选股优先承担指数 K 线、指数技术指标、热门板块、热门股、个股 K 线、技术指标、资金流和公司简况。
- 东方财富优先承担全 A 宽度、涨跌停池、板块成分、个股报价，并作为个股日 K、资金流、F10 的补源。
- Tushare 接入后按字段加入融合优先级，不能直接覆盖现有来源；多来源冲突时必须降级或标记冲突，不得让模型自行选择。
- DeepSeek 只接收压缩后的来源留痕，不接收 API Key、外部工具权限或完整原始响应，避免 token 膨胀和工具越权。
