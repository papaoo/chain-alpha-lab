# 多策略选股模块设计与开发规划

本文档用于指导主 Agent 在现有“A股主线趋势助手”中新增独立的“多策略选股”模块。该模块保留现有主线驾驶舱，不替代主线判断，而是新增一条不同思路的策略型选股链路，用于后续个股追踪、模拟持仓、AI 盯盘和复盘。

系统定位仍然是投资研究辅助工具，不自动交易，不承诺收益，不替代持牌投资顾问服务。

## 1. 模块目标

### 1.1 要解决的问题

现有主线驾驶舱的主问题是：

```text
今天市场主线是什么，主线处于什么阶段，主线上哪些股可以观察？
```

新增多策略选股模块的主问题是：

```text
按某一种交易风格和风险偏好，今天有哪些股票满足策略条件，后续如何追踪？
```

### 1.2 模块边界

多策略选股模块只负责：

- 策略选择与参数配置。
- 基于真实数据生成候选池。
- 执行硬过滤、规则评分和风险否决。
- 调用五位 Agent 生成结构化分析意见。
- 调用总评审 Agent 生成最终精选列表。
- 保存选股历史、候选快照、Agent 输出和上下文摘要。
- 将推荐股票一键加入个股追踪、模拟持仓或 AI 盯盘。

多策略选股模块不负责：

- 直接下单。
- 连接券商账户。
- 承诺收益。
- 让模型自行抓取行情、财务、新闻或执行外部工具。
- 替代主线驾驶舱的大盘和主线判断。

## 2. 与现有系统的关系

### 2.1 导航结构

现有左侧导航建议调整为：

```text
市场研究
  - 主线驾驶舱
  - 历史研报

策略工具
  - 策略选股
  - 个股追踪
  - 风险预警

系统
  - 模型审查
  - 配置中心
```

### 2.2 数据复用关系

多策略选股模块复用现有能力：

- `westock-data Adapter`：行情、K 线、技术指标、资金流、公司 profile。
- `eastmoneyAdapter`：全 A 宽度、涨跌停池、板块成分、盘口补源。
- `tushareAdapter`：交易日历、日线、daily_basic、moneyflow、财务指标、股东户数。
- `sector/normalization.ts`：板块归一化。
- `market/session.ts`：交易时段识别。
- `data/sourceTrace.ts`：来源留痕。
- `llm/modelProvider.ts`：通用模型调用。
- `LLM Output Validator`：输出校验思想继续复用。

### 2.3 独立新增能力

新增能力放在新的边界内：

```text
src/lib/selection/
  strategies.ts
  types.ts
  candidatePool.ts
  filters.ts
  scoring.ts
  agentPrompts.ts
  workflow.ts
  validator.ts

src/lib/db/selection.ts
src/app/api/selection/*
src/components/selection/*
```

## 3. 页面规划

### 3.1 页面入口

左侧导航点击 `策略选股` 后进入：

```text
/selection
```

页面标题：

```text
策略选股
Multi Strategy Selection
```

副标题：

```text
基于多策略规则、真实数据和五位 Agent 协同分析，精选可追踪股票。
```

顶部状态条展示：

| 字段 | 示例 | 说明 |
|---|---|---|
| 当前时段 | 非交易日研究 | 来自 `market/session.ts` |
| 数据基准 | 上一交易日收盘 | 告诉用户当前数据新鲜度 |
| 模型状态 | 已启用 | 来自 settings |
| 最近选股 | 2026-06-07 09:12 | 最近一次 run |
| 用户风险偏好 | 稳健 | 来自 user profile |

### 3.2 页面一级 Tab

页面顶部 Tab：

```text
选股分析
历史记录
我的预设
策略说明
```

点击行为：

- `选股分析`：展示策略配置和本次运行结果。
- `历史记录`：展示当前用户历史选股任务。
- `我的预设`：展示用户保存的策略参数模板。
- `策略说明`：展示六大策略说明、适用周期、风险等级和核心因子。

### 3.3 选股分析页布局

选股分析页分为左右两列。

左列：参数配置。

右列：智能选股流程、上次结果摘要、运行状态。

移动端改为上下布局。

### 3.4 策略选择弹窗

点击 `选股策略` 下拉框或按钮，打开弹窗。

弹窗标题：

```text
选择选股策略
```

弹窗卡片为 2 行 3 列，移动端单列。

每张卡片包含：

| 元素 | 内容 |
|---|---|
| 编号 | 01 到 06 |
| 策略名 | 主力吸筹、短期突破、价值稳健、成长潜力、板块轮动、低风险收益 |
| 简述 | 80 到 120 字 |
| 状态 | 已选或点击选用 |
| 风险等级 | 低、中、中高 |
| 推荐周期 | 短期、中期、中长期 |

卡片点击行为：

- 点击未选策略：更新当前策略。
- 同步推荐时间窗口。
- 同步推荐默认参数。
- 关闭弹窗。
- 参数区出现 `策略参数已切换，可继续手动调整` 提示，3 秒后淡出。

弹窗按钮：

```text
关闭
```

### 3.5 六大策略卡片文案

#### 01 主力吸筹

```text
侧重主力资金持续净流入、筹码集中、低位换手与建仓迹象。适合关注机构与大户资金动向、博弈中期波段机会的投资者。
```

默认周期：近 3 个月。

风险等级：中。

推荐数量：10。

#### 02 短期突破

```text
侧重短期放量突破、均线多头、动能走强与板块共振。适合节奏较快、关注短线爆发与严格止盈止损的交易风格。
```

默认周期：最近 15 天。

风险等级：中高。

推荐数量：5。

#### 03 价值稳健

```text
侧重估值合理、盈利与现金流稳定、分红或护城河较清晰的标的。适合偏稳健、中长期配置思路。
```

默认周期：近 1 年。

风险等级：低。

推荐数量：10。

#### 04 成长潜力

```text
侧重行业景气度、营收与利润成长性、研发投入与成长赛道匹配度。适合愿意承担一定波动、看好成长赛道的投资者。
```

默认周期：近 6 个月。

风险等级：中高。

推荐数量：10。

#### 05 板块轮动

```text
结合板块强度、资金流入、热点龙头、板块白名单与量价匹配进行选股。适合关注主题轮动、资金切换和板块扩散机会的投资者。
```

默认周期：最近 30 天。

风险等级：中。

推荐数量：10。

#### 06 低风险收益

```text
侧重波动相对较低、下行可控、估值安全边际较高和负面风险较少的标的。适合风险偏好较低、注重回撤控制的投资者。
```

默认周期：近 6 个月。

风险等级：低。

推荐数量：8。

## 4. 参数配置页面

### 4.1 基础参数区

标题：

```text
参数配置
```

字段：

| 控件 | 类型 | 选项或范围 | 默认值 | 说明 |
|---|---|---|---|---|
| 时间区间 | select | 最近15天、最近30天、近3个月、近6个月、近1年、自定义 | 按策略 | 切换策略时自动推荐 |
| 开始日期 | date | 自定义时显示 | 空 | 自定义时间区间必填 |
| 结束日期 | date | 自定义时显示 | 空 | 不得晚于当前有效交易日 |
| 选股策略 | button/select | 六大策略 | 主力吸筹 | 点击打开策略弹窗 |
| 至多精选数量 | number | 3 到 20 | 按策略 | 最终输出数量上限 |
| 候选池上限 | number | 50 到 1000 | 250 | 初筛前最多拉取或保留股票数 |
| 最小涨幅限制 | number | -50 到 200 | 空 | 空表示不限制 |
| 最大涨跌幅 | number | 5 到 200 | 按策略 | 限制周期涨跌幅 |
| 当日最大涨幅 | number | 1 到 20 | 按策略 | 防追高 |
| 最小市值 | number | 0 到 5000 亿元 | 10 | 空表示不限制 |
| 最大市值 | number | 10 到 50000 亿元 | 5000 | 空表示不限制 |

按钮：

```text
高级设置
开始选股
保存为预设
重置参数
```

### 4.2 高级设置区

点击 `高级设置` 展开。再次点击收起。

#### 4.2.1 资金流向与筹码

| 控件 | 类型 | 范围 | 默认 |
|---|---|---|---|
| 最小当日主力净流入 | number | 元 | 空 |
| 最小近5日主力净流入 | number | 元 | 空 |
| 最小近20日主力净流入 | number | 元 | 空 |
| 最小近60日主力净流入 | number | 元 | 空 |
| 60日资金要求 | segmented | 不限、必须为正、允许小幅流出、排除大幅流出 | 按策略 |
| 最小换手率 | number | 0 到 50% | 空 |
| 最大换手率 | number | 0 到 80% | 空 |
| 最小量比 | number | 0 到 20 | 空 |
| 股东户数变化 | number | -100 到 100% | 空 |
| 北向持股比例 | number | 0 到 100% | 空 |
| 龙虎榜信号 | segmented | 不限、上榜加分、必须上榜、排除一日游 | 不限 |

