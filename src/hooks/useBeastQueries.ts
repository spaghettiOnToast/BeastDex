import { useCallback, useMemo } from "react";
import { useApi } from "./useApi";
import {
  fetchBeastStats,
  fetchBeastHighlights,
  fetchBeastAttributeFilters,
  type BeastStats,
  type BeastHighlights,
  type BeastAttributeFilters,
} from "../services/beast";

export function useBeastStats(enabled: boolean = true) {
  return useApi(
    fetchBeastStats,
    [],
    { enabled, immediate: enabled }
  );
}

export function useBeastHighlights(enabled: boolean = true) {
  const { data, loading, error, refetch } = useApi(
    fetchBeastHighlights,
    [],
    { enabled, immediate: enabled }
  );

  const highlightItems = useMemo(() => {
    if (!data) return [];

    const formatOwner = (leader: any) => {
      if (!leader || !leader.owner) return "Unknown";
      if (leader.username) return leader.username;
      const addr = leader.owner;
      return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    };

    const items: { title: string; subtitle?: string }[] = [];

    items.push({
      title: `${data.animatedShinyCount.toLocaleString()} Animated Shinies collected`,
    });
    items.push({
      title: `${data.shinyCount.toLocaleString()} Shiny beasts collected`,
    });
    items.push({
      title: `${data.animatedCount.toLocaleString()} Animated beasts collected`,
    });

    if (data.leaders.overall.value > 0) {
      items.push({
        title: `${formatOwner(data.leaders.overall)} leads the hunt`,
        subtitle: `${data.leaders.overall.value.toLocaleString()} total beasts`,
      });
    }
    if (data.leaders.animatedShiny.value > 0) {
      items.push({
        title: `${formatOwner(
          data.leaders.animatedShiny
        )} loves animated shinies`,
        subtitle: `${data.leaders.animatedShiny.value.toLocaleString()} collected`,
      });
    }
    if (data.leaders.shiny.value > 0) {
      items.push({
        title: `${formatOwner(data.leaders.shiny)} is the shiny master`,
        subtitle: `${data.leaders.shiny.value.toLocaleString()} shinies`,
      });
    }
    if (data.leaders.animated.value > 0) {
      items.push({
        title: `${formatOwner(
          data.leaders.animated
        )} owns the animations`,
        subtitle: `${data.leaders.animated.value.toLocaleString()} animated beasts`,
      });
    }

    return items;
  }, [data]);

  return {
    data,
    loading,
    error,
    refetch,
    highlightItems,
  };
}

export function useBeastAttributeFilters(enabled: boolean = true) {
  return useApi(
    fetchBeastAttributeFilters,
    [],
    { enabled, immediate: enabled }
  );
}