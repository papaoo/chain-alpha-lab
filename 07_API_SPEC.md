# API 接口规范

## 1. 通用约定

响应格式：

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

## 1.1 核心数据契约

MVP 开发前必须先冻结以下 TypeScript 类型，并让后端、前端、规则引擎、DeepSeek Client 和测试共用同一份定义。

所有跨模块返回结构必须包含 `schemaVersion`。MVP 默认：

```json
{
  "schemaVersion": "mvp-1"
}
```

禁止各模块私自复制或重新定义核心类型。共享类型建议放在：

```text
src/lib/types/
```

契约变更必须同步更新：

- `src/lib/types/`
- 本 API 文档
- DeepSeek 输入/输出 Schema
- 测试 fixture
- 前端 mock 数据

### DataCompleteness

```json
{
  "level": "complete|partial|insufficient",
  "hasHotData": true,
  "hasKlineData": true,
  "hasTechnicalData": true,
  "hasFundFlowData": true,
  "hasSectorData": true,
  "hasProfileData": true,
  "hasCompanyKnowledge": true,
  "missingFields": [],
  "blockingReasons": []
}
```

规则：

- 缺少 K 线、技术指标、资金流或板块证据任意核心项时，`level` 必须为 `insufficient`。
- `insufficient` 个股不得出现明确买入建议。
- 缺少公司基础信息时，不得生成中线、长线持有理由。

### CompanyKnowledgeCard

```json
{
  "code": "string",
  "name": "string",
  "industry": "string",
  "mainBusiness": "string",
  "coreBusiness": "string",
  "productsOrServices": ["string"],
  "industryChainPosition": "上游|中游|下游|终端应用|unknown",
  "themeMatch": "strong|medium|weak|unknown",
  "themeMatchLogic": "string",
  "fundamentalHighlights": ["string"],
  "fundamentalRisks": ["string"],
  "longTermWatchItems": ["string"],
  "companyKnowledgeState": "sufficient|partial|missing",
  "longTermLogicAllowed": false,
  "sourceType": "dataSourceFact|ruleComputed|inferredByModel|mixed",
  "missingFields": []
}
```

### StockCandidate

```json
{
  "code": "string",
  "name": "string",
  "sectorName": "string",
  "role": "龙头|中军|补涨|低吸观察|unknown",
  "trendState": "above_ma20|below_ma20|reclaim_ma20|downtrend|unknown",
  "fundFlowState": "inflow|outflow|mixed|unknown",
  "buyPointType": "回踩均线|突破回踩|分歧修复|无买点|unknown",
  "action": "观察|小仓试错|等待回踩|不追|回避|数据不足",
  "positionLimitPct": 0,
  "invalidCondition": "string",
  "riskFlags": [],
  "dataCompleteness": {},
  "companyKnowledge": {}
}
```

### FactPackage

`FactPackage` 是 DeepSeek 唯一输入，不得包含工具调用权限。

```json
{
  "schemaVersion": "mvp-1",
  "timestamp": "string",
  "session": {
    "phase": "premarket|call_auction|morning|midday_break|afternoon|closing_auction|postmarket|night_research|non_trading_day",
    "phaseLabel": "盘前计划|集合竞价|早盘盯盘|午间复盘|午后确认|尾盘确认|收盘复盘|夜间研究|非交易日研究",
    "analysisMode": "计划|竞价观察|盘中盯盘|半日复盘|尾盘决策|收盘复盘|深度研究",
    "isTradingDay": true,
    "isTradingSession": true,
    "isIntraday": true,
    "canUseRealtimeQuotes": true,
    "expectedDataBasis": "上一交易日收盘|竞价数据|盘中实时/延迟行情|上午收盘快照|尾盘实时/延迟行情|当日收盘数据|历史数据",
    "dataFreshnessHint": "string",
    "ruleFocus": ["string"],
    "llmFocus": ["string"],
    "outputRestrictions": ["string"]
  },
  "facts": [
    {
      "factId": "string",
      "sourceType": "dataSourceFact|ruleComputed|inferredByModel|mixed",
      "text": "string"
    }
  ],
  "dataSource": {
    "provider": "腾讯自选股行情数据接口",
    "via": "westock-data-skillhub",
    "packageVersion": "1.0.3",
    "status": "success|partial|failed",
    "warnings": []
  },
  "market": {},
  "sectors": [],
  "candidates": [],
  "constraints": {
    "allowedCodes": [],
    "maxSingleStockPositionPct": 0,
    "maxThemePositionPct": 0,
    "minCashPct": 0
  },
  "ruleResult": {},
  "disclaimer": "string"
}
```

