import { useEffect, useState, useMemo } from "react";
import { Loader, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

interface TOCItem {
  id: string;
  title: string;
  level: number;
}

interface LegalDocLayoutProps {
  fetchPath: string;
  title: string;
}

function withHeadingIds(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const headings = doc.querySelectorAll("h1, h2, h3");

  headings.forEach((heading, index) => {
    heading.id = `section-${index}`;
  });

  return doc.body.innerHTML;
}

export default function LegalDocLayout({ fetchPath, title }: LegalDocLayoutProps) {
  const [, setLocation] = useLocation();
  const [html, setHtml] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("");

  // Extract headings from HTML for TOC
  const toc: TOCItem[] = useMemo(() => {
    if (!html) return [];

    const items: TOCItem[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    // IDs are already embedded in html, so TOC and scroll targets stay aligned.
    const headings = doc.querySelectorAll("h2, h3");
    headings.forEach((heading) => {
      const level = parseInt(heading.tagName[1]);
      const id = heading.id;
      if (!id) return;

      items.push({
        id,
        title: heading.textContent || "",
        level,
      });
    });

    return items;
  }, [html]);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(fetchPath);
        if (!res.ok) {
          throw new Error(`Failed to load ${fetchPath}: ${res.status}`);
        }

        const data = (await res.json()) as {
          html: string;
          lastUpdated: string | null;
          effectiveDate: string | null;
        };
        setHtml(withHeadingIds(data.html));
        setLastUpdated(data.lastUpdated);
        setEffectiveDate(data.effectiveDate);
      } catch {
        if (import.meta.env.DEV) {
          console.error("Legal document load failed");
        }
        setHtml(`<p>Failed to load ${title}</p>`);
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [fetchPath, title]);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const headings = document.querySelectorAll("#legal-doc-content h2, #legal-doc-content h3");
      let currentActive = "";

      Array.from(headings).forEach((heading) => {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 160) {
          currentActive = heading.id;
        }
      });

      setActiveSection(currentActive);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [html]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="animate-spin" />
      </div>
    );
  }

  return (
    <section className="w-full bg-slate-100/70 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-start lg:gap-10 lg:px-8">
        <main className="min-w-0 flex-1">
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.history.length > 2) {
                  window.history.back();
                } else {
                  setLocation("/");
                }
              }}
              className="text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          <header className="mb-4 rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">This document is provided for legal notice and policy transparency.</p>
            {(lastUpdated || effectiveDate) && (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                {lastUpdated && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-700">Last Updated:</dt>
                    <dd>{lastUpdated}</dd>
                  </div>
                )}
                {effectiveDate && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-700">Effective Date:</dt>
                    <dd>{effectiveDate}</dd>
                  </div>
                )}
              </dl>
            )}
          </header>

          <article className="rounded-lg border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-8">
            <div
              id="legal-doc-content"
              className="text-slate-800 [&_a]:text-blue-700 [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:scroll-mt-28 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:scroll-mt-28 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:scroll-mt-28 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:ml-6 [&_li]:list-disc [&_li]:py-1 [&_p]:my-4 [&_p]:leading-7 [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>
        </main>

        <aside className="w-full lg:sticky lg:top-24 lg:w-80 lg:shrink-0">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">On This Page</h2>
            <nav className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
              {toc.length === 0 && <p className="text-sm text-slate-500">No sections found.</p>}
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`block w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                    item.level === 3 ? "pl-6 text-slate-600" : "font-medium text-slate-700"
                  } ${activeSection === item.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                >
                  {item.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </section>
  );
}
