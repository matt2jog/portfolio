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

/**
 * Load and convert markdown file to HTML
 */
export function loadMarkdownAsHtml(filename: string): string | null {
  try {
    // Resolve from the process working directory so this works for both dev and CJS production builds.
    const projectRoot = process.cwd();
    const filePath = path.join(projectRoot, "legal", filename);
    
    const markdown = fs.readFileSync(filePath, "utf-8");
    const html = markdownToHtml(markdown);
    return html;
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err);
    return null;
  }
}