#### 4.2.2 技术指标

| 控件 | 类型 | 选项 |
|---|---|---|
| MACD 信号 | segmented | 不限、金叉、死叉、绿柱缩短、红柱放大 |
| KDJ 信号 | segmented | 不限、金叉、超买、超卖 |
| 均线趋势 | segmented | 不限、多头、空头、站上MA20、回踩MA60 |
| 布林带位置 | segmented | 不限、上轨、中轨、下轨、收窄、突破上轨 |
| RSI 范围 | range number | 最小、最大 |
| 近N日新高 | number | 空或 5 到 120 |
| 近N日新低 | number | 空或 5 到 120 |
| 成交额下限 | number | 元 |

#### 4.2.3 财务指标

| 控件 | 类型 | 范围 |
|---|---|---|
| PE 范围 | range number | 最小、最大 |
| PB 范围 | range number | 最小、最大 |
| 最小 ROE | number | % |
| 最小营收增长率 | number | % |
| 最小净利润增长率 | number | % |
| 最小毛利率 | number | % |
| 最大负债率 | number | % |
| 最小流动比率 | number | 倍 |
| 经营现金流要求 | segmented | 不限、必须为正、连续两期为正 |

#### 4.2.4 板块与新闻

| 控件 | 类型 | 说明 |
|---|---|---|
| 板块白名单 | multi-select | 行业或概念板块 |
| 板块黑名单 | multi-select | 排除行业或概念 |
| 板块阶段要求 | segmented | 不限、启动、确认、加速、分歧修复 |
| 新闻情绪 | segmented | 不限、利好优先、排除利空 |
| 新闻时间范围 | select | 最近6小时、最近24小时、最近3天、最近7天 |

#### 4.2.5 排除选项

复选框：

```text
排除 ST 股票
排除科创板
排除创业板
排除北交所
排除上市未满 120 日
排除停牌
排除数据不足
排除涨停不可买入
排除跌停流动性风险
排除近期重大利空
```

默认：

```text
排除 ST 股票：选中
排除科创板：选中
排除创业板：选中
排除北交所：选中
排除数据不足：选中
```

### 4.3 开始选股按钮行为

点击 `开始选股` 后：

1. 校验参数。
2. 如果自定义日期缺失，显示错误。
3. 如果模型未配置，允许规则模式运行，Agent 输出标记为 `disabled`。
4. 创建 `strategy_run`，状态为 `running`。
5. 按步骤显示进度。
6. 运行结束后自动滚动到结果区。

进度步骤：

```text
1. 获取市场与候选池
2. 执行硬过滤
3. 计算策略评分
4. 运行五位 Agent
5. 总评审精选
6. 保存历史与追踪入口
```

## 5. 运行结果页面

### 5.1 顶部汇总

运行结束后显示：

| 指标 | 示例 |
|---|---|
| 选股 ID | #1871 |
| 获取股票数 | 250 |
| 筛选后数量 | 39 |
| 最终推荐 | 10 |
| 策略 | 主力吸筹 |
| 时间窗口 | 近 3 个月 |
| 运行耗时 | 45 秒 |
| 模型状态 | success |
| Token 消耗 | Prompt、Completion、Total |

### 5.2 Agent 团队报告

标题：

```text
AI 分析师团队报告（5 位）
```

每个 Agent 一行折叠卡：

```text
资金流向分析师
行业板块分析师
财务基本面分析师
技术形态分析师
量化分析师
```

卡片右侧状态：

```text
成功
失败
规则模式
输出被拒绝
```

点击展开显示：

- 核心观点。
- 推荐股票。
- 回避股票。
- 风险提示。
- 引用证据。
- 原始结构化 JSON。

### 5.3 总评审报告

标题：

```text
资深研究员综合评审
```

展示：

- 综合分析。
- 推荐分层说明。
- 当前策略适用性。
- 不适合交易的情况。
- 最终精选逻辑。
- 风险总提示。

### 5.4 精选推荐列表

每只股票一张横向卡片。

卡片左侧：

```text
排名
股票名
股票代码
行业 / 概念
一句话推荐理由
```

卡片右侧标签：

```text
信心：高 / 中高 / 中 / 低
优先推荐 / 观察 / 回避
量化排名 #1
周期：短期 / 中期 / 中长期
建议仓位：10%
```

卡片按钮：

```text
展开详情
加入追踪
加入模拟持仓
创建盯盘
加入自选
```

### 5.5 个股展开详情

点击 `展开详情` 后显示：

```text
核心指标
策略命中
推荐理由
核心亮点
风险提示
交易计划
追踪条件
数据来源
```

核心指标：

| 指标 | 示例 |
|---|---|
| 主力净流入 | +4562.73 万 |
| 区间涨跌幅 | -1.86% |
| 总市值 | 275.75 亿 |
| 市盈率 | 9.83 |
| 市净率 | 0.64 |
| 量化评分 | 65.7 |
| 股东户数变化 | -12.28% |
| 近60日资金 | -0.41 亿 |

交易计划：

| 字段 | 示例 |
|---|---|
| 入场价 | 9.51 |
| 入场信号 | standard_signal |
| 目标价 | 12.36 |
| 止损价 | 9.22 |
| 止盈幅度 | 3.05% |
| 止损幅度 | 23.97% |
| 止盈模式 | 风险评估目标价 |
| 失效规则 | 策略或买点失效 |
| 建议仓位 | 10% |

注意：止盈止损百分比必须由后端统一计算，页面不自行推导。

## 6. 历史记录页

字段：

| 字段 | 说明 |
|---|---|
| 选股 ID | runId |
| 策略 | strategyId |
| 用户 | userId 对应昵称 |
| 运行时间 | createdAt |
| 获取股票数 | rawCandidateCount |
| 筛选后数量 | filteredCandidateCount |
| 推荐数量 | finalCount |
| 模型状态 | llmStatus |
| 策略参数 | 可展开 |
| 操作 | 查看、复跑、保存为预设、删除 |

过滤器：

```text
策略
时间范围
模型状态
是否已加入追踪
股票代码
```

## 7. 我的预设页

用户可保存策略参数为个人预设。

字段：

```text
预设名称
策略类型
风险偏好
参数 JSON
是否默认
创建时间
更新时间
```

操作：

```text
应用
编辑
复制
设为默认
删除
```

## 8. 策略规则设计

### 8.1 通用硬过滤

所有策略先执行通用硬过滤：

```text
排除 ST
排除停牌
排除退市整理
排除上市时间不足
排除核心数据不足
排除极端流动性不足
排除近期重大利空且未消化
排除价格异常或缺少有效 K 线
```

数据完整性要求：

| 数据 | 必需性 |
|---|---|
| 日 K | 必需 |
| 当前或最近收盘行情 | 必需 |
| 技术指标 | 必需 |
| 资金流 | 必需 |
| 市值和换手 | 必需 |
| 公司 profile | 必需 |
| 财务指标 | 策略相关 |
| 股东户数 | 主力吸筹必需，其他策略加分 |
| 新闻 | 风险增强 |

### 8.2 通用评分输出

每只候选股输出：

```json
{
  "code": "600153",
  "name": "建发股份",
  "strategyId": "main_force_accumulation",
  "totalScore": 65.7,
  "rank": 1,
  "confidence": "high",
  "recommendation": "priority",
  "cycle": "mid",
  "suggestedPositionPct": 10,
  "scores": {
    "fund": 25.0,
    "chip": 18.0,
    "technical": 12.0,
    "fundamental": 17.0,
    "valuationSafety": 7.5,
    "sector": 6.0,
    "riskPenalty": -4.8
  },
  "riskFlags": [
    "短期趋势仍弱",
    "需等待量价确认"
  ],
  "evidenceRefs": [
    "stock.600153.moneyflow.5d",
    "stock.600153.shareholder.change",
    "stock.600153.valuation"
  ]
}
```

### 8.3 主力吸筹规则

策略 ID：

```text
main_force_accumulation
```

适用周期：

```text
中期 3-6 个月
```

硬过滤：

