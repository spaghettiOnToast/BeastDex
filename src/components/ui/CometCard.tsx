import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

const MAX_ROTATION = 12;

export type CometCardProps = {
  children: ReactNode;
  className?: string;
};

export function CometCard({ children, className }: CometCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tiltStyle, setTiltStyle] = useState<CSSProperties>({ transform: "rotateX(0deg) rotateY(0deg)" });
  const [cometPosition, setCometPosition] = useState({ x: 50, y: 50 });

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = cardRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    const rotateY = ((x / rect.width) - 0.5) * -2 * MAX_ROTATION;
    const rotateX = ((y / rect.height) - 0.5) * 2 * MAX_ROTATION;

    setCometPosition({ x: xPercent, y: yPercent });
    setTiltStyle({
      transform: `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setTiltStyle({ transform: "rotateX(0deg) rotateY(0deg)" });
    setCometPosition({ x: 50, y: 50 });
  }, []);

  const cometStyle: CSSProperties = {
    left: `${cometPosition.x}%`,
    top: `${cometPosition.y}%`,
  };

  return (
    <div
      ref={cardRef}
      className={`relative transition-transform duration-200 ease-out [perspective:1200px] ${className ?? ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-2xl bg-black/60"
        style={{ transform: "translateZ(0)" }}
      >
        <span
          className="pointer-events-none absolute h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#39ff14]/60 via-transparent to-transparent blur-3xl transition-all duration-200" 
          style={cometStyle}
        />
      </div>
      <div
        className="relative z-10 rounded-2xl border border-gray-800 bg-black/80 shadow-[0_20px_45px_-20px_rgba(57,255,20,0.45)] transition-transform duration-200 ease-out"
        style={tiltStyle}
      >
        {children}
      </div>
    </div>
  );
}

export default CometCard;
