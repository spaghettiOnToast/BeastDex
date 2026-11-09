import { describe, expect, it } from "vitest";
import {
  WALLET_OVERHEAD_L2,
  callsL2Gas,
  estimateFeeFri,
  profileForConnector,
  type WalletProfile,
} from "../src/services/gas/walletFees";

const prices = { l2Fri: 23_632_000_000n, l1DataFri: 71_500_000_000n, block: 1 };

describe("wallet fee model", () => {
  it("matches a real Controller listing receipt (cached session: 9,726,000 L2 gas)", () => {
    expect(callsL2Gas({ list: 1 }) + WALLET_OVERHEAD_L2.controller).toBeCloseTo(9_726_000, -4);
  });

  it("ranks Ready cheapest, then Braavos, then Controller", () => {
    const fee = (w: WalletProfile) => estimateFeeFri({ buy: 1, approveToken: 1 }, w, prices);
    expect(fee("ready")).toBeLessThan(fee("braavos"));
    expect(fee("braavos")).toBeLessThan(fee("controller"));
    expect(fee("controller")).toBeLessThan(fee("controllerFirstSocial"));
    expect(fee("controllerFirstSocial")).toBeLessThan(fee("controllerFirstPasskey"));
  });

  it("prices a Ready listing around 0.16 STRK at ~23.6 gwei-fri L2 gas", () => {
    const strk = Number(estimateFeeFri({ list: 1, approveCollection: 1 }, "ready", prices)) / 1e18;
    expect(strk).toBeGreaterThan(0.12);
    expect(strk).toBeLessThan(0.2);
  });

  it("maps connectors to profiles", () => {
    expect(profileForConnector("argentX", "controller")).toBe("ready");
    expect(profileForConnector("braavos", "controller")).toBe("braavos");
    expect(profileForConnector("controller", "controller")).toBe("controller");
    expect(profileForConnector("keplr", "controller")).toBeNull();
  });
});
