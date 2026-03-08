import { useCallback, useRef, useState } from "react";

/**
 * 3D Business Card — aspect ratio locked to 3.35 × 2.13 (standard US card).
 * Responds to mouse AND touch position with a perspective tilt.
 */

interface BusinessCardProps {
  headline?: string;
  description?: string;
  paragraph?: string;
}

export function BusinessCard({ headline, description, paragraph }: BusinessCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const applyTilt = useCallback((clientX: number, clientY: number) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;   // 0‑1
    const y = (clientY - rect.top) / rect.height;    // 0‑1
    setTilt({
      x: (y - 0.5) * -30,
      y: (x - 0.5) * 30,
    });
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    applyTilt(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) applyTilt(t.clientX, t.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setHovering(true);
    const t = e.touches[0];
    if (t) applyTilt(t.clientX, t.clientY);
  };

  const resetTilt = () => {
    setHovering(false);
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div
      className="w-full flex flex-col items-center justify-center"
      style={{ perspective: "1200px" }}
    >
      {/* ── Card ──────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={resetTilt}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={resetTilt}
        onTouchCancel={resetTilt}
        className="relative transition-transform duration-300 ease-out cursor-default"
        style={{
          width: "min(90vw, 640px)",
          aspectRatio: "3.35 / 2.13",
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          /* Lift card above pedestal */
          marginBottom: "-12px",
          zIndex: 2,
        }}
      >
        {/* ── Card face ─────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-md border border-white/15 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(12,12,20,0.95) 0%, rgba(8,8,16,0.98) 100%)",
            boxShadow: hovering
              ? "0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,255,255,0.06)"
              : "0 15px 40px rgba(0,0,0,0.5)",
            backfaceVisibility: "hidden",
          }}
        >
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Accent edge line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-8 md:p-10">
            {/* Top — name / headline */}
            <div>
              <h2
                className="font-display font-bold text-white tracking-tight leading-none"
                style={{ fontSize: "clamp(1.25rem, 3vw, 2rem)" }}
              >
                {headline || "LOREM IPSUM"}
              </h2>
              <div className="mt-2 h-px w-16 bg-primary/40" />
            </div>

            {/* Middle — description */}
            <div className="flex-1 flex items-center">
              <p
                className="text-gray-300 leading-relaxed max-w-[90%]"
                style={{ fontSize: "clamp(0.65rem, 1.4vw, 0.95rem)" }}
              >
                {description}
              </p>
            </div>

            {/* Bottom — paragraph / tagline */}
            <div>
              <p
                className="text-gray-500 font-mono"
                style={{ fontSize: "clamp(0.55rem, 1vw, 0.75rem)" }}
              >
                {paragraph}
              </p>
            </div>
          </div>

          {/* Corner accents */}
          <span className="absolute top-2 left-2 w-3 h-3 border-t border-l border-primary/25" />
          <span className="absolute top-2 right-2 w-3 h-3 border-t border-r border-primary/25" />
          <span className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-primary/25" />
          <span className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-primary/25" />
        </div>

        {/* ── Reflection / edge glow ──────────────────────────── */}
        <div
          className="absolute inset-0 rounded-md pointer-events-none transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${50 + tilt.y}% ${50 - tilt.x}%, rgba(0,255,255,0.08) 0%, transparent 60%)`,
            opacity: hovering ? 1 : 0,
          }}
        />
      </div>

      {/* ── Pedestal ──────────────────────────────────────────── */}
      <div
        className="relative pointer-events-none"
        style={{
          width: "min(90vw, 640px)",
          perspective: "1200px",
          zIndex: 1,
        }}
      >
        {/* 3D pedestal box — rotated 45° */}
        <div
          className="mx-auto transition-transform duration-300 ease-out"
          style={{
            width: "70%",
            height: "28px",
            transformStyle: "preserve-3d",
            transform: "perspective(800px) rotateX(60deg) rotateY(45deg) translateY(-4px)",
            transformOrigin: "center center",
          }}
        >
          {/* Top surface */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,255,0.07) 0%, rgba(0,255,255,0.02) 100%)",
              border: "1px solid rgba(0,255,255,0.12)",
              backfaceVisibility: "hidden",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(0,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />
          </div>

          {/* Front face — visible below the top surface */}
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: 0,
              height: "24px",
              transformOrigin: "bottom center",
              transform: "rotateX(-90deg)",
              background: "linear-gradient(180deg, rgba(8,8,16,0.95) 0%, rgba(4,4,10,0.98) 100%)",
              borderLeft: "1px solid rgba(0,255,255,0.10)",
              borderRight: "1px solid rgba(0,255,255,0.10)",
              borderBottom: "1px solid rgba(0,255,255,0.08)",
              backfaceVisibility: "hidden",
            }}
          >
            <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          </div>

          {/* Right face — visible due to 45° rotation */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              right: 0,
              width: "24px",
              transformOrigin: "right center",
              transform: "rotateY(90deg)",
              background: "linear-gradient(180deg, rgba(6,6,14,0.95) 0%, rgba(3,3,8,0.98) 100%)",
              borderTop: "1px solid rgba(0,255,255,0.08)",
              borderBottom: "1px solid rgba(0,255,255,0.06)",
              borderRight: "1px solid rgba(0,255,255,0.10)",
              backfaceVisibility: "hidden",
            }}
          />
        </div>

        {/* Ground shadow */}
        <div
          className="mx-auto transition-all duration-300 ease-out"
          style={{
            width: hovering ? "80%" : "65%",
            height: "20px",
            marginTop: "8px",
            background: "radial-gradient(ellipse at center, rgba(0,255,255,0.06) 0%, transparent 70%)",
            filter: hovering ? "blur(16px)" : "blur(10px)",
            opacity: hovering ? 0.8 : 0.5,
            transform: `translateX(${tilt.y * 0.5}px)`,
          }}
        />
      </div>
    </div>
  );
}
