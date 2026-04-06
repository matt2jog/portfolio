import { Children, isValidElement, useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

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

function sanitizeMermaidChart(chart: string): string {
  return chart
    .trim()
    .replace(/^\s*```mermaid\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*%\{[\s\S]*?\}%\s*\n?/gm, "")
    .replace(/<br\s*\/?>/gi, "<br/>")
    .replace(/\\n/g, "<br/>")
    .replace(/<\/?(strong|b|em|i|code|span|div|p)[^>]*>/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/&nbsp;/gi, " ");
}

function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const preparedChart = useMemo(() => sanitizeMermaidChart(chart), [chart]);

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
    <div className="my-3 overflow-x-auto rounded border border-white/10 bg-black/30 p-3">
      <div
        className="[&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const sanitized = content.replace(/<br\s*\/?>/gi, "\n");
  return (
    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          br: () => null,
          p: ({ children }) => (
            <p className="mb-2 break-words leading-relaxed last:mb-0 [overflow-wrap:anywhere]">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-all text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
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
              <code className="break-all rounded bg-white/10 px-1 text-xs font-mono text-primary/90">
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
            <ul className="my-1.5 ml-4 list-disc space-y-0.5 break-words text-gray-300 [overflow-wrap:anywhere]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-0.5 break-words text-gray-300 [overflow-wrap:anywhere]">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="break-words leading-relaxed [overflow-wrap:anywhere]">{children}</li>
          ),
          h1: ({ children }) => (
            <h1 className="mb-1 mt-3 break-words text-base font-bold text-white first:mt-0 [overflow-wrap:anywhere]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-3 break-words text-sm font-bold text-white first:mt-0 [overflow-wrap:anywhere]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 break-words text-sm font-semibold text-gray-200 first:mt-0 [overflow-wrap:anywhere]">{children}</h3>
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
            <td className="break-words px-2 py-1 [overflow-wrap:anywhere]">{children}</td>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}
