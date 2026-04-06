import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Lightweight renderer for chat messages.
 * Handles: $..$ (inline LaTeX), $$...$$ (display LaTeX),
 * **bold**, `inline code`, ```code blocks```, and newlines.
 */

interface ChatMarkdownProps {
  content: string;
}

type Segment =
  | { type: "text"; value: string }
  | { type: "latex-inline"; value: string }
  | { type: "latex-display"; value: string }
  | { type: "code-block"; lang: string; value: string }
  | { type: "code-inline"; value: string };

function tokenize(input: string): Segment[] {
  const segments: Segment[] = [];
  // Order matters — greedier patterns first
  const pattern =
    /(\$\$[\s\S]+?\$\$)|(```(\w*)\n?([\s\S]*?)```)|(`[^`]+?`)|(\$[^$\n]+?\$)/g;

  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: input.slice(last, match.index) });
    }

    if (match[1]) {
      // $$...$$ display LaTeX
      segments.push({ type: "latex-display", value: match[1].slice(2, -2).trim() });
    } else if (match[2]) {
      // ```...``` code block
      segments.push({ type: "code-block", lang: match[3] || "", value: match[4] || "" });
    } else if (match[5]) {
      // `...` inline code
      segments.push({ type: "code-inline", value: match[5].slice(1, -1) });
    } else if (match[6]) {
      // $...$ inline LaTeX
      segments.push({ type: "latex-inline", value: match[6].slice(1, -1).trim() });
    }

    last = match.index + match[0].length;
  }

  if (last < input.length) {
    segments.push({ type: "text", value: input.slice(last) });
  }

  return segments;
}

function renderTextWithBold(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<strong key={`b${key++}`} className="font-semibold text-white">{match[1]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderLatex(latex: string, displayMode: boolean): React.ReactElement {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
    });
    return (
      <span
        className={displayMode ? "block my-2 overflow-x-auto" : "inline"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <code className="text-red-400 text-xs">
        {displayMode ? `$$${latex}$$` : `$${latex}$`}
      </code>
    );
  }
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const rendered = useMemo(() => {
    const segments = tokenize(content);

    return segments.map((seg, i) => {
      switch (seg.type) {
        case "latex-display":
          return <div key={i}>{renderLatex(seg.value, true)}</div>;

        case "latex-inline":
          return <span key={i}>{renderLatex(seg.value, false)}</span>;

        case "code-block":
          return (
            <pre key={i} className="my-2 rounded bg-black/40 border border-white/5 px-3 py-2 text-xs overflow-x-auto">
              <code>{seg.value}</code>
            </pre>
          );

        case "code-inline":
          return (
            <code key={i} className="rounded bg-white/10 px-1 py-0.5 text-xs font-mono">
              {seg.value}
            </code>
          );

        case "text": {
          // Split by newlines, render bold within each line
          const lines = seg.value.split("\n");
          return (
            <span key={i}>
              {lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {renderTextWithBold(line)}
                </span>
              ))}
            </span>
          );
        }
      }
    });
  }, [content]);

  return <>{rendered}</>;
}
