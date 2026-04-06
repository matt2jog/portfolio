import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface ChatMarkdownProps {
  content: string;
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
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded border border-white/5 bg-black/40 p-3 text-xs">
              {children}
            </pre>
          ),
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