```text
近5日主力净流入 > 0
股东户数变化 <= 0 或 近20/60日资金为正
当日涨幅 <= 参数中的当日最大涨幅
KDJ 不得处于严重超买，除非股价刚突破且量价确认
PE/PB 不得明显超过行业合理区间，成长策略豁免不适用
60日资金大幅流出且股价大涨时标记为反弹假信号
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 资金强度 | 25 |
| 筹码集中 | 20 |
| 量价背离 | 15 |
| 估值安全 | 10 |
| 基本面托底 | 10 |
| 技术低位 | 10 |
| 板块匹配 | 5 |
| 外部验证 | 5 |

关键识别：

```text
真吸筹 = 近5日资金为正 + 60日资金为正 + 股东户数下降 + 股价未显著上涨
压价吸筹 = 近5日资金为正 + 股价下跌 + 股东户数明显下降
假反弹 = 近5日资金为正 + 60日资金大幅为负 + 股价上涨 + KDJ或RSI超买
```

### 8.4 短期突破规则

策略 ID：

```text
short_term_breakout
```

适用周期：

```text
短期 3-15 个交易日
```

硬过滤：

```text
成交额达到策略最低流动性
近5日涨幅不得超过追高上限
不能是连续一字板不可买状态
不能跌破关键均线后无修复
不能存在明显利空未消化
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 突破形态 | 25 |
| 量能放大 | 20 |
| 均线多头 | 15 |
| 动能指标 | 15 |
| 板块强度 | 10 |
| 资金确认 | 10 |
| 风险控制 | 5 |

加分条件：

```text
放量突破平台
站上 MA20 且 MA5 上穿 MA20
MACD 金叉或红柱放大
KDJ 金叉但未严重超买
所属板块处于启动或确认
涨停后分歧回封质量高
```

否决条件：

```text
高位放量长上影
连续大涨后 KDJ 严重超买
成交额异常但资金净流出
板块退潮或炸板率过高
```

### 8.5 价值稳健规则

策略 ID：

```text
value_stable
```

适用周期：

```text
中长期 6-18 个月
```

硬过滤：

```text
PE 或 PB 不得明显高于行业分位
ROE 不得低于策略阈值
资产负债率不得超过策略上限
经营现金流不能长期恶化
公司 profile 和财务数据必须完整
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 估值安全 | 25 |
| 盈利能力 | 20 |
| 现金流质量 | 15 |
| 负债风险 | 15 |
| 分红或股东回报 | 10 |
| 趋势稳定 | 10 |
| 资金温和确认 | 5 |

推荐类型：

```text
低估值修复
现金奶牛
高股息防御
周期底部龙头
```

### 8.6 成长潜力规则

策略 ID：

```text
growth_potential
```

适用周期：

```text
中长期 6-24 个月
```

硬过滤：

```text
营收增长或净利增长至少一项为正
毛利率不得持续恶化
资产负债率不得失控
估值高时必须有成长数据支撑
行业不能处于明显景气下行且无反转证据
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 营收增长 | 20 |
| 净利增长 | 20 |
| 毛利率和 ROE | 15 |
| 行业景气 | 15 |
| 研发和产品逻辑 | 10 |
| 资金关注 | 10 |
| 技术位置 | 5 |
| 风险惩罚 | 5 |

风险惩罚：

```text
PE 过高且增速不足
高增长来自一次性收益
现金流不支持利润
题材热度高但基本面弱
```

### 8.7 板块轮动规则

策略 ID：

```text
sector_rotation
```

适用周期：

```text
短中期 10-60 个交易日
```

硬过滤：

```text
必须归属到可识别板块
板块不得处于退潮
个股不得显著弱于板块
板块内同类股票不能全部资金流出
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 板块强度 | 25 |
| 板块资金 | 20 |
| 个股板块地位 | 15 |
| 个股资金 | 15 |
| 量价匹配 | 10 |
| 新闻或政策催化 | 10 |
| 风险惩罚 | 5 |

板块状态：

```text
启动
确认
加速
分歧
修复
退潮
```

### 8.8 低风险收益规则

策略 ID：

```text
low_risk_return
```

适用周期：

```text
中期 3-12 个月
```

硬过滤：

```text
历史波动不得超过策略上限
最大回撤不得超过策略上限
估值安全分不得过低
负面新闻和财务风险不得明显
不得处于连续下跌无支撑状态
```

评分权重：

| 因子 | 权重 |
|---|---:|
| 波动控制 | 20 |
| 回撤控制 | 20 |
| 估值安全 | 20 |
| 盈利稳定 | 15 |
| 趋势平稳 | 10 |
| 资金稳定 | 10 |
| 事件风险 | 5 |

推荐类型：

```text
稳健低吸
防守配置
低波动修复
高股息观察
```

## 9. 五位 Agent 提示词设计

### 9.1 通用系统提示词

```text
你是 A 股策略选股系统中的专业分析 Agent。你只能基于输入事实包、候选股、策略参数、规则评分和来源留痕进行分析。你不得编造行情、财务、新闻、资金、股东、估值或技术数据。你不得新增候选池之外的股票。你必须输出 JSON，不得输出 Markdown。

你需要做到：
1. 明确区分数据源事实、规则计算、模型归纳。
2. 每条重要结论必须引用 evidenceRefs。
3. 如果数据缺失，必须写入 missingData 和 riskFlags。
4. 如果某股票不适合推荐，必须明确给出 rejectReason。
5. 不得使用保证收益、必涨、稳赚、确定性上涨等表达。
```

### 9.2 资金流向分析师

角色：

```text
资金流向分析师
```

职责：

```text
分析主力资金流入、资金持续性、资金与涨跌幅匹配、筹码集中、龙虎榜、北向资金和反弹假信号。
```

专属提示词：

```text
你是资金流向分析师。请围绕当前策略识别资金行为。重点分析当日、近5日、近20日、近60日主力资金，股东户数变化，换手率，大单净比，北向持股，龙虎榜信号，以及资金与价格的背离关系。

对主力吸筹策略，你必须区分：
1. 真吸筹：长期资金或筹码集中与短期资金共同支持。
2. 压价吸筹：资金流入但股价下跌或滞涨。
3. 假反弹：短期资金流入但长期资金大幅流出且股价已涨。

