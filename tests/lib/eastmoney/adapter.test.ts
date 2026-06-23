import { afterEach, describe, expect, it, vi } from "vitest";
import { EastmoneyAdapter } from "../../../src/lib/eastmoney/adapter";

describe("EastmoneyAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes all-A quotes for candidate fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          total: 1,
          diff: [{
            f2: 12.34,
            f3: 5.67,
            f6: 100000000,
            f8: 8.9,
            f12: "600584",
            f13: 1,
            f14: "长电科技",
            f21: 20000000000,
            f62: 12345678
          }]
        }
      })
    } as Response);

    const result = await new EastmoneyAdapter().getAllAQuotes(20);

    expect(result.warnings).toEqual([]);
    expect(result.data?.[0]).toMatchObject({
      code: "600584",
      marketCode: "sh600584",
      name: "长电科技",
      latest: 12.34,
      changePct: 5.67,
      amount: 100000000,
      turnoverRate: 8.9,
      floatMarketValue: 20000000000,
      mainNetInflow: 12345678
    });
  });

  it("parses stock kline and fund-flow records", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            klines: ["2026-06-05,10.1,10.5,10.8,9.9,12345,67890000,8.8,3.2,0.33,6.6"]
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            klines: ["2026-06-05,1000,200,300,400,500,1.5,0.3,0.4,0.5,0.6,10.5,3.2"]
          }
        })
      } as Response);

    const adapter = new EastmoneyAdapter();
    const kline = await adapter.getStockKlines("sh600584", 1);
    const fundFlow = await adapter.getStockFundFlow("sh600584", 1);

    expect(kline.data?.[0]).toMatchObject({
      date: "2026-06-05",
      open: 10.1,
      close: 10.5,
      high: 10.8,
      low: 9.9,
      amount: 67890000,
      changePct: 3.2
    });
    expect(fundFlow.data?.[0]).toMatchObject({
      date: "2026-06-05",
      mainNetFlow: 1000,
      smallNetFlow: 200,
      mediumNetFlow: 300,
      largeNetFlow: 400,
      superLargeNetFlow: 500,
      mainNetFlowPct: 1.5,
      close: 10.5,
      changePct: 3.2
    });
  });

  it("normalizes Eastmoney F10 company profile", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jbzl: [{
            SECURITY_CODE: "600584",
            SECURITY_NAME_ABBR: "长电科技",
            EM2016: "电子设备-半导体-集成电路",
            ORG_PROFILE: "公司提供芯片成品制造服务。"
          }]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          zyfw: [{ BUSINESS_SCOPE: "生产销售半导体、电子元件。" }],
          zygcfx: [
            { MAINOP_TYPE: "1", ITEM_NAME: "电子元器件", MBI_RATIO: 0.99 },
            { MAINOP_TYPE: "1", ITEM_NAME: "其他", MBI_RATIO: 0.01 }
          ]
        })
      } as Response);

    const result = await new EastmoneyAdapter().getCompanyProfile("sh600584");

    expect(result.data).toMatchObject({
      code: "sh600584",
      name: "长电科技",
      industry: "电子设备-半导体-集成电路",
      business: "电子元器件、其他",
      businessScope: "生产销售半导体、电子元件。"
    });
  });

  it("uses cautious aliases for unavailable sector names", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            total: 1,
            diff: [{ f12: "BK1145", f14: "机器人执行器" }]
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            total: 1,
            diff: [{
              f2: 10,
              f3: 3,
              f12: "688017",
              f13: 1,
              f14: "绿的谐波",
              f21: 1000000000
            }]
          }
        })
      } as Response);

    const result = await new EastmoneyAdapter().getSectorConstituents("空心杯电机", "concept");

    expect(result.warnings[0]).toContain("近似成分来源");
    expect(result.data?.boardCode).toBe("BK1145");
    expect(result.data?.stocks[0]).toMatchObject({
      marketCode: "sh688017",
      name: "绿的谐波",
      changePct: 3
    });
  });

  it("maps scarce gallium-germanium themes to resource boards before semiconductor aliases", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            total: 4,
            diff: [
              { f12: "BK0916", f14: "氮化镓" },
              { f12: "BK0952", f14: "第三代半导体" },
              { f12: "BK0695", f14: "小金属概念" },
              { f12: "BK0519", f14: "稀缺资源" }
            ]
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            total: 1,
            diff: [{
              f2: 10,
              f3: 4,
              f12: "000060",
              f13: 0,
              f14: "中金岭南",
              f21: 1000000000
            }]
          }
        })
      } as Response);

    const result = await new EastmoneyAdapter().getSectorConstituents("锗镓概念", "concept");

    expect(result.warnings[0]).toContain("近似成分来源");
    expect(result.data?.boardCode).toBe("BK0695");
    expect(result.data?.resolvedBoardName).toBe("小金属概念");
  });

  it("does not warn when down-limit or open-board pools are empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { pool: [] } })
    } as Response);

    const adapter = new EastmoneyAdapter();
    const downLimit = await adapter.getLimitPool("dt", "20260610");
    const openBoard = await adapter.getLimitPool("zb", "20260610");

    expect(downLimit.warnings).toEqual([]);
    expect(openBoard.warnings).toEqual([]);
    expect(downLimit.data?.stocks).toEqual([]);
    expect(openBoard.data?.stocks).toEqual([]);
  });
});
