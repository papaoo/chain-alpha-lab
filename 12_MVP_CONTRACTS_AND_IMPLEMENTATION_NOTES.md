# MVP 接口契约与实施校准说明

本文档用于把 MVP 开发前必须冻结的契约、westock-data 实测结论和实施顺序集中到一处，避免前后端、规则引擎和 DeepSeek 集成时各自理解不同。

## 1. MVP 实施原则

- 先冻结契约，再并行开发。
- 先跑通数据 Adapter、Parser、规则引擎和事实包，再接 DeepSeek。
- DeepSeek 只接收 `FactPackage`，不接收任何 CLI、网络、数据库或工具权限。
- 前端只展示后端事实包、规则结论和已校验模型输出，不从模型文本中抽取事实。
- 任何明确买入建议都必须满足数据完整性、公司认知和仓位约束。
- 共享类型只有一个来源，所有 Agent 必须复用，不得私自复制定义。
- 所有核心跨模块对象必须包含 `schemaVersion`，MVP 固定为 `mvp-1`。
- DeepSeek 输出必须通过 `evidenceRefs` 回溯事实，不允许只有自然语言依据。

## 2. 当前 westock-data 实测结论

测试版本：`westock-data-skillhub@1.0.3`

已验证命令：

- `board`
- `hot board --limit 5`
- `hot stock --limit 5`
- `minute sh000001`
- `kline sh000001 --period day --limit 5`
- `kline sh600584,sz300308 --period day --limit 3`
- `technical sh600584 --group ma,macd,rsi`
- `technical sh600584,sz300308 --group ma,rsi`
- `asfund sh600584`
- `profile sh600584`
- `profile sh600584,sz300308`
- `finance sh600584 --num 2`
- `shareholder sh600584`
- `reserve sh600584`

已确认限制：

- `quote` 在当前版本不可用，不能进入 MVP 白名单。
- `hot stock --limit 5` 实测仍返回约 50 行，Adapter 需要自行截断。
- 批量输出会出现 `[Batch]` 元信息行。
- `technical` 会返回大量未请求指标列，无效值常为 `-`。
- `asfund` 的 `LhbInfos` 可能是 JSON 字符串。
- `finance` 和 `shareholder` 是多分节 Markdown 表格。
- `search` 可能空输出且退出码为 0。

## 3. 必须冻结的类型

第一版建议至少建立以下共享类型：

- `ParsedCommandResult`
- `DataSourceStatus`
- `MarketIndexSnapshot`
- `SectorSnapshot`
- `StockKlineSummary`
- `StockTechnicalSnapshot`
- `StockFundFlowSnapshot`
- `CompanyProfile`
- `CompanyKnowledgeCard`
- `DataCompleteness`
- `StockCandidate`
- `MarketRuleResult`
- `SectorRuleResult`
- `StockRuleResult`
- `RiskConstraints`
- `FactPackage`
- `DeepSeekReport`
- `ValidatedReport`

`FactPackage` 必须包含稳定事实 ID：

```json
{
  "facts": [
    {
      "factId": "stock.sh600584.fund.MainNetFlow",
      "sourceType": "dataSourceFact",
      "text": "长电科技当日主力净流入 ..."
    }
  ]
}
```

DeepSeek 报告中的 `evidenceRefs` 必须引用这些 `factId`。

建议目录：

```text
src/lib/types/
```

契约变更必须同步更新文档、Schema、fixture、前端 mock 和相关测试。

## 3.1 统一状态枚举

```text
dataStatus: success | partial | empty | failed
parseStatus: success | partial | empty | failed
ruleStatus: success | blocked | failed
llmStatus: disabled | success | rejected | failed
reportStatus: ruleOnly | llmEnhanced | blocked | failed
```

规则：

- `empty` 表示命令成功但没有有效数据。
- `blocked` 表示规则引擎或校验器明确阻止输出买入建议。
- `rejected` 表示 DeepSeek 输出被后端校验器拒绝。
- DeepSeek 失败或关闭时，系统必须保留规则引擎报告。

## 4. 明确买入建议的硬门槛

个股只有在同时满足以下条件时，才能进入“小仓试错”或其他明确买入类动作：

- 有当前热度或盘口线索。
- 有历史 K 线。
- 有技术指标。
- 有资金流数据。
- 有板块或主线证据。
- 有公司基础信息。
- 不处于明显下降趋势。
- 未触发 ST、风险警示、高位严重远离均线、资金连续流出等剔除条件。
- 仓位建议不超过规则引擎约束。

否则只能输出：

- `观察`
- `等待回踩`
- `不追`
- `回避`
- `数据不足`

## 5. 公司认知卡片边界

公司认知卡片必须区分来源：

