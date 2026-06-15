# 数据源与 westock-data 命令规范

## 1. 数据源

系统第一版使用已安装的 `westock-data` skill。该技能说明中声明：

- 数据源：腾讯自选股行情数据接口。
- 支持市场：A 股、港股、美股。

本系统第一版只使用 A 股相关能力。

## 2. 调用方式

命令格式：

```bash
npx -y westock-data-skillhub@1.0.3 <command> [args]
```

说明：

- 版本号可配置，默认使用 `1.0.3`。
- 生产环境需要 Node.js 和网络访问能力。
- 命令输出通常为 Markdown 表格或结构化文本，解析器必须容错。
- 命令调用由后端 Adapter 固化实现，DeepSeek 不直接调用命令。
- 用户输入不得直接拼接 shell 命令。
- Adapter 需要在应用启动或开发调试时支持冒烟测试，用于确认当前 westock-data 版本的真实可用命令和输出格式。

## 2.1 Adapter 责任

`westock-data Adapter` 必须提供固定方法：

```text
getMarketMinutes()
getIndexKlines()
getBoardOverview()
getHotBoards()
getHotStocks()
getStockTechnicals(codes)
getStockFundFlows(codes)
getStockProfiles(codes)
getStockKlines(codes)
getStockCompanyKnowledge(codes)
```

每个方法内部映射到白名单命令。前端和 DeepSeek 都不能直接执行 CLI。

建议第一版白名单仅包含：

```text
board
hot board
hot stock
minute
kline
technical
asfund
profile
finance
shareholder
reserve
```

`quote` 在当前实测版本 `westock-data-skillhub@1.0.3` 中不可用，不进入 MVP 白名单。

## 2.2 调用链

```text
API 请求
  -> Analysis Service
    -> westock-data Adapter
      -> CLI 命令
    -> Parser
    -> Rule Engine
    -> Fact Package
    -> DeepSeek
```

## 3. 重要命令

### 3.1 板块首页

```bash
npx -y westock-data-skillhub@1.0.3 board
```

用途：

- 获取行业板块涨幅排名。
- 获取概念板块涨幅排名。
- 获取行业资金流入 Top。

关键字段：

- name
- changePct
- turnoverRate
- changePct5d
- changePct20d
- leadStock
- mainNetInflow
- mainNetInflow5d
- upDownRatio

### 3.2 热门板块

```bash
npx -y westock-data-skillhub@1.0.3 hot board --limit 20
```

用途：

- 获取热门板块排行。
- 辅助判断市场关注度。

### 3.3 热门股票

```bash
npx -y westock-data-skillhub@1.0.3 hot stock --limit 50
```

用途：

- 获取市场热搜和热门股票。
- 作为候选池来源之一。

注意：

- 热门不等于可买。
- 必须结合趋势、资金和位置二次过滤。

### 3.4 分时

```bash
npx -y westock-data-skillhub@1.0.3 minute sh000001
```

用途：

- 获取指数或个股盘中分时。
- 判断是否冲高回落、承接走强、单边走弱。

常用指数：

- `sh000001` 上证指数
- `sz399001` 深成指
- `sz399006` 创业板指
- `sh000688` 科创 50

### 3.5 K 线

```bash
npx -y westock-data-skillhub@1.0.3 kline sh000001 --period day --limit 30
npx -y westock-data-skillhub@1.0.3 kline sz000063 --period day --limit 30
```

用途：

- 计算趋势。
- 观察历史涨跌和成交金额。

### 3.6 技术指标

```bash
npx -y westock-data-skillhub@1.0.3 technical sz000063 --group ma,macd,rsi
```

用途：

- 获取均线、MACD、RSI。
- 判断趋势强弱和短线过热。

关键字段：

- closePrice
- ma.MA_5
- ma.MA_10
- ma.MA_20
- ma.MA_60
- macd.DIF
- macd.DEA
- macd.MACD
- rsi.RSI_6
- rsi.RSI_12
- rsi.RSI_24

### 3.7 A 股资金流

```bash
npx -y westock-data-skillhub@1.0.3 asfund sz000063
```

用途：

