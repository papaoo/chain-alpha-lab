import { z } from "zod";
import { SCHEMA_VERSION } from "../types";

export const reportActionValues = [
  "观察",
  "小仓试错",
  "等待回踩",
  "不追",
  "回避",
  "数据不足",
  "减仓",
] as const;

export const degradedActionValues = [
  "观察",
  "等待回踩",
  "不追",
  "回避",
  "数据不足",
  "减仓",
] as const;

const evidenceRefsSchema = z.array(z.string().min(1)).min(1);

const marketStructureInsightSchema = z.object({
  breadth: z.string().min(1),
  liquidity: z.string().min(1),
  riskPressure: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

const marketStateFlipConditionSchema = z.object({
  targetState: z.enum(["可交易", "谨慎交易", "防守观望"]),
  condition: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

const mainlineCompetitionSchema = z.object({
  lineName: z.string().min(1),
  rank: z.number().int().positive(),
  competitionLogic: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

const mainlineStageForecastSchema = z.object({
  name: z.string().min(1),
  currentStage: z.enum(["观察", "启动", "确认", "加速", "分歧", "退潮"]),
  nextStage: z.enum(["观察", "启动", "确认", "加速", "分歧", "退潮"]),
  triggerCondition: z.string().min(1),
  invalidCondition: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

const coreStructureHealthSchema = z.object({
  lineName: z.string().min(1),
  health: z.string().min(1),
  leaderContinuity: z.string().min(1),
  breadthQuality: z.string().min(1),
  risk: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

const intradayWatchlistSchema = z.object({
  code: z.string().regex(/^(sh|sz|bj)\d{6}$/i),
  name: z.string().min(1),
  watchType: z.string().min(1),
  triggerCondition: z.string().min(1),
  invalidCondition: z.string().min(1),
  evidenceRefs: evidenceRefsSchema,
});

export const modelAuditCategoryValues = ["数据缺口", "规则疑点", "报告质量", "功能建议", "不建议改动"] as const;
export const modelAuditPriorityValues = ["高", "中", "低"] as const;

const modelAuditFeedbackItemSchema = z.object({
  category: z.enum(modelAuditCategoryValues),
  title: z.string().min(1),
  issue: z.string().min(1),
  impact: z.string().min(1),
  suggestion: z.string().min(1),
  priority: z.enum(modelAuditPriorityValues),
  evidenceRefs: evidenceRefsSchema,
});

export const modelAuditFeedbackSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  summary: z.string().min(1),
  items: z.array(modelAuditFeedbackItemSchema).min(1).max(12),
  doNotChange: z.array(
    z.object({
      reason: z.string().min(1),
      evidenceRefs: evidenceRefsSchema,
    }),
  ),
  disclaimer: z.string().min(1),
});

export const deepSeekReportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  summary: z.string().min(1),
  marketJudgement: z.object({
    level: z.enum(["可交易", "谨慎交易", "防守观望"]),
    evidenceRefs: evidenceRefsSchema,
    logic: z.string().min(1),
    risk: z.string().min(1),
  }),
  mainLines: z.array(
    z.object({
      name: z.string().min(1),
      stage: z.enum(["观察", "启动", "确认", "加速", "分歧", "退潮"]),
      evidenceRefs: evidenceRefsSchema,
      logic: z.string().min(1),
    }),
  ),
  stockPlans: z.array(
    z.object({
      code: z.string().regex(/^(sh|sz|bj)\d{6}$/i),
      name: z.string().min(1),
      action: z.enum(reportActionValues),
      companySummary: z.string().min(1),
      companySourceNote: z.enum(["数据源事实", "规则计算", "基于主营业务的模型归纳", "mixed"]),
      evidenceRefs: evidenceRefsSchema,
      buyCondition: z.string().min(1),
      sellCondition: z.string().min(1),
      positionSuggestion: z.string().min(1),
      invalidCondition: z.string().min(1),
      doNotBuyCondition: z.string().min(1),
      risk: z.string().min(1),
    }),
  ),
  notifications: z.array(
    z.object({
      level: z.enum(["info", "warning", "risk"]),
      message: z.string().min(1),
      evidenceRefs: evidenceRefsSchema,
    }),
  ),
  marketStructureInsight: marketStructureInsightSchema.optional(),
  marketStateFlipConditions: z.array(marketStateFlipConditionSchema).optional(),
  mainlineCompetition: z.array(mainlineCompetitionSchema).optional(),
  mainlineStageForecasts: z.array(mainlineStageForecastSchema).optional(),
  coreStructureHealth: z.array(coreStructureHealthSchema).optional(),
  intradayWatchlist: z.array(intradayWatchlistSchema).optional(),
  disclaimer: z.string().min(1),
});

const evidenceRefsJsonSchema = { type: "array", minItems: 1, items: { type: "string", minLength: 1 } } as const;
const marketStateJsonEnum = ["可交易", "谨慎交易", "防守观望"] as const;
const mainlineStageJsonEnum = ["观察", "启动", "确认", "加速", "分歧", "退潮"] as const;

export const deepSeekReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "summary", "marketJudgement", "mainLines", "stockPlans", "notifications", "disclaimer"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    summary: { type: "string", minLength: 1 },
    marketJudgement: {
      type: "object",
      additionalProperties: false,
      required: ["level", "evidenceRefs", "logic", "risk"],
      properties: {
        level: { enum: marketStateJsonEnum },
        evidenceRefs: evidenceRefsJsonSchema,
        logic: { type: "string", minLength: 1 },
        risk: { type: "string", minLength: 1 },
      },
    },
    mainLines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "stage", "evidenceRefs", "logic"],
        properties: {
          name: { type: "string", minLength: 1 },
          stage: { enum: mainlineStageJsonEnum },
          evidenceRefs: evidenceRefsJsonSchema,
          logic: { type: "string", minLength: 1 },
        },
      },
    },
    stockPlans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "name",
          "action",
          "companySummary",
          "companySourceNote",
          "evidenceRefs",
          "buyCondition",
          "sellCondition",
          "positionSuggestion",
          "invalidCondition",
          "doNotBuyCondition",
          "risk",
        ],
        properties: {
          code: { type: "string", pattern: "^(sh|sz|bj)\\d{6}$" },
          name: { type: "string", minLength: 1 },
          action: { enum: reportActionValues },
          companySummary: { type: "string", minLength: 1 },
          companySourceNote: { enum: ["数据源事实", "规则计算", "基于主营业务的模型归纳", "mixed"] },
          evidenceRefs: evidenceRefsJsonSchema,
          buyCondition: { type: "string", minLength: 1 },
          sellCondition: { type: "string", minLength: 1 },
          positionSuggestion: { type: "string", minLength: 1 },
          invalidCondition: { type: "string", minLength: 1 },
          doNotBuyCondition: { type: "string", minLength: 1 },
          risk: { type: "string", minLength: 1 },
        },
      },
    },
    notifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "message", "evidenceRefs"],
        properties: {
          level: { enum: ["info", "warning", "risk"] },
          message: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    marketStructureInsight: {
      type: "object",
      additionalProperties: false,
      required: ["breadth", "liquidity", "riskPressure", "evidenceRefs"],
      properties: {
        breadth: { type: "string", minLength: 1 },
        liquidity: { type: "string", minLength: 1 },
        riskPressure: { type: "string", minLength: 1 },
        evidenceRefs: evidenceRefsJsonSchema,
      },
    },
    marketStateFlipConditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetState", "condition", "evidenceRefs"],
        properties: {
          targetState: { enum: marketStateJsonEnum },
          condition: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    mainlineCompetition: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lineName", "rank", "competitionLogic", "evidenceRefs"],
        properties: {
          lineName: { type: "string", minLength: 1 },
          rank: { type: "integer", minimum: 1 },
          competitionLogic: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    mainlineStageForecasts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "currentStage", "nextStage", "triggerCondition", "invalidCondition", "evidenceRefs"],
        properties: {
          name: { type: "string", minLength: 1 },
          currentStage: { enum: mainlineStageJsonEnum },
          nextStage: { enum: mainlineStageJsonEnum },
          triggerCondition: { type: "string", minLength: 1 },
          invalidCondition: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    coreStructureHealth: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lineName", "health", "leaderContinuity", "breadthQuality", "risk", "evidenceRefs"],
        properties: {
          lineName: { type: "string", minLength: 1 },
          health: { type: "string", minLength: 1 },
          leaderContinuity: { type: "string", minLength: 1 },
          breadthQuality: { type: "string", minLength: 1 },
          risk: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    intradayWatchlist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "name", "watchType", "triggerCondition", "invalidCondition", "evidenceRefs"],
        properties: {
          code: { type: "string", pattern: "^(sh|sz|bj)\\d{6}$" },
          name: { type: "string", minLength: 1 },
          watchType: { type: "string", minLength: 1 },
          triggerCondition: { type: "string", minLength: 1 },
          invalidCondition: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    disclaimer: { type: "string", minLength: 1 },
  },
} as const;

export const modelAuditFeedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "summary", "items", "doNotChange", "disclaimer"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    summary: { type: "string", minLength: 1 },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "title", "issue", "impact", "suggestion", "priority", "evidenceRefs"],
        properties: {
          category: { enum: modelAuditCategoryValues },
          title: { type: "string", minLength: 1 },
          issue: { type: "string", minLength: 1 },
          impact: { type: "string", minLength: 1 },
          suggestion: { type: "string", minLength: 1 },
          priority: { enum: modelAuditPriorityValues },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    doNotChange: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reason", "evidenceRefs"],
        properties: {
          reason: { type: "string", minLength: 1 },
          evidenceRefs: evidenceRefsJsonSchema,
        },
      },
    },
    disclaimer: { type: "string", minLength: 1 },
  },
} as const;

export type DeepSeekReportSchema = z.infer<typeof deepSeekReportSchema>;
export type ModelAuditFeedbackSchema = z.infer<typeof modelAuditFeedbackSchema>;
