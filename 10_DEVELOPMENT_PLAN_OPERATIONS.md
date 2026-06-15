# 开发计划、部署与运维

## 1. 开发阶段

### 阶段零：契约冻结与数据源校准

目标：

- 冻结核心 TypeScript 类型：`DataCompleteness`、`CompanyKnowledgeCard`、`StockCandidate`、`RuleResult`、`FactPackage`、`DeepSeekReport`。
- 运行 westock-data CLI 冒烟测试。
- 确认 Adapter 白名单命令。
- 固化 Parser 对多分节表、批量元信息、空输出、`-` 无效值、JSON 字符串单元格的处理方式。
- 建立最小 fixture，用于单元测试 Parser 和规则引擎。

### 阶段一：基础 MVP

目标：

- 项目初始化。
- 配置中心。
- SQLite 数据库。
- westock-data 调用和解析。
- 公司认知卡片基础数据解析。
- 原始输出、解析结果和运行日志保存。

### 阶段二：策略引擎

目标：

- 大盘环境判断。
- 主线识别。
- 强股筛选。
- 公司主营业务与主线匹配判断。
- 买卖计划结构化输出。
- 在不调用 DeepSeek 的情况下输出完整基础分析。

### 阶段三：DeepSeek 集成

目标：

- 配置 DeepSeek。
- 调用模型生成报告。
- 输出校验。
- 幻觉防控。
- 失败时回退到规则引擎报告。

### 阶段四：通知与定时任务

目标：

- 飞书通知。
- 企业微信通知。
- 定时任务。
- 历史报告推送。

### 阶段五：UI 优化与验收

目标：

- 仪表盘。
- 主线页面。
- 强股候选页面。
- 公司认知卡片。
- 配置页面。
- 测试和修复。

## 2. 推荐目录结构

```text
src/
  app/
  components/
  lib/
    westock/
    strategy/
    llm/
    notifications/
    db/
  pages/api/ or app/api/
  styles/
docs/
```

## 3. 部署要求

运行环境：

- Node.js
- npm/npx
- 网络访问能力
- 可写数据库文件目录

## 4. 环境变量

可选：

```text
DATABASE_URL
WESTOCK_PACKAGE_VERSION
DEEPSEEK_BASE_URL
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
```

敏感配置也可通过页面保存到数据库。

## 5. 日志要求

记录：

- 每次分析开始和结束。
- 调用的 westock-data 命令。
- 命令原始输出摘要。
- 解析结果。
- DeepSeek 调用状态。
- 通知发送状态。
- 错误详情。

敏感信息脱敏：

- API Key
- Webhook URL

## 6. 运维操作

常见操作：

- 查看历史报告。
- 重新运行某次分析。
- 测试通知。
- 清理旧报告。
- 更新 westock-data 版本。
- 修改 DeepSeek 模型。

## 7. 合规与风险说明

系统每份报告必须包含：

> 本报告仅用于投资研究和交易计划辅助，不构成投资建议或收益承诺。市场有风险，交易需谨慎，最终决策由用户自行承担。

## 8. 后续迭代

可扩展：

- 用户自选股池。
- 持仓手动录入。
- 模拟持仓追踪。
- 历史判断复盘。
- 策略评分回测。
- 多模型对比。
- 更多通知渠道。
- 移动端优化。

## 8.1 MVP 后第一增强：模拟持仓追踪

目标：

- 支持从候选股或手动创建模拟持仓。
- 保存模拟买入价格、仓位、买入逻辑、失效条件和计划周期。
- 定时追踪启用中的模拟持仓。
- 判断原买入逻辑是否仍成立。
- 输出继续持有、减仓、退出、等待加仓条件、数据不足等建议。
- 保存追踪历史并推送风险提醒。

实施顺序：

1. 增加模拟持仓和追踪快照数据库表。
2. 增加模拟持仓 API。
3. 增加 Position Tracking Rule Engine。
4. 复用 westock-data Adapter 获取分时、K 线、技术指标、资金流和板块状态。
5. 增加追踪报告 Prompt 和输出校验。
6. 增加模拟持仓 UI。
7. 增加通知触发。
8. 补齐测试。