输出时给出每只股票的 fundScore、fundState、recommendation、riskFlags 和 evidenceRefs。
```

输出 JSON：

```json
{
  "agentId": "fund_flow",
  "agentName": "资金流向分析师",
  "status": "success",
  "summary": "string",
  "marketFundView": "string",
  "sectorFundView": [
    {
      "sectorName": "string",
      "state": "inflow|outflow|mixed|unknown",
      "logic": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "stockOpinions": [
    {
      "code": "string",
      "name": "string",
      "fundScore": 0,
      "fundState": "true_accumulation|suppressed_accumulation|short_rebound|distribution_risk|neutral",
      "recommendation": "support|neutral|reject",
      "logic": "string",
      "riskFlags": ["string"],
      "evidenceRefs": ["string"]
    }
  ],
  "topPicks": ["string"],
  "rejects": [
    {
      "code": "string",
      "reason": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "missingData": ["string"]
}
```

### 9.3 行业板块分析师

角色：

```text
行业板块分析师
```

职责：

```text
分析板块热度、资金集中度、板块阶段、板块持续性、板块内龙头和风险板块。
```

专属提示词：

```text
你是行业板块分析师。请根据候选股所属行业、板块资金、板块涨跌幅、板块成分强弱、新闻或政策催化，判断当前策略是否获得板块支持。

你必须输出：
1. 热点板块。
2. 启动或确认板块。
3. 过热或退潮板块。
4. 候选股在板块中的角色。
5. 板块对最终推荐的加分或扣分。

如果板块信息缺失，只能给 unknown，不得用常识补全。
```

输出 JSON：

```json
{
  "agentId": "sector",
  "agentName": "行业板块分析师",
  "status": "success",
  "summary": "string",
  "sectorOpinions": [
    {
      "sectorName": "string",
      "stage": "start|confirm|accelerate|diverge|repair|fade|unknown",
      "sectorScore": 0,
      "fundState": "inflow|outflow|mixed|unknown",
      "sustainability": "high|medium|low|unknown",
      "logic": "string",
      "riskFlags": ["string"],
      "evidenceRefs": ["string"]
    }
  ],
  "stockOpinions": [
    {
      "code": "string",
      "name": "string",
      "sectorName": "string",
      "role": "leader|core|follow|defensive|unknown",
      "recommendation": "support|neutral|reject",
      "logic": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "preferredSectors": ["string"],
  "avoidSectors": ["string"],
  "missingData": ["string"]
}
```

### 9.4 财务基本面分析师

角色：

```text
财务基本面分析师
```

职责：

```text
分析盈利能力、估值安全、成长质量、现金流、负债、财务风险和基本面托底。
```

专属提示词：

```text
你是财务基本面分析师。请判断候选股的基本面是否支持当前策略。你必须重点分析 PE、PB、ROE、营收增长、净利润增长、毛利率、资产负债率、流动比率、经营现金流和行业周期。

对高估值股票，你必须检查成长性是否能支撑估值。
对低估值股票，你必须检查是否存在价值陷阱。
对数据缺失股票，你必须降低 confidence。
```

输出 JSON：

```json
{
  "agentId": "fundamental",
  "agentName": "财务基本面分析师",
  "status": "success",
  "summary": "string",
  "stockOpinions": [
    {
      "code": "string",
      "name": "string",
      "fundamentalScore": 0,
      "valuationSafetyScore": 0,
      "qualityState": "excellent|good|acceptable|weak|unknown",
      "recommendation": "support|neutral|reject",
      "highlights": ["string"],
      "risks": ["string"],
      "logic": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "valueTrapWarnings": [
    {
      "code": "string",
      "reason": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "overvaluationWarnings": [
    {
      "code": "string",
      "reason": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "missingData": ["string"]
}
```

### 9.5 技术形态分析师

角色：

```text
技术形态分析师
```

职责：

```text
分析趋势、均线、MACD、KDJ、RSI、布林带、支撑压力、量价、入场和止损。
```

专属提示词：

```text
你是技术形态分析师。请基于输入的 K 线和技术指标判断候选股所处阶段。你必须区分低位吸筹、超跌反弹、突破确认、追高风险和破位风险。

你必须输出：
1. 技术状态。
2. 是否适合当前策略。
3. 入场观察区间。
4. 止损位。
5. 触发条件。
6. 失效条件。

如果没有足够 K 线或技术指标，必须输出 data_insufficient。
```

输出 JSON：

```json
{
  "agentId": "technical",
  "agentName": "技术形态分析师",
  "status": "success",
  "summary": "string",
  "stockOpinions": [
    {
      "code": "string",
      "name": "string",
      "technicalScore": 0,
      "technicalState": "accumulation_low|oversold_rebound|breakout|overheated|breakdown|unknown",
      "recommendation": "support|neutral|reject",
      "entryZone": "string",
      "stopLoss": "string",
      "triggerCondition": "string",
      "invalidCondition": "string",
      "logic": "string",
      "riskFlags": ["string"],
      "evidenceRefs": ["string"]
    }
  ],
  "missingData": ["string"]
}
```

### 9.6 量化分析师

角色：

```text
量化分析师
```

职责：

```text
解释量化评分、排名、因子贡献、异常值、风险惩罚和多维度一致性。
```

专属提示词：

```text
你是量化分析师。请严格基于规则引擎给出的因子分和统计字段进行分析。你不能重新计算不存在的指标。你需要解释为什么某些股票高分，为什么某些股票被扣分，并指出量化分与直觉不一致的地方。

你必须输出：
1. Top 股票共同特征。
2. 因子贡献。
3. 异常值。
4. 风险惩罚。
5. 最终量化推荐。
```

输出 JSON：

```json
{
  "agentId": "quant",
  "agentName": "量化分析师",
  "status": "success",
  "summary": "string",
  "factorInsights": [
    {
      "factor": "string",
      "observation": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "stockOpinions": [
    {
      "code": "string",
      "name": "string",
      "quantScore": 0,
      "rank": 0,
      "recommendation": "support|neutral|reject",
      "factorStrengths": ["string"],
      "factorWeaknesses": ["string"],
      "logic": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "outliers": [
    {
      "code": "string",
      "type": "high_score_high_risk|low_score_hidden_value|data_anomaly",
      "reason": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "missingData": ["string"]
}
```

### 9.7 总评审 Agent

角色：

```text
资深研究员
```

职责：

```text
综合五位 Agent 输出和规则评分，生成最终 3-10 只精选推荐。
```

专属提示词：

```text
你是资深研究员。你只能综合五位 Agent 的结构化输出、规则评分、候选股事实包和风险约束。你不得新增股票。你必须优先选择多位 Agent 共同支持、风险可解释、交易计划清晰的股票。

你必须执行以下裁决：
1. 任一硬否决风险成立时，不得进入最终推荐。
2. 基本面严重瑕疵且估值过高时，不得高置信推荐。
3. 技术过热但策略不是短期突破时，降低推荐。
4. 数据不完整时，只能给观察或数据不足。
5. 每只最终推荐必须给出入场条件、失效条件、建议仓位和追踪计划。
```

输出 JSON：

```json
{
  "agentId": "chief_reviewer",
  "agentName": "资深研究员",
  "status": "success",
  "summary": "string",
  "strategyFit": {
    "strategyId": "string",
    "fitLevel": "high|medium|low",
    "logic": "string",
    "risk": "string"
  },
  "finalPicks": [
    {
      "code": "string",
      "name": "string",
      "rank": 0,
      "confidence": "high|medium_high|medium|low",
      "recommendation": "priority|watch|avoid|data_insufficient",
      "cycle": "short|mid|long",
      "suggestedPositionPct": 0,
      "summary": "string",
      "buyCondition": "string",
      "sellCondition": "string",
      "invalidCondition": "string",
      "trackingPlan": {
        "entryPrice": 0,
        "entryZone": "string",
        "targetPrice": 0,
        "stopLossPrice": 0,
        "checkIntervalMinutes": 60,
        "watchPoints": ["string"]
      },
      "supportingAgents": ["fund_flow", "sector", "fundamental", "technical", "quant"],
      "riskFlags": ["string"],
      "evidenceRefs": ["string"]
    }
  ],
  "rejectedCandidates": [
    {
      "code": "string",
      "reason": "string",
      "evidenceRefs": ["string"]
    }
  ],
  "notifications": [
    {
      "level": "info|warning|risk",
      "message": "string",
      "evidenceRefs": ["string"]
    }
  ]
}
```

## 10. 工作流设计

### 10.1 同步运行流程

适合手动点击 `开始选股`。

```text
POST /api/selection/runs
  -> 校验用户和参数
  -> 创建 run
  -> 获取交易时段
  -> 构建候选池
  -> 执行硬过滤
  -> 获取候选股增强数据
  -> 计算策略评分
  -> 构建 StrategyFactPackage
  -> 调用五位 Agent
  -> 校验五位 Agent 输出
  -> 调用总评审 Agent
  -> 校验最终输出
  -> 保存 run、候选、Agent 报告、最终推荐
  -> 返回 runId 和摘要
```

### 10.2 异步运行流程

当候选池较大或模型耗时较高时，采用异步模式。

```text
POST /api/selection/runs
  -> 返回 runId 和 status=queued
GET /api/selection/runs/:id
  -> 轮询状态和步骤
```

状态：

```text
queued
running
agent_running
validating
success
partial
failed
cancelled
```

步骤状态：

```text
pending
running
success
failed
skipped
```

### 10.3 加入追踪流程

点击推荐卡片 `加入追踪`：

```text
POST /api/tracking/items
```

请求来自 finalPick：

```json
{
  "sourceType": "selection",
  "sourceRunId": "string",
  "code": "600153",
  "name": "建发股份",
  "strategyId": "main_force_accumulation",
  "entryZone": "9.35-9.51",
  "entryPrice": 9.51,
  "targetPrice": 12.36,
  "stopLossPrice": 9.22,
  "checkIntervalMinutes": 60,
  "buyReason": "主力吸筹策略命中，筹码集中且估值安全",
  "invalidCondition": "跌破策略失效位或资金流转弱",
  "positionPct": 10,
  "enabled": true
}
```

后端行为：

- 绑定 `sourceRunId`。
- 保存当时的策略评分、事实包摘要和 Agent 结论。
- 生成第一条追踪记忆。
- 用户后续追踪只读取自己的追踪项。

## 11. 数据模型规划

### 11.1 多用户基础表

```text
users
  id
  username
  passwordHash
  displayName
  role
  createdAt
  updatedAt

user_profiles
  userId
  riskPreference
  defaultPositionPct
  maxSinglePositionPct
  preferredStrategiesJson
  notificationSettingsJson
  createdAt
  updatedAt
```

### 11.2 策略表

```text
strategy_presets
  id
  userId
  name
  strategyId
  paramsJson
  isDefault
  createdAt
  updatedAt

strategy_runs
  id
  userId
  strategyId
  title
  status
  paramsJson
  sessionJson
  rawCandidateCount
  filteredCandidateCount
  finalPickCount
  llmStatus
  llmMetricsJson
  factPackageJson
  finalReportJson
  errorJson
  createdAt
  updatedAt
```

### 11.3 候选与 Agent 表

```text
strategy_candidates
  id
  runId
  userId
  code
  name
  sectorName
  rank
  totalScore
  confidence
  recommendation
  cycle
  positionPct
  scoresJson
  dataCompletenessJson
  evidenceJson
  riskFlagsJson
  rawJson
  createdAt

strategy_agent_reports
  id
  runId
  userId
  agentId
  agentName
  status
  summary
  outputJson
  validationErrorsJson
  promptChars
  completionTokens
  createdAt

strategy_final_picks
  id
  runId
  userId
  code
  name
  rank
  confidence
  recommendation
  cycle
  suggestedPositionPct
  buyCondition
  sellCondition
  invalidCondition
  trackingPlanJson
  supportingAgentsJson
  evidenceJson
  riskFlagsJson
  rawJson
  createdAt
```

### 11.4 用户记忆表

```text
user_stock_memories
  id
  userId
  code
  name
  firstSeenAt
  lastSeenAt
  seenCount
  lastSourceType
  lastSourceId
  lastStrategyId
  lastAction
  lastSummary
  compressedMemoryJson
  createdAt
  updatedAt

user_context_summaries
  id
  userId
  contextType
  subjectKey
  summary
  factsJson
  quality
  sourceIdsJson
  createdAt
  updatedAt
```

### 11.5 追踪表

```text
tracking_items
  id
  userId
  sourceType
  sourceRunId
  code
  name
  strategyId
  entryPrice
  entryZone
  targetPrice
  stopLossPrice
  positionPct
  buyReason
  invalidCondition
  checkIntervalMinutes
  notificationChannelsJson
  enabled
  status
  createdAt
  updatedAt

tracking_snapshots
  id
  userId
  trackingItemId
  code
  latestPrice
  pnlPct
  logicStillValid
  action
  summary
  evidenceJson
  riskFlagsJson
  rawDataJson
  createdAt
```

## 12. API 规划

### 12.1 策略定义

```text
GET /api/selection/strategies
```

返回六大策略、默认参数、字段范围和说明。

### 12.2 创建选股任务

```text
POST /api/selection/runs
```

请求：

```json
{
  "strategyId": "main_force_accumulation",
  "timeRange": "3m",
  "params": {},
  "useLLM": true,
  "mode": "sync"
}
```

响应：

```json
{
  "runId": "string",
  "status": "running|success|queued",
  "summary": "string"
}
```

### 12.3 查询选股任务

```text
GET /api/selection/runs/:id
```

返回：

```text
run
candidates
agentReports
finalPicks
contextSummary
```

### 12.4 历史记录

```text
GET /api/selection/runs?strategyId=&page=&pageSize=&from=&to=&status=
```

### 12.5 预设管理

```text
GET /api/selection/presets
POST /api/selection/presets
PATCH /api/selection/presets/:id
DELETE /api/selection/presets/:id
POST /api/selection/presets/:id/apply
```

### 12.6 加入追踪

```text
POST /api/selection/runs/:id/picks/:pickId/track
```

### 12.7 重新运行

```text
POST /api/selection/runs/:id/rerun
```

行为：

- 复制原参数。
- 使用当前最新数据。
- 新建 run。
- 保留 `parentRunId`。

## 13. 数据源字段映射

| 字段 | 首选来源 | 备用来源 | 用途 |
|---|---|---|---|
| 股票列表 | 东方财富全 A | Tushare stock_basic | 候选池 |
| 当前价 | 东方财富 | westock kline latest | 展示和计划 |
| 涨跌幅 | 东方财富 | Tushare daily | 筛选 |
| 市值 | Tushare daily_basic | 东方财富 | 筛选 |
| 换手率 | Tushare daily_basic | 东方财富 | 策略评分 |
| 量比 | Tushare daily_basic | 东方财富 | 活跃度 |
| K 线 | westock kline | Tushare daily | 技术指标 |
| MA/MACD/RSI | westock technical | 本地计算 | 技术评分 |
| KDJ/BOLL | 本地计算 | 技术库 | 技术评分 |
| 主力资金 | westock asfund | Tushare moneyflow | 资金评分 |
| 股东户数 | Tushare stk_holdernumber | westock shareholder | 筹码评分 |
| 财务指标 | Tushare fina_indicator | westock finance | 基本面评分 |
| 公司资料 | westock profile | Tushare stock_basic | 公司认知 |
| 板块成分 | 东方财富 | Tushare index_member_all | 板块评分 |
| 龙虎榜 | westock asfund LhbInfos | 东方财富龙虎榜 | 外部验证 |
| 新闻 | 新闻聚合源 | 东方财富资讯 | 事件风险 |

所有字段进入事实包时必须带来源留痕。

## 14. 上下文与历史记忆

### 14.1 记忆分层

```text
全局市场记忆
用户策略记忆
用户个股记忆
用户追踪记忆
用户偏好记忆
```

### 14.2 进入模型的压缩上下文

每次选股进入模型的历史上下文限制为：

```text
最近一次同策略 run 摘要
最近 3 条同股票用户追踪摘要
当前用户风险偏好
当前用户持仓暴露
当前市场状态摘要
当前策略事实包
```

不得把完整历史报告直接塞入 prompt。

### 14.3 用户隔离

所有用户相关表必须包含 `userId`。

查询必须带：

```text
where userId = currentUser.id
```

禁止用股票代码作为全局用户记忆主键。

全局市场数据可以共享，用户行为、追踪、预设、持仓、上下文摘要必须隔离。

## 15. 校验与安全

### 15.1 LLM 输出校验

必须校验：

```text
股票必须来自候选池
推荐数量不得超过参数上限
仓位不得超过用户和系统限制
evidenceRefs 必须存在
不得出现保证收益词
不得新增数据事实
不得输出 Markdown
```

### 15.2 数据安全

多用户上线前必须处理：

```text
密码使用 Argon2id 或同等级哈希
API Key 加密存储
用户数据按 userId 隔离
通知 Webhook 脱敏
日志不得输出密钥
开发调试接口仅管理员可用
```

### 15.3 风控边界

系统统一限制：

```text
单股建议仓位默认不超过 10%
低置信度不得给高仓位
数据不足不得给买入建议
非交易时段不得输出立即买入
涨停不可买入时只能输出等待
跌停流动性风险必须提示
```

## 16. 验收标准

第一阶段必须通过：

- 可以打开策略选股页。
- 可以选择六大策略。
- 切换策略后默认时间窗口和参数同步变化。
- 高级设置可展开和收起。
- 点击开始选股后生成 run。
- 至少主力吸筹策略能完成规则筛选。
- 五位 Agent 输出结构化 JSON。
- 总评审输出最终精选。
- 结果页展示候选数量、筛选数量、推荐数量、Agent 状态和精选列表。
- 点击推荐股可展开详情。
- 点击加入追踪能创建用户自己的追踪项。
- 历史记录只展示当前用户数据。
- 所有推荐结论带 evidenceRefs。
- 模型关闭时仍能输出规则模式结果。

第二阶段验收：

- 短期突破、价值稳健、低风险收益上线。
- 用户预设可保存和复用。
- 追踪历史能反哺用户个股记忆。
- 同一股票不同用户的追踪计划互不影响。

第三阶段验收：

- 成长潜力和板块轮动上线。
- 板块轮动可复用主线驾驶舱的板块状态。
- 新闻事件进入风险和催化因子。
- 策略结果可以做命中率、回撤、胜率和复盘统计。

## 17. 开发顺序

### 17.1 第一批任务

1. 新增 `selection/types.ts`，冻结策略、参数、候选、Agent 输出、最终推荐类型。
2. 新增 `selection/strategies.ts`，定义六大策略和默认参数。
3. 新增数据库表和 repository。
4. 新增 `/api/selection/strategies`。
5. 新增 `/api/selection/runs`，先支持主力吸筹规则模式。
6. 新增策略选股页面、策略弹窗和参数配置。
7. 新增结果页展示。

### 17.2 第二批任务

1. 接入五位 Agent prompt。
2. 接入总评审 Agent。
3. 增加 LLM 输出校验。
4. 增加历史记录页。
5. 增加加入追踪。

### 17.3 第三批任务

1. 实现短期突破。
2. 实现价值稳健。
3. 实现低风险收益。
4. 实现用户预设。
5. 实现用户上下文摘要。

### 17.4 第四批任务

1. 实现成长潜力。
2. 实现板块轮动。
3. 接入新闻事件因子。
4. 做策略复盘统计。
5. 做多用户权限和数据迁移强化。

## 18. 关键设计原则

- 主线驾驶舱继续做市场主线判断。
- 策略选股做风格化、多策略、可追踪的股票筛选。
- 规则先行，模型解释，模型不得直接选池外股票。
- 每个用户拥有自己的预设、历史、追踪、持仓和上下文。
- 全局市场数据可共享，用户决策记忆必须隔离。
- 任何推荐都必须有入场条件、失效条件、仓位约束和风险提示。
- 每次选股结果都必须能追溯到数据源、规则评分和 Agent 输出。

---

## 【AI优化补充】19. 前端组件架构设计

> 优化标记：原文档缺失前端组件结构定义，现补充完整组件树和职责说明。

### 19.1 组件目录结构

```text
src/components/selection/
  StrategySelectorModal/       # 策略选择弹窗（2行3列卡片）
    index.tsx
    StrategyCard.tsx           # 单张策略卡片
    StrategyBadge.tsx          # 风险等级标签
  ParameterPanel/              # 参数配置主面板
    index.tsx
    BasicParams.tsx            # 基础参数区
    AdvancedSettings.tsx       # 高级设置展开区
    ParamSlider.tsx            # 参数联动滑块
  AgentReportPanel/            # Agent团队报告面板
    index.tsx
    AgentCard.tsx              # 单个Agent折叠卡
    AgentStatusBadge.tsx       # Agent运行状态
    AgentDisputeAlert.tsx      # Agent分歧警示
  StockRecommendationCard/     # 推荐股票卡片
    index.tsx
    StockRankBadge.tsx         # 排名标识
    StockTagGroup.tsx          # 信心/周期/仓位标签
    StockActionBar.tsx         # 加入追踪/模拟持仓按钮
  StockDetailDrawer/           # 个股详情抽屉
    index.tsx
    CoreMetricsGrid.tsx        # 核心指标网格
    StrategyHitTags.tsx        # 策略命中标签
    TradePlanTable.tsx         # 交易计划表
    RadarChart.tsx             # 五维雷达图
  RunSummaryHeader/            # 运行汇总头部
    index.tsx
    RunStatsCards.tsx          # 统计卡片（获取/筛选/推荐数）
    TokenUsageBadge.tsx        # Token消耗展示
    ProgressTracker.tsx        # 步骤进度条
  HistoryTable/                # 历史记录表格
    index.tsx
    HistoryFilterBar.tsx       # 过滤器栏
    HistoryRow.tsx             # 单行记录
    RerunButton.tsx            # 复跑按钮
  PresetManager/               # 预设管理
    index.tsx
    PresetCard.tsx             # 预设卡片
    PresetFormModal.tsx        # 预设编辑弹窗
  StrategyPerformanceBoard/    # 策略效果看板
    index.tsx
    WinRateChart.tsx           # 胜率趋势图
    ReturnDistribution.tsx     # 收益分布图
  ComparisonPanel/             # 结果对比面板
    index.tsx
    DiffHighlight.tsx          # 差异高亮
```

### 19.2 关键组件交互说明

| 组件 | 输入 | 输出 | 备注 |
|---|---|---|---|
| StrategySelectorModal | strategies[] | onSelect(strategyId) | 选中后同步更新ParameterPanel默认值 |
| ParameterPanel | strategyId, presets[] | onChange(params), onRun() | 参数变更时触发联动提示 |
| AgentReportPanel | agentReports[] | onExpand(agentId) | 展开时加载详细JSON |
| StockRecommendationCard | finalPick | onTrack(), onDetail() | 卡片hover显示快捷操作 |
| StockDetailDrawer | code, runId | onClose() | 从右侧滑出，不跳转页面 |
| ProgressTracker | steps[] | onCancel() | 每步显示实时日志摘要 |

---

## 【AI优化补充】20. 实时进度与运行状态

> 优化标记：原文档仅列出6步流程，现补充前端实时展示方案和取消/重试机制。

### 20.1 步骤进度条设计

```text
[1.获取市场与候选池] -> [2.执行硬过滤] -> [3.计算策略评分] -> [4.运行五位Agent] -> [5.总评审精选] -> [6.保存历史]
```

每步展示：
- 步骤图标（pending/running/success/failed）
- 步骤名称
- 实时日志（如"已获取250只候选股，来自全A列表"）
- 耗时

### 20.2 实时日志规范

| 步骤 | 日志示例 |
|---|---|
| 步骤1 | `获取全A列表: 5352只 -> 过滤ST/停牌: 剩余4821只 -> 按市值排序取前250只` |
| 步骤2 | `执行硬过滤: 250只 -> 排除涨幅>30%: 剩余198只 -> 排除资金流出: 剩余156只` |
| 步骤3 | `计算评分: 资金强度(25%) + 筹码集中(20%) + ... -> 生成排名` |
| 步骤4 | `Agent[资金流向]: 运行中... -> 完成，分析156只股票 -> 支持89只，反对23只` |
| 步骤5 | `总评审: 综合5位Agent意见 -> 精选10只 -> 生成交易计划` |
| 步骤6 | `保存run #1871 -> 创建追踪项 -> 更新用户记忆` |

### 20.3 取消与重试机制

```typescript
// 取消运行
POST /api/selection/runs/:id/cancel

// 重试失败步骤
POST /api/selection/runs/:id/retry?step=agent_running

// 仅重试某位Agent
POST /api/selection/runs/:id/agents/:agentId/retry
```

前端状态：
- `running`：显示取消按钮
- `agent_running`：显示各Agent独立状态，支持单Agent重试
- `failed`：显示失败步骤和重试按钮
- `cancelled`：显示已取消，支持从该步骤恢复

---

## 【AI优化补充】21. 可视化图表设计

> 优化标记：原文档完全缺失可视化部分，现补充5类核心图表。

### 21.1 候选股评分分布直方图

用途：展示本次候选股的评分分布，帮助用户理解筛选严格程度。

```text
X轴: 评分区间 (0-20, 20-40, 40-60, 60-80, 80-100)
Y轴: 股票数量
高亮: 最终推荐的股票所在区间
```

### 21.2 个股五维雷达图

用途：在个股详情中直观展示股票在五个维度的表现。

```text
维度: 资金强度 | 技术形态 | 基本面 | 估值安全 | 板块匹配
范围: 0-100
对比: 可叠加行业平均值
```

### 21.3 推荐列表板块分布饼图

用途：展示本次推荐股票的板块集中度，提示分散风险。

```text
展示: 前5大板块占比 + 其他
交互: 点击板块可筛选该板块推荐股
预警: 某板块占比>40%时提示"板块集中度过高"
```

### 21.4 策略历史命中率趋势图

用途：在策略说明页展示该策略的历史表现。

```text
X轴: 时间（按月）
Y轴左: 命中率 (%)
Y轴右: 平均收益 (%)
线型: 命中率(折线) + 平均收益(柱状)
```

### 21.5 Agent分歧矩阵图

用途：展示五位Agent对每只股票的意见一致性。

```text
行: 股票列表
列: 5位Agent
颜色: 绿色(支持) / 灰色(中性) / 红色(反对)
汇总: 右侧显示支持票数
```

---

## 【AI优化补充】22. 策略回测与效果验证

> 优化标记：原文档第17.4批提到"策略复盘统计"但无详细设计，现补充完整回测框架。

### 22.1 回测数据模型

```text
strategy_backtests
  id
  strategyId
  periodStart
  periodEnd
  totalRuns          # 运行次数
  totalPicks         # 总推荐数
  winCount           # 盈利次数（以推荐后N日收益>0计）
  lossCount          # 亏损次数
  avgReturnPct       # 平均收益
  maxReturnPct       # 最大收益
  minReturnPct       # 最小收益
  maxDrawdownPct     # 最大回撤
  sharpeRatio        # 夏普比率
  winRatePct         # 胜率
  avgHoldingDays     # 平均持有天数
  createdAt
```

### 22.2 回测计算规则

| 指标 | 计算方式 |
|---|---|
| 胜率 | 推荐后N日收益>0的次数 / 总推荐次数 |
| 平均收益 | 所有推荐后N日收益的算术平均 |
| 最大回撤 | 推荐后任意时点最大亏损幅度 |
| 夏普比率 | (平均收益 - 无风险利率) / 收益标准差 |
| 盈亏比 | 平均盈利 / 平均亏损 |

默认回测周期：
- 短期突破：推荐后5个交易日
- 主力吸筹：推荐后20个交易日
- 价值稳健：推荐后60个交易日
- 成长潜力：推荐后60个交易日
- 板块轮动：推荐后20个交易日
- 低风险收益：推荐后40个交易日

### 22.3 策略效果看板UI

在"策略说明"Tab中增加：

```text
┌─────────────────────────────────────────┐
│ 主力吸筹 - 策略效果看板                    │
├─────────────────────────────────────────┤
│ 近3个月运行: 12次  总推荐: 120只          │
│                                         │
│ 胜率: 62%        平均收益: +8.5%         │
│ 最大收益: +35.2%  最大亏损: -12.8%       │
│ 最大回撤: -5.2%   夏普比率: 1.35         │
│                                         │
│ [胜率趋势图] [收益分布图]                 │
│                                         │
│ 最近5次运行:                            │
│ #1871: 10只 -> 待验证                    │
│ #1865: 10只 -> 胜率70% (7/10盈利)        │
│ #1859: 10只 -> 胜率50%                   │
└─────────────────────────────────────────┘
```

### 22.4 用户反馈闭环

```text
user_pick_feedback
  id
  userId
  runId
  code
  action             # tracked / ignored / bought / watched
  actualEntryPrice   # 实际买入价（用户填写）
  actualExitPrice    # 实际卖出价
  actualReturnPct    # 实际收益
  feedbackScore      # 用户评分 1-5
  feedbackText       # 用户文字反馈
  createdAt
```

前端入口：在推荐卡片上增加"标记结果"按钮：
- `已买入` -> 弹窗输入买入价
- `已观察` -> 记录观察
- `已忽略` -> 记录忽略原因
- `已卖出` -> 弹窗输入卖出价，计算实际收益

---

## 【AI优化补充】23. 智能参数推荐

> 优化标记：原文档参数为静态默认值，现补充基于市场状态的动态推荐。

### 23.1 市场状态识别

```typescript
type MarketState = 'bull' | 'bear' | 'oscillation' | 'recovery' | 'distribution'

function detectMarketState(): MarketState {
  // 基于大盘指数20日/60日均线、成交量、涨跌比、波动率综合判断
}
```

### 23.2 参数联动推荐表

| 市场状态 | 影响参数 | 推荐调整 | 说明 |
|---|---|---|---|
| 牛市 | 当日最大涨幅 | 5% -> 8% | 允许更高弹性 |
| 牛市 | 最大涨跌幅 | 30% -> 50% | 放宽涨幅限制 |
| 熊市 | 当日最大涨幅 | 5% -> 3% | 防追高 |
| 熊市 | 最小市值 | 10亿 -> 30亿 | 偏好大盘防御 |
| 震荡 | 最大换手率 | 空 -> 15% | 过滤过度活跃 |
| 震荡 | MACD信号 | 不限 -> 金叉 | 强化趋势确认 |
| 复苏 | 均线趋势 | 不限 -> 多头 | 偏好右侧确认 |
| 派发 | 60日资金要求 | 不限 -> 必须为正 | 排除资金流出 |

### 23.3 前端交互

当用户切换策略或市场状态变化时：
```text
⚡ 智能提示: 当前市场处于震荡期，建议将"当日最大涨幅"从5%调整为3%，避免追高。
         [采纳建议] [忽略]
```

---

## 【AI优化补充】24. 多策略组合与冲突检测

> 优化标记：原文档为单策略运行设计，现补充多策略并行和冲突处理。

### 24.1 多策略并行运行

```text
POST /api/selection/runs/batch

请求:
{
  "runs": [
    { "strategyId": "main_force_accumulation", "params": {} },
    { "strategyId": "short_term_breakout", "params": {} }
  ],
  "deduplicate": true,
  "crossStrategyRank": true
}
```

### 24.2 策略冲突检测

| 冲突类型 | 检测逻辑 | 处理方式 |
|---|---|---|
| 同股多策略推荐 | 股票出现在>1个策略的推荐中 | 合并展示，标注"多策略共振" |
| 策略互斥 | A策略推荐、B策略反对同股票 | 高亮显示，提示"策略分歧" |
| 板块过度集中 | 多策略推荐同一板块>50% | 提示"板块集中风险" |
| 仓位超限 | 多策略推荐总仓位>用户上限 | 按综合评分排序截断 |

### 24.3 多策略结果合并UI

```text
┌─────────────────────────────────────────┐
│ 多策略组合运行 #1880                     │
│ 策略: 主力吸筹 + 短期突破                 │
├─────────────────────────────────────────┤
│ 🏆 多策略共振 (2个策略同时推荐)           │
│   1. 建发股份 - 主力吸筹#1 / 短期突破#3   │
│   2. 兔宝宝   - 主力吸筹#2 / 短期突破#5   │
├─────────────────────────────────────────┤
│ 📊 主力吸筹独有推荐 (8只)                │
│ 📊 短期突破独有推荐 (3只)                │
├─────────────────────────────────────────┤
│ ⚠️ 策略分歧                               │
│   保隆科技: 主力吸筹推荐 / 短期突破回避    │
└─────────────────────────────────────────┘
```

---

## 【AI优化补充】25. 结果对比分析

> 优化标记：新增功能，允许用户对比两次选股结果的差异。

### 25.1 对比API

```text
POST /api/selection/runs/compare

请求:
{
  "runIdA": "1871",
  "runIdB": "1865"
}

响应:
{
  "samePicks": [{"code":"600153","name":"建发股份","rankA":1,"rankB":2}],
  "newInA": [{"code":"603507","name":"振江股份","reason":"新增推荐"}],
  "removedInA": [{"code":"600096","name":"云天化","reason":"资金流转弱"}],
  "rankChanges": [{"code":"600153","change":-1}],
  "scoreChanges": [{"code":"600153","scoreA":65.7,"scoreB":62.3}]
}
```

### 25.2 对比UI

```text
┌─────────────────────────────────────────┐
│ 结果对比: #1871 vs #1865                 │
│ 策略: 主力吸筹 vs 主力吸筹               │
│ 时间: 2026-06-07 vs 2026-06-06          │
├─────────────────────────────────────────┤
│ ✅ 相同推荐 (8只)                         │
│    建发股份 #1 -> #2 (排名下降1位)        │
│    兔宝宝   #2 -> #1 (排名上升1位)        │
├─────────────────────────────────────────┤
│ 🆕 新增推荐 (2只)                         │
│    振江股份 - 筹码集中+突破确认            │
│    保隆科技 - 资金大幅流入                │
├─────────────────────────────────────────┤
│ ❌ 移除推荐 (2只)                         │
│    云天化 - 60日资金流转为负               │
│    XX股份 - 跌破MA60支撑                  │
├─────────────────────────────────────────┤
│ 📊 评分变化                               │
│    [评分变化柱状图]                        │
└─────────────────────────────────────────┘
```

---

## 【AI优化补充】26. 数据预加载与缓存

> 优化标记：补充性能优化方案，减少用户等待时间。

### 26.1 候选池预加载

```text
// 非交易时段预计算
 cron: 0 2 * * *  (每日凌晨2点)

任务:
1. 拉取全A列表
2. 执行通用硬过滤（排除ST/停牌/上市不足）
3. 计算基础指标（市值/换手/涨幅）
4. 缓存到 Redis: `precomputed:candidate_pool:{date}`

// 交易时段增量更新
 cron: */5 9-15 * * 1-5  (交易日每5分钟)

任务:
1. 更新当日行情
2. 更新涨跌停状态
3. 更新资金流
```

### 26.2 Agent输出缓存

```text
// 同策略同参数短期内复用
缓存键: `agent_output:{strategyId}:{paramHash}:{marketDate}`
TTL: 4小时

适用:
- 用户快速重复运行同策略
- 多策略组合运行时共享Agent分析
```

### 26.3 前端本地缓存

```typescript
// 用户预设缓存
localStorage.setItem('selection_presets', JSON.stringify(presets))

// 最近选股参数缓存
localStorage.setItem('selection_last_params', JSON.stringify(lastParams))

// 策略说明缓存（不常变化）
localStorage.setItem('selection_strategies_info', JSON.stringify(strategies))
```

---

## 【AI优化补充】27. 通知与提醒系统

> 优化标记：补充完整的通知触达机制。

### 27.1 通知类型

| 触发时机 | 通知内容 | 渠道 |
|---|---|---|
| 选股完成 | "主力吸筹策略完成，精选10只股票" | WebSocket + 站内信 |
| 追踪触发 | "建发股份触及入场区间9.35-9.51" | WebSocket + 邮件 |
| 策略失效 | "兔宝宝跌破止损位9.22，策略失效" | WebSocket + 企微 |
| 市场异动 | "您关注的板块出现资金大幅流入" | 站内信 |
| 定期报告 | "本周策略选股周报已生成" | 邮件 |

### 27.2 WebSocket事件

```text
ws://api/selection/events

event: run.completed
payload: { runId, strategyId, finalCount, topPickName }

event: run.failed
payload: { runId, failedStep, errorMessage }

event: tracking.triggered
payload: { trackingItemId, code, name, triggerType, currentPrice }

event: tracking.invalidated
payload: { trackingItemId, code, name, invalidReason }
```

### 27.3 通知设置

```text
user_notification_settings
  userId
  channels: { websocket: true, email: false, wecom: true }
  events: {
    runCompleted: true,
    trackingTriggered: true,
    trackingInvalidated: true,
    marketAlert: false
  }
  quietHours: { start: "22:00", end: "09:00" }
```

---

## 【AI优化补充】28. 导出功能

> 优化标记：新增数据导出能力，方便用户离线使用。

### 28.1 导出格式

| 格式 | 内容 | 用途 |
|---|---|---|
| PDF研报 | 完整选股报告（策略说明、Agent分析、推荐列表、交易计划） | 存档/分享 |
| Excel | 推荐股票列表+核心指标 | 进一步分析 |
| 自选股文件 | 通达信/同花顺格式 | 导入券商软件 |
| JSON | 完整结构化数据 | 二次开发 |

### 28.2 导出API

```text
POST /api/selection/runs/:id/export

请求:
{
  "format": "pdf|excel|selfstock|json",
  "includeAgents": true,
  "includeTradePlan": true
}

响应:
{
  "downloadUrl": "https://cdn.example.com/exports/run_1871.pdf",
  "expiresAt": "2026-06-08T00:00:00Z"
}
```

---

## 【AI优化补充】29. 前端性能与体验优化

> 优化标记：补充前端层面的性能保障措施。

### 29.1 虚拟滚动

推荐列表超过20只时启用虚拟滚动：
```text
<VirtualList itemHeight={120} overscan={5}>
  {finalPicks.map(pick => <StockCard key={pick.code} {...pick} />)}
</VirtualList>
```

### 29.2 懒加载

- Agent报告默认折叠，展开时才请求详细JSON
- 个股详情抽屉打开时才加载K线数据
- 历史记录分页加载，每页20条

### 29.3 骨架屏

```text
选股分析页加载时:
[策略选择骨架] -> [参数面板骨架] -> [运行按钮骨架]

结果页加载时:
[汇总卡片骨架 x4] -> [Agent报告骨架 x5] -> [推荐列表骨架 x10]
```

### 29.4 错误边界

```typescript
// 组件级错误捕获
<ErrorBoundary fallback={<AgentErrorCard agentId={id} />}>
  <AgentReportPanel report={report} />
</ErrorBoundary>

// 页面级错误捕获
<ErrorBoundary fallback={<SelectionErrorPage />}>
  <SelectionPage />
</ErrorBoundary>
```

---

## 【AI优化补充】30. 验收标准补充

> 优化标记：在原有验收标准基础上增加AI优化相关的验收项。

### 30.1 第一阶段补充验收

- [ ] 策略选择弹窗展示6张卡片，带风险等级颜色标识
- [ ] 参数面板支持智能提示和联动推荐
- [ ] 运行进度条展示6步实时状态
- [ ] 结果页展示候选评分分布直方图
- [ ] 推荐卡片展示五维雷达图入口
- [ ] 支持取消运行和失败重试

### 30.2 第二阶段补充验收

- [ ] Agent报告展示分歧矩阵图
- [ ] 策略说明页展示历史胜率趋势图
- [ ] 支持用户标记推荐结果（已买入/已观察/已忽略）
- [ ] 支持两次结果对比分析
- [ ] 支持导出PDF研报和Excel

### 30.3 第三阶段补充验收

- [ ] 支持多策略组合运行
- [ ] 支持策略冲突检测和提示
- [ ] 支持WebSocket实时通知
- [ ] 支持数据预加载（运行时间<10秒）
- [ ] 策略回测统计自动更新

### 30.4 第四阶段补充验收

- [ ] 用户反馈闭环完整（推荐->跟踪->反馈->归因）
- [ ] 策略效果归因分析（哪些因子贡献最大）
- [ ] 智能参数推荐准确率>70%
- [ ] 系统支持1000+用户并发选股

---

## 【AI优化补充】31. 开发顺序调整

> 优化标记：将AI优化内容融入原有开发计划。

### 31.1 第一批任务（调整）

1. 新增 `selection/types.ts`，冻结策略、参数、候选、Agent 输出、最终推荐类型。
2. 新增 `selection/strategies.ts`，定义六大策略和默认参数。
3. 新增数据库表和 repository（含回测表、反馈表）。
4. 新增 `/api/selection/strategies`。
5. 新增 `/api/selection/runs`，先支持主力吸筹规则模式。
6. 新增策略选股页面、策略弹窗和参数配置（含智能提示）。
7. 新增结果页展示（含进度条、汇总卡片、推荐列表）。
8. **【新增】** 新增可视化组件：评分分布图、雷达图、板块饼图。
9. **【新增】** 新增实时进度追踪和取消/重试机制。
10. **【新增】** 新增数据预加载和缓存机制。

### 31.2 第二批任务（调整）

1. 接入五位 Agent prompt。
2. 接入总评审 Agent。
3. 增加 LLM 输出校验。
4. 增加历史记录页。
5. 增加加入追踪。
6. **【新增】** 增加Agent分歧矩阵和可视化。
7. **【新增】** 增加用户反馈闭环（标记结果）。
8. **【新增】** 增加导出功能（PDF/Excel/自选股）。

### 31.3 第三批任务（调整）

1. 实现短期突破。
2. 实现价值稳健。
3. 实现低风险收益。
4. 实现用户预设。
5. 实现用户上下文摘要。
6. **【新增】** 实现策略回测统计和效果看板。
7. **【新增】** 实现结果对比分析。
8. **【新增】** 实现智能参数推荐。

### 31.4 第四批任务（调整）

1. 实现成长潜力。
2. 实现板块轮动。
3. 接入新闻事件因子。
4. 做策略复盘统计。
5. 做多用户权限和数据迁移强化。
6. **【新增】** 实现多策略组合运行和冲突检测。
7. **【新增】** 实现通知与提醒系统（WebSocket/邮件/企微）。
8. **【新增】** 实现用户行为分析和策略归因。
9. **【新增】** 性能优化（虚拟滚动、懒加载、骨架屏、错误边界）。
---

## Serenity 供应链瓶颈研究模块补充

### 定位

Serenity 模块不是交易信号模块，而是“产业链瓶颈研究 / 研究优先级”模块。它用于回答：

- 一个主题里，应该先看哪些产业链层级；
- 哪些公司更接近真实瓶颈；
- 当前证据强度如何；
- 还缺哪些公告、财报、客户、产能、订单或技术证据；
- 哪些反证会推翻这个研究方向。

交易动作仍必须回到系统原有的主线阶段、候选股过滤、买点质量、风险约束和仓位规则，不能由 Serenity 直接给出买入指令。

### 已固化能力

- 新增 `src/lib/serenity/types.ts`，定义主题研究输入、候选评分、证据强度、研究结果等类型。
- 新增 `src/lib/serenity/scoring.ts`，把 Serenity scorecard 固化为可重复计算的评分逻辑。
- 新增 `src/lib/serenity/research.ts`，负责创建研究 run、读取历史 run、保留完整输入输出。
- 新增数据库表 `serenity_research_runs`，研究过程留痕，不覆盖历史。
- 新增接口 `/api/serenity/runs` 和 `/api/serenity/runs/[id]`。
- 新增前端工作台 `SerenityResearchWorkspace`，可录入主题、候选公司、因子评分和证据，生成研究优先级并查看历史。

### 后续接入路线

1. 从“主线追踪 / 策略选股”的候选股一键导入 Serenity 候选池。
2. 自动补充公司主营、产业链位置、财报摘要、公告证据、板块归属和客户线索。
3. 增加 DeepSeek 可选增强，只做“证据补全、瓶颈解释、缺失证明、反证条件”，默认关闭以控制 token。
4. 将 Serenity 输出作为候选池加分项或研究标签，不直接改变交易仓位。
5. 增加证据列表编辑器，支持多条来源、来源类型、强弱等级和核验状态。
