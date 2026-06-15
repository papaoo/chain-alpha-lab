import { describe, expect, it } from "vitest";
import { normalizeSectorName, sameSectorName } from "@/lib/sector/normalization";

describe("sector normalization", () => {
  it("merges strict aliases used by mainline memory", () => {
    expect(normalizeSectorName("被动元件概念")).toBe("元件");
    expect(normalizeSectorName("电子元器件")).toBe("元件");
    expect(sameSectorName("被动元件概念", "元件")).toBe(true);
  });

  it("covers common A-share theme aliases without changing display names randomly", () => {
    expect(normalizeSectorName("空心杯电机")).toBe("机器人执行器");
    expect(normalizeSectorName("机器人执行器概念")).toBe("机器人执行器");
    expect(normalizeSectorName("光刻机")).toBe("半导体设备");
    expect(normalizeSectorName("湿电子化学品")).toBe("半导体材料");
  });

  it("does not over-merge adjacent industry-chain sectors", () => {
    expect(normalizeSectorName("半导体设备")).toBe("半导体设备");
    expect(normalizeSectorName("半导体材料")).toBe("半导体材料");
    expect(sameSectorName("半导体设备", "半导体材料")).toBe(false);
    expect(sameSectorName("通信设备", "CPO")).toBe(false);
    expect(sameSectorName("新能源汽车", "汽车零部件")).toBe(false);
  });

  it("keeps AI names intact while stripping only suffix industry levels", () => {
    expect(normalizeSectorName("物理AI")).toBe("人形机器人");
    expect(normalizeSectorName("AI智能体")).toBe("AI智能体");
    expect(normalizeSectorName("电视广播Ⅱ")).toBe("电视广播");
    expect(normalizeSectorName("半导体II")).toBe("半导体");
  });

  it("maps narrow industry-chain themes to cautious canonical sectors", () => {
    expect(normalizeSectorName("大硅片")).toBe("半导体材料");
    expect(normalizeSectorName("电子树脂")).toBe("半导体材料");
  });
});