- 获取当日、5 日、10 日、20 日主力资金。
- 辅助判断资金是否持续。

关键字段：

- MainNetFlow
- MainNetFlow5D
- MainNetFlow10D
- MainNetFlow20D
- JumboNetFlow
- BlockNetFlow
- RetailInFlow
- RetailOutFlow
- LhbInfos

### 3.8 公司概况

```bash
npx -y westock-data-skillhub@1.0.3 profile sz000063
```

用途：

- 获取公司行业、主营业务、上市日期等基础信息。
- 判断公司是否真正匹配主题。

### 3.9 公司认知增强数据

```bash
npx -y westock-data-skillhub@1.0.3 finance sz000063 --num 4
npx -y westock-data-skillhub@1.0.3 shareholder sz000063
npx -y westock-data-skillhub@1.0.3 reserve sz000063
```

用途：

- 获取最近多期财务摘要。
- 获取股东结构。
- 获取业绩预告。
- 辅助生成公司认知卡片。

注意：

- 第一版必须至少使用 `profile` 生成基础公司信息。
- 财务、股东和业绩预告可作为增强项逐步接入。
- 若数据源未返回某项内容，报告必须标记缺失，不能补猜。

## 4. 数据解析要求

解析器必须：

- 支持 Markdown 表格解析。
- 支持批量输出。
- 支持字段缺失。
- 支持命令失败重试。
- 记录原始输出，便于审计。

## 4.1 实测输出校准

2026-06-03 对 `westock-data-skillhub@1.0.3` 做过编程化命令验证，得到以下实现注意事项：

- `board` 输出多个 Markdown 表格区块，包含“行业板块涨幅排名”“概念板块涨幅排名”“行业资金流入 Top5”等标题。Parser 不能假设一个命令只返回一个表。
- `hot board --limit 5` 返回字段包括 `index`、`level`、`symbol`、`rank`、`rankdelta`、`date`、`stock_type`、`name`、`zdf`、`zxj`。
- `hot stock --limit 5` 实测仍返回 50 行左右，`--limit` 不能作为强约束。Adapter 必须在解析后自行截断。
- `kline` 单代码输出字段为 `date`、`open`、`last`、`high`、`low`、`volume`、`amount`、`exchange`。
- `kline` 批量代码输出前会出现 `[Batch] 状态: success | 总数: ...` 元信息行，表格字段会增加 `symbol`。Parser 需要跳过或结构化保存批量元信息。
- `technical <code> --group ma,macd,rsi` 实测仍返回大量技术指标列，未请求或无数据字段常以 `-` 表示。Parser 必须区分“字段存在但值无效”和“字段缺失”。
- `asfund` 输出字段包含 `MainNetFlow`、`MainNetFlow5D`、`MainNetFlow10D`、`MainNetFlow20D`、`JumboNetFlow`、`BlockNetFlow`、`RetailInFlow`、`RetailOutFlow` 等，`LhbInfos` 可能是 JSON 字符串。
- `profile` 支持批量，输出字段包括 `code`、`name`、`listedDate`、`business`、`website`、`industry`、`sector`、`issuePrice`、`regCapital`、`establishDate`、`chairman`、`regAddress`、`officeAddress`、`tel`、`email`。
- `finance` 会返回多个分节表，例如 `lrb`、`zcfz`、`xjll`，每个分节字段很多，第一版建议只抽取少量摘要字段或先作为原始增强数据保存。
- `shareholder` 会返回“十大股东”“十大流通股东”“股东户数统计”等分节表，Parser 需要支持标题层级。
- `reserve` 输出相对简单，字段包括 `code`、`name`、`reportEndDate`、`disclosureEndDate`、`disclosureDate`、`disclosureDesc`。
- `search 半导体 --sector` 实测可能空输出且退出码为 0。空输出必须作为 `empty` 状态处理，而不是解析失败。
- `quote sh600584` 实测失败，提示“未知命令: quote”。项目不得依赖 `quote`。

Parser 输出建议统一携带：

```json
{
  "command": "string",
  "args": ["string"],
  "status": "success|empty|failed|partial",
  "rawText": "string",
  "sections": [
    {
      "title": "string",
      "type": "markdownTable|text|batchMeta",
      "columns": [],
      "rows": []
    }
  ],
  "warnings": []
}
```

