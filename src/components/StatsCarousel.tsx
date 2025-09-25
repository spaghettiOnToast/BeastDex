import { useEffect, useMemo, useState } from "react";

type Item = {
  title: string;
  subtitle?: string;
};

type Props = {
  items: Item[];
  loading?: boolean;
  className?: string;
};

export default function StatsCarousel({
  items,
  loading = false,
  className = "",
}: Props) {
  const data = useMemo(() => (items && items.length > 0 ? items : []), [items]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (loading || data.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % data.length);
        setVisible(true);
      }, 200);
    }, 4500);

    return () => clearInterval(timer);
  }, [data.length, loading]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="h-2 w-2 animate-ping rounded-full bg-lsGreen" />
        <span>Loading highlights…</span>
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  const current = data[index];

  return (
    <div
      className={`flex items-center gap-4 text-xs md:text-sm text-gray-300 w-full px-4 py-3 rounded-xl border border-gray-800/60 bg-gradient-to-r from-pink-400/40 via-cyan-400/40 to-lime-400/40
 backdrop-blur-sm ${className}`.trim()}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-[#39ff14] shadow-[0_0_6px_#39ff14] animate-pulse" />
      <div className="relative flex-1 overflow-hidden">
        <div
          key={`${current.title}-${current.subtitle ?? ""}`}
          className={`transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="font-semibold text-lsGold truncate text-sm md:text-base">
            {current.title}
          </p>
          {current.subtitle ? (
            <p className="text-[11px] text-gray-400 truncate">
              {current.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {data.length > 1 ? (
        <span className="text-[9px] uppercase tracking-[0.3em] text-gray-500">
          {index + 1}/{data.length}
        </span>
      ) : null}
    </div>
  );
}
