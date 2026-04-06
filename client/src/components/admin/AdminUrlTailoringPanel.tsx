import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import katex from "katex";
import "katex/dist/katex.min.css";

type UrlTailoringRecord = {
  id: string;
  tag: string;
  param: string;
  startPage: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const PAGE_OPTIONS = [
  { label: "Home", value: "/" },
  { label: "Portfolio", value: "/portfolio" },
  { label: "About", value: "/about" },
  { label: "Activity", value: "/activity" },
  { label: "Tree", value: "/tree" },
];

function buildFullUrl(record: UrlTailoringRecord): string {
  return `${window.location.origin}${record.startPage}?m=${record.param}`;
}

function renderKatex(src: string): string {
  // Split by $...$ (inline) and $$....$$ (display) blocks, render each
  try {
    return src
      .replace(/\$\$([^$]+)\$\$/g, (_, math) =>
        katex.renderToString(math, { displayMode: true, throwOnError: false })
      )
      .replace(/\$([^$\n]+)\$/g, (_, math) =>
        katex.renderToString(math, { displayMode: false, throwOnError: false })
      );
  } catch {
    return src;
  }
}

type FormState = {
  tag: string;
  startPage: string;
  title: string;
  body: string;
};

const EMPTY_FORM: FormState = { tag: "", startPage: "/", title: "", body: "" };

export default function AdminUrlTailoringPanel() {
  const [tagFilter, setTagFilter] = useState("");
  const [editing, setEditing] = useState<UrlTailoringRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPreview, setShowPreview] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery<UrlTailoringRecord[]>({
    queryKey: ["/api/admin/url-tailoring"],
  });

  const filteredRecords = tagFilter.trim()
    ? records.filter((r) =>
        r.tag.toLowerCase().includes(tagFilter.trim().toLowerCase())
      )
    : records;

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const res = await apiRequest("POST", "/api/admin/url-tailoring", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/url-tailoring"] });
      setCreating(false);
      setForm(EMPTY_FORM);
      setShowPreview(false);
      toast({ title: "Created", description: "URL dialog created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormState> }) => {
      const res = await apiRequest("PUT", `/api/admin/url-tailoring/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/url-tailoring"] });
      setEditing(null);
      setForm(EMPTY_FORM);
      setShowPreview(false);
      toast({ title: "Saved", description: "URL dialog updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowPreview(false);
    setCreating(true);
  }

  function openEdit(record: UrlTailoringRecord) {
    setCreating(false);
    setShowPreview(false);
    setForm({
      tag: record.tag,
      startPage: record.startPage,
      title: record.title,
      body: record.body,
    });
    setEditing(record);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowPreview(false);
  }

  function handleSave() {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function copyUrl(record: UrlTailoringRecord) {
    const url = buildFullUrl(record);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(record.id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1800);
    });
  }

  const isFormOpen = creating || editing !== null;
  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">URL Tailoring</h2>
        {!isFormOpen && (
          <button
            onClick={openCreate}
            className="px-3 py-1.5 text-sm border border-white/40 hover:border-white/70"
          >
            + New
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {isFormOpen && (
        <div className="border border-white/20 p-5 space-y-4 bg-black/30">
          <h3 className="text-base font-medium">
            {editing ? "Edit Dialog" : "New Dialog"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-white/60 uppercase tracking-wide">Tag (unique label)</label>
              <input
                className="w-full bg-black border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
                placeholder="e.g. recruiter-outreach-april"
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/60 uppercase tracking-wide">Start Page</label>
              <select
                className="w-full bg-black border border-white/20 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                value={form.startPage}
                onChange={(e) => setForm((f) => ({ ...f, startPage: e.target.value }))}
              >
                {PAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.value})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60 uppercase tracking-wide">Dialog Title</label>
            <input
              className="w-full bg-black border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50"
              placeholder="e.g. Hey there!"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60 uppercase tracking-wide">
              Body{" "}
              <span className="normal-case text-white/40">
                — supports KaTeX: inline <code className="text-white/50">$x^2$</code>, display <code className="text-white/50">$$\sum$$</code>
              </span>
            </label>
            <textarea
              className="w-full bg-black border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 font-mono min-h-[120px] resize-y"
              placeholder="Write your message here. Use $...$ for inline math and $$...$$ for display math."
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="px-3 py-1.5 text-sm border border-white/30 hover:border-white/60"
            >
              {showPreview ? "Hide Preview" : "Preview"}
            </button>
            <button
              onClick={handleSave}
              disabled={isMutating || !form.tag.trim() || !form.title.trim() || !form.body.trim()}
              className="px-3 py-1.5 text-sm border border-white/60 hover:border-white disabled:opacity-40"
            >
              {isMutating ? "Saving…" : "Save"}
            </button>
            <button
              onClick={closeForm}
              className="px-3 py-1.5 text-sm border border-white/20 hover:border-white/40 text-white/60"
            >
              Cancel
            </button>
          </div>

          {showPreview && (
            <div className="border border-white/10 p-4 bg-black/50 space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Preview</p>
              {form.title && (
                <p className="text-lg font-semibold">{form.title}</p>
              )}
              {form.body && (
                <div
                  className="text-sm text-white/80 leading-relaxed katex-preview"
                  dangerouslySetInnerHTML={{ __html: renderKatex(form.body) }}
                />
              )}
              {!form.title && !form.body && (
                <p className="text-white/30 text-sm italic">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      {!isFormOpen && (
        <div className="flex gap-3 items-center">
          <input
            className="bg-black border border-white/20 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 w-64"
            placeholder="Filter by tag…"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          {tagFilter && (
            <button
              onClick={() => setTagFilter("")}
              className="text-xs text-white/40 hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Records List */}
      {!isFormOpen && (
        <div className="space-y-2">
          {isLoading && (
            <p className="text-white/40 text-sm">Loading…</p>
          )}
          {!isLoading && filteredRecords.length === 0 && (
            <p className="text-white/30 text-sm italic">
              {tagFilter ? "No dialogs match that tag." : "No URL dialogs yet. Create one above."}
            </p>
          )}
          {filteredRecords.map((record) => {
            const fullUrl = buildFullUrl(record);
            return (
              <div
                key={record.id}
                className="border border-white/10 p-4 space-y-2 bg-black/20 hover:border-white/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{record.tag}</p>
                    <p className="text-xs text-white/40">
                      {PAGE_OPTIONS.find((p) => p.value === record.startPage)?.label ?? record.startPage}
                      {" · "}
                      <span className="font-mono">{record.param}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copyUrl(record)}
                      className="px-3 py-1 text-xs border border-white/30 hover:border-white/60 transition-colors"
                    >
                      {copiedId === record.id ? "Copied!" : "Copy URL"}
                    </button>
                    <button
                      onClick={() => openEdit(record)}
                      className="px-3 py-1 text-xs border border-white/20 hover:border-white/50 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <p className="text-xs font-mono text-white/30 truncate">{fullUrl}</p>
                <div className="text-xs text-white/50 line-clamp-2">{record.title}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
