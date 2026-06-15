# A股主线趋势助手文档索引

本文档集用于指导“A股主线趋势助手”的 MVP 开发。系统定位为投资决策辅助工具，不自动交易，不承诺收益，不替代持牌投资顾问服务。

## 文档清单

1. [产品需求文档](./01_PRD.md)
2. [功能规格说明](./02_FUNCTIONAL_SPEC.md)
3. [策略逻辑说明书](./03_STRATEGY_LOGIC.md)
4. [数据源与 westock-data 命令规范](./04_DATA_SOURCE_WESTOCK.md)
5. [DeepSeek 与提示词规范](./05_LLM_DEEPSEEK_PROMPTS.md)
6. [系统架构设计](./06_ARCHITECTURE.md)
7. [API 接口规范](./07_API_SPEC.md)
8. [UI/UX 设计规范](./08_UI_UX_SPEC.md)
9. [测试与验收标准](./09_TEST_ACCEPTANCE.md)
10. [开发计划、部署与运维](./10_DEVELOPMENT_PLAN_OPERATIONS.md)
11. [多智能体协作开发说明](./11_MULTI_AGENT_WORKFLOW.md)
12. [MVP 接口契约与实施校准说明](./12_MVP_CONTRACTS_AND_IMPLEMENTATION_NOTES.md)
13. [多策略选股模块设计与开发规划](./13_MULTI_STRATEGY_STOCK_SELECTION_DESIGN.md)
14. [数据库架构与迁移规划](./14_DATABASE_ARCHITECTURE_AND_MIGRATION.md)
15. [Serenity 供应链瓶颈研究模块开发设计](./15_SERENITY_BOTTLENECK_RESEARCH_DESIGN.md)

## 核心原则

- 先看市场，再看板块，再看个股，最后看买点。
- 所有建议必须展示真实数据依据、判断逻辑、风险条件和失效条件。
- westock-data 的调用方式必须固化在后端程序中，不能依赖大模型自行调用工具。
- 核心策略判断必须由规则引擎先完成，大模型只负责基于事实包进行解释、归纳和生成文本建议。
- 大模型不得凭空编造数据，也不得新增事实包之外的行情、资金、新闻或财务信息。
- 盘口事实优先于新闻叙事，新闻只能作为逻辑增强项。
- 系统给出的是辅助决策建议，用户自行确认交易。

## 开发前置要求

- 开发前必须先冻结 `FactPackage`、规则引擎输出、候选股、公司认知卡片和 DeepSeek 输出 JSON Schema。
- 开发前必须运行 westock-data CLI 冒烟测试，确认当前安装版本的真实命令支持和输出格式。
- 文档中的命令说明以项目实测结果和后端 Adapter 白名单为准；如果 skill 说明、CLI 速查表和真实输出不一致，以真实输出和 Adapter 测试为准。
- 所有中文文档、提示词、报告模板和前端文案必须按 UTF-8 读写，避免 Windows PowerShell 默认编码导致乱码。
