import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// fetchBeasts resolves per owner; "slow" owners wait until released.
const pending = new Map<string, () => void>();
vi.mock("../src/services/beast", () => ({
  fetchBeasts: vi.fn(async ({ ownerAddresses }: { ownerAddresses: string[] }) => {
    const owner = ownerAddresses[0];
    if (owner.startsWith("slow")) await new Promise<void>((r) => pending.set(owner, r));
    return { beasts: [{ id: `${owner}-beast` }], total: 1 };
  }),
}));

import { useUserBeasts } from "../src/hooks/useUserBeasts";

describe("useUserBeasts on wallet switch", () => {
  beforeEach(() => pending.clear());

  it("clears the previous wallet's beasts and loaded flag when the address changes", async () => {
    const { result, rerender } = renderHook(({ address }) => useUserBeasts(address, { autoLoad: false }), {
      initialProps: { address: "spag" as string | undefined },
    });
    await act(() => result.current.reload());
    expect(result.current.beasts.map((b) => b.id)).toEqual(["spag-beast"]);
    expect(result.current.hasLoaded).toBe(true);

    rerender({ address: "ready" });
    expect(result.current.beasts).toEqual([]);
    expect(result.current.hasLoaded).toBe(false);
  });

  it("drops a load that was still running for the previous wallet", async () => {
    const { result, rerender } = renderHook(({ address }) => useUserBeasts(address), {
      initialProps: { address: "slow-spag" as string | undefined },
    });
    await waitFor(() => expect(pending.has("slow-spag")).toBe(true));
    rerender({ address: "ready" });
    await waitFor(() => expect(result.current.beasts.map((b) => b.id)).toEqual(["ready-beast"]));
    await act(async () => pending.get("slow-spag")!());
    expect(result.current.beasts.map((b) => b.id)).toEqual(["ready-beast"]);
  });
});