`session.market.phase` 必须作为事实写入 `facts`，供 DeepSeek 和前端引用。盘前、夜间、非交易日不得因缺少今日盘中数据直接判定为数据源异常；报告应说明当前为计划/研究模式。

### DeepSeekReport

DeepSeek 输出必须是 JSON，不得输出 Markdown。所有结论必须通过 `evidenceRefs` 引用事实包中的 `factId`。

```json
{
  "schemaVersion": "mvp-1",
  "summary": "string",
  "marketJudgement": {
    "level": "可交易|谨慎交易|防守观望",
    "evidenceRefs": ["string"],
    "logic": "string",
    "risk": "string"
  },
  "mainLines": [
    {
      "name": "string",
      "stage": "启动|确认|加速|分歧|退潮|unknown",
      "evidenceRefs": ["string"],
      "logic": "string"
    }
  ],
  "stockPlans": [
    {
      "code": "string",
      "name": "string",
      "action": "观察|小仓试错|等待回踩|不追|回避|数据不足|减仓",
      "companySummary": "string",
      "companySourceNote": "数据源事实|规则计算|基于主营业务的模型归纳|mixed",
      "evidenceRefs": ["string"],
      "buyCondition": "string",
      "sellCondition": "string",
      "positionSuggestion": "string",
      "invalidCondition": "string",
      "doNotBuyCondition": "string",
      "risk": "string"
    }
  ],
  "notifications": [
    {
      "level": "info|warning|risk",
      "message": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "disclaimer": "string"
}
```

### 统一状态枚举

跨模块状态必须使用统一枚举，避免前后端和规则引擎各自命名。

```json
{
  "dataStatus": "success|partial|empty|failed",
  "parseStatus": "success|partial|empty|failed",
  "ruleStatus": "success|blocked|failed",
  "llmStatus": "disabled|success|rejected|failed",
  "reportStatus": "ruleOnly|llmEnhanced|blocked|failed"
}
```

含义：

- `empty`：命令成功但无有效数据。
- `partial`：部分数据可用，但存在缺失字段或失败命令。
- `blocked`：规则或校验明确阻止生成买入建议。
- `rejected`：LLM 输出被校验器拒绝。

错误格式：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

## 2. 配置接口

### GET /api/settings

获取系统配置。敏感字段返回脱敏值。

### POST /api/settings

保存配置。

请求：

```json
{
  "deepseekBaseUrl": "string",
  "deepseekApiKey": "string",
  "deepseekModel": "string",
  "temperature": 0.2,
  "maxTokens": 4000
}
```

## 3. 通知接口

### GET /api/notifications/channels

获取通知渠道。

### POST /api/notifications/channels

新增或修改通知渠道。

### POST /api/notifications/test

测试发送通知。

请求：

```json
{
  "channelId": "string",
  "message": "测试消息"
}
```

## 4. 分析接口

### POST /api/analyze/full

运行完整分析。

请求：

```json
{
  "useLLM": true,
  "pushNotification": false
}
```

响应中的 `factPackage`、`ruleResult`、`stockPlans` 和 `companyCards` 必须满足本节核心数据契约。前端不得从 `llmResult` 中反推事实字段。

### 4.1.1 完整分析端到端验收链路

`POST /api/analyze/full` 必须覆盖以下链路：

```text
westock CLI
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
```

如果 DeepSeek 关闭或失败，接口仍应返回规则引擎基础报告，并将 `reportStatus` 标记为 `ruleOnly`。

响应：

```json
{
  "reportId": "string",
  "summary": "string",
  "dataSourceStatus": {},
  "ruleResult": {},
  "factPackage": {},
  "marketJudgement": {},
  "mainLines": [],
  "stockPlans": [],
  "companyCards": []
}
```

### POST /api/analyze/market