- `dataSourceFact`：来自 `profile`、`finance`、`shareholder`、`reserve` 等命令。
- `ruleComputed`：来自规则引擎的主题匹配、数据完整性和风险判断。
- `inferredByModel`：DeepSeek 基于主营业务进行的产业链位置、长期关注点等归纳。
- `mixed`：混合来源。

模型归纳不得伪装成公告事实。不得编造客户、订单、市占率、营收占比、利润增速或新闻。

## 6. 推荐开发顺序

1. 初始化项目、数据库和共享类型。
2. 实现 westock-data Adapter 白名单。
3. 实现 Markdown 多表解析器和实测 fixture。
4. 实现数据完整性检查。
5. 实现公司认知卡片基础版。
6. 实现规则引擎基础判断。
7. 生成 FactPackage。
8. 实现 FactPackage `factId` 生成和证据引用索引。
9. 实现 DeepSeek Client、Prompt 模板和输出校验。
10. 实现 Repair Prompt 和规则报告回退。
11. 保存报告和运行日志。
12. 实现仪表盘、候选股信号表和公司详情侧边栏。
13. 实现配置页、通知服务和定时任务。
14. 补齐验收测试。

## 6.1 多 Agent 对接约束

默认目录边界：

```text
Data Agent:      src/lib/westock/**
Strategy Agent:  src/lib/strategy/**
LLM Agent:       src/lib/llm/**
Frontend Agent:  src/app/**, src/components/**
QA Agent:        tests/**, fixtures/**
DevOps Agent:    scripts/**, config/**, deployment docs
Lead Agent:      src/lib/types/**, docs/**, integration glue
```

公共类型、API 契约、数据库 Schema、事实包结构和 DeepSeek Schema 的变更必须由 Lead Agent 统一协调。

每个 Agent 交付时必须说明：

- 输入契约。
- 输出契约。
- 失败状态。
- 使用的 fixture。
- 是否修改公共契约。
- 已运行验证。

## 6.2 端到端验收链路

MVP 最终验收必须跑通：

```text
westock CLI 或 fixture
  -> Adapter
  -> Parser
  -> DataCompleteness
  -> Rule Engine
  -> CompanyKnowledgeCard
  -> FactPackage
  -> DeepSeek Client 或 Rule-only Report
  -> LLM Output Validator
  -> Report Repository
  -> API Response
  -> UI
```

这条链路中不得人工补字段，不得从模型自然语言中反推事实。

## 7. 开发验收底线

以下任一情况出现，MVP 不得验收：

- 前端或 DeepSeek 能直接调用 westock-data。
- 用户输入能拼接任意 shell 命令。
- 数据缺失时仍给明确买入建议。
- 公司基础信息缺失时仍给长期持有理由。
- DeepSeek 推荐候选池外股票。
- DeepSeek 输出仓位超过规则上限。
- 报告中出现事实包不存在的价格、涨跌幅、资金、新闻或财务数据。
- 报告缺少风险提示、失效条件或免责声明。
- 各模块使用不同字段名或枚举值，导致接口靠临时转换拼接。
- 前端使用与共享 fixture 不一致的自造 mock 数据。
- DeepSeek 报告没有 `evidenceRefs`，或 `evidenceRefs` 无法回溯到事实包。
- 模型把事实包中的外部文本当作指令执行。

## 8. MVP 后第一增强：模拟持仓追踪

该增强用于买后计划监督，不属于第一版 MVP 必做范围，但应作为 MVP 后优先开发方向。

核心思路：

- 用户从候选股或手动录入创建模拟买入。
- 系统保存模拟买入价格、仓位、买入逻辑、失效条件、减仓条件和计划周期。
- 系统定时获取后续数据，判断原买入逻辑是否仍成立。
- 系统输出继续持有、减仓、退出、等待加仓条件、数据不足等条件化动作。
- 用户自行决定真实账户是否交易。

边界：

- 不接券商账户。
- 不读取真实持仓。
- 不自动交易。
- 模拟价格只做计划跟踪和盈亏估算。
- 所有动作都是交易计划辅助，不构成收益承诺。

新增模块：

- `Simulated Position Service`
- `Position Tracking Service`
- `Position Tracking Rule Engine`
- `Position Tracking Report Prompt`
- `Position Alert`
- 模拟持仓页面和持仓详情页

追踪动作白名单：

- 继续观察。
- 继续持有。
- 风险升高，考虑减仓。
- 跌破失效条件，计划退出。
- 主线退潮，降低主题仓位。
- 等待加仓条件。
- 不追高加仓。
- 数据不足。

第一版加仓约束：

- 不输出激进加仓结论。
- 只能输出“等待加仓条件”或“满足加仓观察条件”。
- 必须同时满足大盘非防守、主线未退潮、原逻辑仍成立、未高位过热、资金未连续流出、未超过仓位上限和出现新买点。
