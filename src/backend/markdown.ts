import fs from "fs";
import path from "path";

/**
 * Simple markdown to HTML converter (basic)
 * Handles headings, paragraphs, lists, links, bold, italic
 * Returns only content HTML (no wrapper) for client-side rendering
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML special chars first
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings
  html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  // Paragraphs and line breaks
  html = html
    .split("\n\n")
    .map((para) => {
      if (para.match(/^<h[1-3]/)) return para;
      if (para.match(/^-/)) return para; // Lists
      return `<p>${para}</p>`;
    })
    .join("\n");

  // Unordered lists
  html = html.replace(/^\s*- (.*?)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/, "<ul>$1</ul>");

  // Return only content (no wrapper) - client applies Tailwind styling
  return html;
}

export interface LegalDoc {
  html: string;
  lastUpdated: string | null;
  effectiveDate: string | null;
}

const LAST_UPDATED_RE = /^\*\*Last Updated:\*\*\s+(.+?)\s*$/m;
const EFFECTIVE_DATE_RE = /^\*\*Effective Date:\*\*\s+(.+?)\s*$/m;

/**
 * Parse and strip the **Last Updated** / **Effective Date** lines from the
 * top of a legal markdown document, returning the rendered HTML plus the two
 * date strings as written. Legal Markdown is the binding checked-in source;
 * the GitHub Actions audit records each immutable main-branch version without
 * rewriting it. The server surfaces these values in the page header.
 */
export function loadLegalDoc(filename: string): LegalDoc | null {
  try {
    const projectRoot = process.cwd();
    const filePath = path.join(projectRoot, "legal", filename);
    const markdown = fs.readFileSync(filePath, "utf-8");

    const lastUpdated = markdown.match(LAST_UPDATED_RE)?.[1]?.trim() ?? null;
    const effectiveDate = markdown.match(EFFECTIVE_DATE_RE)?.[1]?.trim() ?? null;

    const body = markdown
      .replace(LAST_UPDATED_RE, "")
      .replace(EFFECTIVE_DATE_RE, "")
      .replace(/\n{3,}/g, "\n\n");

    return {
      html: markdownToHtml(body),
      lastUpdated,
      effectiveDate,
    };
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err);
    return null;
  }
}

/**
 * @deprecated Use loadLegalDoc — kept temporarily for any callers that still
 * expect just the HTML string.
 */
export function loadMarkdownAsHtml(filename: string): string | null {
  return loadLegalDoc(filename)?.html ?? null;
}