## 5. 数据真实性要求

- 页面展示的数据必须来自命令输出或规则计算结果。
- 大模型不得生成不存在的数据。
- 若数据缺失，报告必须明确写“数据缺失”，不能补猜。
- DeepSeek 接收到的是后端生成的事实包，不接触原始 CLI 调用能力。
- DeepSeek 输出中引用的数据必须能在事实包中找到。

## 5.1 个股判断必需数据

系统判断一只 A 股是否适合买入时，不能只依赖当前盘口或热门排行。个股级别结论必须同时采集并进入事实包：

- 当前热度或盘口线索：来自 `hot stock`、`minute` 或候选池来源，用于确认市场关注度和盘中承接。
- 历史走势：来自 `kline <code> --period day --limit 30`，必要时扩展到 60 或 120 日，用于判断趋势、平台、回踩、破位和量价关系。
- 技术指标：来自 `technical <code> --group ma,macd,rsi`，至少包含 5/10/20/60 日均线、MACD、RSI。
- 资金流向：来自 `asfund <code>`，至少包含当日、5 日、10 日、20 日主力资金字段。
- 板块证据：来自 `board`、`hot board` 或板块成份数据，用于判断该股是否处于当前主线或主线分支。
- 公司基础信息：来自 `profile <code>`，用于确认行业、主营业务和主题匹配度。
- 公司认知信息：至少来自 `profile <code>`，增强项来自 `finance`、`shareholder`、`reserve`，用于说明公司核心业务、产业链位置和长期逻辑风险。

如果以上关键数据缺失，规则引擎只能输出“观察”或“数据不足”，不得输出明确买入建议。

## 5.2 数据权威性说明

`westock-data` 技能声明的数据源为腾讯自选股行情数据接口。该数据适合做行情、盘口、趋势、资金和候选池分析，但它不等同于交易所公告、上市公司法定披露或监管文件原文。

报告中必须区分四类内容：

- 数据源事实：来自 westock-data 命令输出。
- 规则判断：来自系统规则引擎计算。
- 模型分析：DeepSeek 基于事实包生成的解释性文本。
- 新闻或事件：只有接入权威资讯源后才能作为外部证据展示。

后续如需要更高权威性，应扩展接入上交所、深交所、巨潮资讯、上市公司公告、证监会和交易所政策文件等原始披露来源。

## 5.3 数据完整性校验

事实包中每只候选股必须携带数据完整性字段：

```json
{
  "dataCompleteness": {
    "level": "complete|partial|insufficient",
    "hasHotData": true,
    "hasKlineData": true,
    "hasTechnicalData": true,
    "hasFundFlowData": true,
    "hasSectorData": true,
    "hasProfileData": true,
    "hasCompanyKnowledge": true,
    "missingFields": []
  }
}
```

判定规则：

- `complete`：关键数据齐全，可以进入买点和仓位判断。
- `partial`：部分非关键字段缺失，可以给观察结论，但买入建议必须更保守。
- `insufficient`：缺少 K 线、技术指标、资金流、板块证据中的任意核心项，不得给出买入建议。

公司认知规则：

- 缺少公司基础信息时，不得给出长期持有或长期加仓理由。
- 产业链位置、长期逻辑和主线匹配关系如果由模型归纳生成，必须在事实包中标记为 `inferredByModel`。

## 6. 已知限制

- `quote` 命令在当前安装版本中不可用。
- `search` 和 `minute` 不支持批量查询。
- ETF 简称可能不唯一，需要通过搜索结果确认代码。
- 命令输出字段可能随版本变化，解析器需容错。

## 7. 东方财富补充数据配置

东方财富公开接口只作为 westock-data 的补充证据，用于全 A 宽度、涨跌停池、炸板池和板块成分股。它不能替代 westock-data，也不能由 DeepSeek 直接调用。

可配置项：