只分析大盘环境。

### POST /api/analyze/sectors

只分析市场主线。

### POST /api/analyze/stocks

筛选强股。

请求：

```json
{
  "sectorNames": ["通信设备", "半导体"],
  "limit": 20
}
```

## 5. 报告接口

### GET /api/reports

查询历史报告。

参数：

- page
- pageSize
- reportType

### GET /api/reports/:id

获取报告详情。

### GET /api/stocks/:code/company-card

获取股票公司认知卡片。

响应：

```json
{
  "code": "sz000063",
  "name": "中兴通讯",
  "industry": "string",
  "coreBusiness": "string",
  "productsOrServices": ["string"],
  "industryChainPosition": "上游|中游|下游|终端应用|unknown",
  "themeMatch": "strong|medium|weak|unknown",
  "themeMatchLogic": "string",
  "fundamentalHighlights": ["string"],
  "fundamentalRisks": ["string"],
  "longTermWatchItems": ["string"],
  "sourceType": "dataSourceFact|ruleComputed|inferredByModel|mixed",
  "missingFields": []
}
```

## 6. 定时任务接口

### GET /api/jobs

获取定时任务。

### POST /api/jobs

新增或修改任务。

### POST /api/jobs/:id/run

立即运行任务。

### PATCH /api/jobs/:id/enabled

启用或停用任务。

## 7. 数据接口

### POST /api/data/westock/run

开发调试接口，仅允许白名单命令。

请求：

```json
{
  "command": "board",
  "args": []
}
```

禁止：

- 任意 shell 命令。
- 用户自定义拼接 shell 字符串。

说明：

- 该接口仅供开发调试，生产环境默认关闭或需要管理员权限。
- DeepSeek 不允许访问该接口。

## 8. 规则引擎接口

### POST /api/rules/evaluate

基于已解析数据运行规则引擎，不调用 DeepSeek。

请求：

```json
{
  "includeMarket": true,
  "includeSectors": true,
  "includeStocks": true
}
```

## 9. 模拟持仓追踪接口（MVP 后第一增强）

### GET /api/positions

获取模拟持仓列表。

参数：

- status
- enabled

### POST /api/positions

创建模拟持仓。

请求：

```json
{
  "code": "sh600584",
  "name": "长电科技",
  "buyPrice": 81.69,
  "quantity": 100,
  "positionPct": 8,
  "buyTime": "2026-06-03T14:30:00+08:00",
  "planType": "短线|波段|中线",
  "sectorName": "半导体",
  "buyPointType": "回踩均线|突破回踩|分歧修复|手动录入|unknown",
  "buyReason": "string",
  "invalidCondition": "string",
  "reduceCondition": "string",
  "holdCondition": "string",
  "sourceReportId": "string|null",
  "enabled": true
}
```

说明：

- 如果来自候选股，后端应绑定当时的规则结论、事实包、公司认知卡片和失效条件。
- 如果手动录入且数据不完整，后端必须标记为“数据待补充”。

### GET /api/positions/:id

获取模拟持仓详情、初始计划、最新追踪结论和历史追踪记录。

### PATCH /api/positions/:id

编辑模拟持仓。

### PATCH /api/positions/:id/enabled

启用或暂停追踪。

### POST /api/positions/:id/close

关闭模拟持仓追踪。

### POST /api/positions/:id/track

立即追踪单个模拟持仓。

响应：

```json
{
  "schemaVersion": "mvp-1",
  "positionId": "string",
  "timestamp": "string",
  "latestPrice": 0,
  "estimatedPnlPct": 0,
  "logicStillValid": true,
  "action": "继续观察|继续持有|风险升高，考虑减仓|跌破失效条件，计划退出|主线退潮，降低主题仓位|等待加仓条件|不追高加仓|数据不足",
  "evidenceRefs": ["string"],
  "riskFlags": [],
  "dataCompleteness": {},
  "summary": "string"
}
```

### POST /api/positions/track-all

立即追踪所有启用中的模拟持仓。由于 `minute` 不支持批量，后端必须限制并发和超时。

响应：

```json
{
  "marketState": "tradable|cautious|defensive",
  "mainLines": [],
  "candidates": [],
  "constraints": {}
}
```
