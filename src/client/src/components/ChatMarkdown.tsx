import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { sanitizeMermaidChart } from "@shared/mermaid";

interface ChatMarkdownProps {
  content: string;
}

type MermaidModule = typeof import("mermaid");
let mermaidModulePromise: Promise<MermaidModule> | null = null;
let mermaidInitialized = false;

async function getMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid");
  }
  const module = await mermaidModulePromise;
  const mermaid = module.default;

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: {
        background: "#0a0b0f",
        primaryColor: "#0f1720",
        primaryTextColor: "#e5e7eb",
        primaryBorderColor: "#2dd4bf",
        lineColor: "#64748b",
        secondaryColor: "#111827",
        secondaryTextColor: "#d1d5db",
        tertiaryColor: "#0f1720",
        tertiaryTextColor: "#cbd5e1",
        mainBkg: "#0f1720",
        textColor: "#e5e7eb",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      },
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
        curve: "basis",
      },
      sequence: {
        useMaxWidth: true,
        wrap: true,
      },
    });
    mermaidInitialized = true;
  }

  return mermaid;
}

function getNodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (isValidElement<{ children?: unknown }>(node)) return getNodeText(node.props.children);
  return "";
}

interface Point {
  x: number;
  y: number;
}

interface TransformState {
  scale: number;
  x: number;
  y: number;
}

const MIN_MERMAID_ZOOM = 0.5;
const MAX_MERMAID_ZOOM = 4;
const PAN_OVERSCROLL_FACTOR = 1.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMidpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getCenteredTransform(
  viewport: HTMLDivElement,
  content: HTMLDivElement,
  scale: number,
): TransformState {
  const scaledWidth = content.offsetWidth * scale;
  const scaledHeight = content.offsetHeight * scale;

  return {
    scale,
    x: (viewport.clientWidth - scaledWidth) / 2,
    y: (viewport.clientHeight - scaledHeight) / 2,
  };
}