- `EASTMONEY_UT`：全 A 宽度和板块接口 `ut` 参数，默认使用当前实测可用值。
- `EASTMONEY_LIMIT_POOL_UT`：涨跌停池接口 `ut` 参数，默认使用当前实测可用值。
- `EASTMONEY_TIMEOUT_MS`：请求超时，默认 15000。
- `EASTMONEY_RETRIES`：失败重试次数，默认 2。

失败分类必须写入数据源警告：

- 请求超时。
- HTTP 错误。
- 网络或 JSON 解析错误。
- 空数据，需结合交易日历和当前时段判断是否为休市、盘前或接口延迟。

时段约束：

- 非交易日应跳过东方财富实时请求，避免使用休市缓存数据。
- 盘前和集合竞价不得把全 A 宽度作为实时确认。
- 集合竞价涨跌停池优先使用上一交易日日期。

## 8. 多数据源融合与来源留痕补充

`westock-data` 是访问方式，不是页面最终展示的真实来源名。当前系统必须把它标记为：

- 真实来源：腾讯自选股行情数据
- 访问路径：`westock-data CLI`
- 页面展示：腾讯自选股行情接口（通过 westock-data-skillhub 访问）

东方财富补源必须标记为：

- 真实来源：东方财富公开数据
- 访问路径：`Eastmoney public HTTP API`
- 页面展示：东方财富公开行情/F10接口

后续接入 Tushare 时，Tushare 作为第三个 Provider 加入字段级融合，不替代现有腾讯和东方财富来源。推荐职责：

- 交易日历：Tushare 或本地交易日历为主，腾讯/东方财富不作为唯一依据。
- 日线和长期历史：Tushare 可用于复权日线和历史校验。
- 财务和公司基础资料：Tushare 可补充财务摘要，东方财富 F10 和腾讯 profile 继续保留来源留痕。
- 指数/板块成分：Tushare 可作为中长期成分校验，东方财富继续承担实时或延迟板块成分补源。

每条进入 FactPackage 的关键数据都应生成 `DataSourceTrace`。质量标记规则：

- `primary`：该字段当前优先来源直接返回。
- `fallback`：主来源缺失后由备用来源补充。
- `approximate`：通过同义板块、近似映射或替代成分取得，只能降级参考。
- `derived`：由规则引擎从事实数据计算，不是外部原始数据。
- `missing`：字段缺失，不能让模型补猜。

DeepSeek 输入只保留压缩后的来源摘要。完整原始响应、API Key、工具权限和过长来源列表不得进入提示词，避免 token 浪费和越权风险。
## 9. Tushare 补充源

Tushare Pro 已作为补充数据源接入。它不替代 westock-data 和东方财富的盘中行情链路，第一阶段只用于补强候选股快照和后续公司认知。

当前已接入：

- `daily`：补候选股收盘价、涨跌幅、成交额。Tushare `amount` 按千元口径转换为元。
- `daily_basic`：补候选股换手率、量比、总市值、流通市值。
- `trade_cal`：校验本地交易日判断，发现冲突时写入数据源 warning。
- `moneyflow`：当原资金流缺失时，补 `MainNetFlow`、`MainNetFlow5D`、`MainNetFlow10D`、`MainNetFlow20D`。
- `fina_indicator`：当原财务数据缺失时，补 ROE、营收同比、净利同比、毛利率、资产负债率，用于公司认知卡片。
- `stk_holdernumber`：当原股东数据缺失时，补股东户数和户数变化。

接入原则：

- 仅当 Tushare 数据源开关启用、token 已配置且状态不是 `disabled` 时调用。
- Tushare 作为 `fallback` 或补充源使用，不抢占盘中最新行情主路径。
- 如果候选股来自热门股榜，补充字段写入 hot stock 行。
- 如果候选股来自板块成分股前排，补充字段写入 `sectorConstituents.stocks`。
- 前端和事实包必须保留 `provider=tushare` 的来源留痕。
- 量比可展示，但规则不得强依赖量比；活跃度仍优先综合成交额、换手率、资金质量、板块排名和买入可达性。

下一阶段计划：

- `trade_cal`：从“校验源”升级为本地交易日历更新源。
- `income`、`balancesheet`、`cashflow`、`fina_mainbz`：补完整财报三表和主营构成。
- `index_classify`、`index_member_all`：补申万行业成分结构。
