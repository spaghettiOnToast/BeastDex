import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { SoldListingsProvider, useSoldListings } from "../src/contexts/SoldListingsContext";

const wrapper = ({ children }: { children: ReactNode }) => <SoldListingsProvider>{children}</SoldListingsProvider>;

describe("SoldListingsContext optimistic marks", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("hides a marked listing, then shows it again if the indexer still lists it after 10 min", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { result } = renderHook(() => useSoldListings(), { wrapper });

    act(() => result.current.markAsSold("14075"));
    expect(result.current.isSold("14075")).toBe(true);
    // number ids (from SQL rows) match their string form
    expect(result.current.isSold(14075 as unknown as string)).toBe(true);

    act(() => result.current.clearStaleIds(["14075"])); // indexer not caught up yet
    expect(result.current.isSold("14075")).toBe(true);

    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(result.current.isSold("14075")).toBe(false);
    act(() => result.current.clearStaleIds(["14075"]));
    expect(result.current.soldListingIds.has("14075")).toBe(false);
  });

  it("drops marks once the listing leaves the indexer's results", () => {
    const { result } = renderHook(() => useSoldListings(), { wrapper });
    act(() => result.current.markAsSold("1"));
    act(() => result.current.clearStaleIds(["2"]));
    expect(result.current.isSold("1")).toBe(false);
  });

  it("discards the old persisted format (no per-listing age)", () => {
    localStorage.setItem("beastdex:sold-listings", JSON.stringify({ ids: [14075], timestamp: Date.now() }));
    const { result } = renderHook(() => useSoldListings(), { wrapper });
    expect(result.current.isSold("14075")).toBe(false);
  });
});