function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState<TransformState>({ scale: 1, x: 0, y: 0 });
  const preparedChart = useMemo(() => sanitizeMermaidChart(chart), [chart]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<TransformState>({ scale: 1, x: 0, y: 0 });
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const dragPointerIdRef = useRef<number | null>(null);
  const dragLastPointRef = useRef<Point | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    scale: number;
    x: number;
    y: number;
    midpoint: Point;
  } | null>(null);

  const applyTransform = (next: TransformState) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) {
      transformRef.current = next;
      setTransform(next);
      return next;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const contentWidth = content.offsetWidth;
    const contentHeight = content.offsetHeight;
    const scaledWidth = contentWidth * next.scale;
    const scaledHeight = contentHeight * next.scale;
    const slackX = Math.max(viewportWidth, scaledWidth) * PAN_OVERSCROLL_FACTOR;
    const slackY = Math.max(viewportHeight, scaledHeight) * PAN_OVERSCROLL_FACTOR;

    const x = clamp(next.x, viewportWidth - scaledWidth - slackX, slackX);
    const y = clamp(next.y, viewportHeight - scaledHeight - slackY, slackY);

    const clamped = { scale: next.scale, x, y };
    transformRef.current = clamped;
    setTransform(clamped);
    return clamped;
  };

  const zoomAroundPoint = useCallback((nextScale: number, point: Point) => {
    const current = transformRef.current;
    const ratio = nextScale / current.scale;
    applyTransform({
      scale: nextScale,
      x: point.x - (point.x - current.x) * ratio,
      y: point.y - (point.y - current.y) * ratio,
    });
  }, []);

  const clearDragState = () => {
    dragPointerIdRef.current = null;
    dragLastPointRef.current = null;
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        const mermaid = await getMermaidModule();
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${id}`, preparedChart);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg("");
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    }

    void renderChart();
    return () => {
      cancelled = true;
    };
  }, [id, preparedChart]);

  useEffect(() => {
    if (!svg) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    applyTransform(getCenteredTransform(viewport, content, 1));
  }, [svg]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const nextScale = clamp(
        transformRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1),
        MIN_MERMAID_ZOOM,
        MAX_MERMAID_ZOOM,
      );
      const rect = viewport.getBoundingClientRect();
      zoomAroundPoint(nextScale, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [zoomAroundPoint, svg]);

  useEffect(() => {
    return () => {
      clearDragState();
    };
  }, []);

  if (error) {
    return (
      <div className="my-2 rounded border border-amber-500/20 bg-amber-500/10 p-3">
        <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-amber-300">
          Mermaid Render Failed
        </p>
        <p className="mb-2 break-words text-xs text-amber-100/90">
          {error}
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-200">
          {preparedChart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 rounded border border-white/10 bg-black/30 p-3 text-xs text-gray-400">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div className="my-3 rounded border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
          Drag To Pan, Pinch Or Wheel To Zoom
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              const content = contentRef.current;
              if (!viewport || !content) return;
              const nextScale = clamp(transformRef.current.scale / 1.2, MIN_MERMAID_ZOOM, MAX_MERMAID_ZOOM);
              zoomAroundPoint(nextScale, {
                x: viewport.clientWidth / 2,
                y: viewport.clientHeight / 2,
              });
            }}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-primary/40 hover:text-white"
            aria-label="Zoom out diagram"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const nextScale = clamp(transformRef.current.scale * 1.2, MIN_MERMAID_ZOOM, MAX_MERMAID_ZOOM);
              zoomAroundPoint(nextScale, {
                x: viewport.clientWidth / 2,
                y: viewport.clientHeight / 2,
              });
            }}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-primary/40 hover:text-white"
            aria-label="Zoom in diagram"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              const content = contentRef.current;
              if (!viewport || !content) return;
              applyTransform(getCenteredTransform(viewport, content, 1));
            }}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-primary/40 hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        data-testid="mermaid-viewport"
        className="relative h-[clamp(240px,38vh,420px)] overflow-hidden rounded border border-white/5 bg-black/20 select-none touch-none md:h-[clamp(280px,42vh,520px)]"
        onPointerDown={(event) => {
          event.preventDefault();
          const viewport = viewportRef.current;
          if (!viewport) return;

          viewport.setPointerCapture(event.pointerId);
          const rect = viewport.getBoundingClientRect();
          const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          pointersRef.current.set(event.pointerId, point);

          if (pointersRef.current.size === 1) {
            dragPointerIdRef.current = event.pointerId;
            dragLastPointRef.current = point;
            if (typeof document !== "undefined") {
              document.body.style.userSelect = "none";
              document.body.style.cursor = "grabbing";
            }
          }

          if (pointersRef.current.size === 2) {
            const [a, b] = Array.from(pointersRef.current.values());
            pinchStartRef.current = {
              distance: getDistance(a, b),
              scale: transformRef.current.scale,
              x: transformRef.current.x,
              y: transformRef.current.y,
              midpoint: getMidpoint(a, b),
            };
            dragPointerIdRef.current = null;
            dragLastPointRef.current = null;
          }
        }}
        onPointerMove={(event) => {
          const viewport = viewportRef.current;
          if (!viewport) return;

          if (!pointersRef.current.has(event.pointerId)) return;

          const rect = viewport.getBoundingClientRect();
          const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          pointersRef.current.set(event.pointerId, point);

          if (pointersRef.current.size >= 2) {
            const [a, b] = Array.from(pointersRef.current.values());
            const pinchStart = pinchStartRef.current;
            if (!pinchStart) return;

            const distance = getDistance(a, b);
            const midpoint = getMidpoint(a, b);
            const nextScale = clamp(
              pinchStart.scale * (distance / Math.max(pinchStart.distance, 1)),
              MIN_MERMAID_ZOOM,
              MAX_MERMAID_ZOOM,
            );
            const ratio = nextScale / pinchStart.scale;

            applyTransform({
              scale: nextScale,
              x: midpoint.x - (pinchStart.midpoint.x - pinchStart.x) * ratio,
              y: midpoint.y - (pinchStart.midpoint.y - pinchStart.y) * ratio,
            });
            return;
          }

          if (dragPointerIdRef.current !== event.pointerId || !dragLastPointRef.current) return;

          event.preventDefault();
          const deltaX = point.x - dragLastPointRef.current.x;
          const deltaY = point.y - dragLastPointRef.current.y;
          dragLastPointRef.current = point;

          applyTransform({
            scale: transformRef.current.scale,
            x: transformRef.current.x + deltaX,
            y: transformRef.current.y + deltaY,
          });
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          const viewport = viewportRef.current;
          if (viewport?.hasPointerCapture(event.pointerId)) {
            viewport.releasePointerCapture(event.pointerId);
          }

          pointersRef.current.delete(event.pointerId);

          if (dragPointerIdRef.current === event.pointerId) {
            clearDragState();
          }

          if (pointersRef.current.size < 2) {
            pinchStartRef.current = null;
          }

          if (pointersRef.current.size === 1) {
            const [remainingId, remainingPoint] = Array.from(pointersRef.current.entries())[0];
            dragPointerIdRef.current = remainingId;
            dragLastPointRef.current = remainingPoint;
            if (typeof document !== "undefined") {
              document.body.style.userSelect = "none";
              document.body.style.cursor = "grabbing";
            }
          }
        }}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId);
          if (dragPointerIdRef.current === event.pointerId) {
            clearDragState();
          }
          if (pointersRef.current.size < 2) {
            pinchStartRef.current = null;
          }
        }}
      >
        <div
          ref={contentRef}
          className="origin-top-left will-change-transform [&_svg]:h-auto [&_svg]:max-w-none"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="mt-2 text-[11px] text-gray-500">
        Zoom {Math.round(transform.scale * 100)}%
      </div>
    </div>
  );
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const sanitized = content.replace(/<br\s*\/?>/gi, "\n");
  return (
    <div className="min-w-0 break-normal">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          br: () => null,
          p: ({ children }) => (
            <p className="mb-2 break-normal leading-relaxed last:mb-0">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-normal text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-300">{children}</em>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = !!className;
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="break-normal rounded bg-white/10 px-1 text-xs font-mono text-primary/90">
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            const firstChild = Children.toArray(children)[0];
            if (
              isValidElement<{ className?: string; children?: unknown }>(firstChild) &&
              typeof firstChild.props.className === "string" &&
              firstChild.props.className.includes("language-mermaid")
            ) {
              return <MermaidDiagram chart={getNodeText(firstChild.props.children).trim()} />;
            }
            return (
              <pre className="my-2 overflow-x-auto rounded border border-white/5 bg-black/40 p-3 text-xs">
                {children}
              </pre>
            );
          },
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 list-disc space-y-0.5 break-normal text-gray-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-0.5 break-normal text-gray-300">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="break-normal leading-relaxed">{children}</li>
          ),
          h1: ({ children }) => (
            <h1 className="mb-1 mt-3 break-normal text-base font-bold text-white first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-3 break-normal text-sm font-bold text-white first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 break-normal text-sm font-semibold text-gray-200 first:mt-0">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/50 pl-3 italic text-gray-400">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-white/10 text-white">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="text-gray-300">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-white/5">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="break-normal px-2 py-1">{children}</td>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}
