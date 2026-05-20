import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WelcomeMessage {
  id: string;
  slug: string;
  label: string;
  message: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageForm {
  id?: string;
  slug: string;
  label: string;
  message: string;
}

const blankForm: MessageForm = { slug: "", label: "", message: "" };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function getBaseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://2jog.dev";
}

export default function AdminPersonalizationPanel() {
  const [form, setForm] = useState<MessageForm>(blankForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WelcomeMessage | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeQuery = useQuery<WelcomeMessage[]>({
    queryKey: ["/api/admin/welcome-messages"],
  });

  const archivedQuery = useQuery<WelcomeMessage[]>({
    queryKey: ["/api/admin/welcome-messages/archived"],
    enabled: showArchived,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.id) {
        await apiRequest("PUT", `/api/admin/welcome-messages/${form.id}`, {
          slug: form.slug,
          label: form.label,
          message: form.message,
        });
      } else {
        await apiRequest("POST", "/api/admin/welcome-messages", {
          slug: form.slug,
          label: form.label,
          message: form.message,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages"] });
      setForm(blankForm);
      setDialogOpen(false);
      toast({ title: "Saved", description: form.id ? "Welcome message updated" : "Welcome message created" });
    },
    onError: (error) => {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/welcome-messages/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages/archived"] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Welcome message permanently deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/welcome-messages/${id}/archive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages/archived"] });
      toast({ title: "Archived", description: "Message hidden from this list but still active for its URL" });
    },
    onError: (error) => {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/welcome-messages/${id}/unarchive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-messages/archived"] });
      toast({ title: "Restored", description: "Welcome message is active again" });
    },
    onError: (error) => {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  function openEdit(msg: WelcomeMessage) {
    setForm({ id: msg.id, slug: msg.slug, label: msg.label, message: msg.message });
    setDialogOpen(true);
  }

  function openCreate() {
    setForm(blankForm);
    setDialogOpen(true);
  }

  function copyUrl(slug: string) {
    const url = `${getBaseUrl()}/?welcome=${encodeURIComponent(slug)}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Copied", description: url });
    });
  }

  const activeMessages = activeQuery.data ?? [];
  const archivedMessages = archivedQuery.data ?? [];

  return (
    <div data-testid="admin-personalization-panel" className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Welcome Messages</h2>
          <p className="text-sm text-white/50 mt-1">
            Each message maps to a custom URL that triggers a personalized intro animation.
          </p>
        </div>
        <button
          data-testid="create-welcome-message"
          onClick={openCreate}
          className="px-4 py-2 border border-white/30 text-sm hover:border-white/60"
        >
          + New Message
        </button>
      </div>

      {activeQuery.isLoading && (
        <p className="text-white/50 text-sm">Loading…</p>
      )}

      {!activeQuery.isLoading && activeMessages.length === 0 && (
        <p className="text-white/40 text-sm border border-white/10 p-4">
          No welcome messages yet. Create one to generate a personalized URL.
        </p>
      )}

      <div className="space-y-3">
        {activeMessages.map((msg) => (
          <MessageCard
            key={msg.id}
            msg={msg}
            onEdit={() => openEdit(msg)}
            onCopyUrl={() => copyUrl(msg.slug)}
            onArchive={() => archiveMutation.mutate(msg.id)}
            onDelete={() => setDeleteTarget(msg)}
          />
        ))}
      </div>

      {/* Archived section */}
      <div className="border-t border-white/10 pt-6">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-sm text-white/40 hover:text-white/70"
        >
          {showArchived ? "Hide archived" : "Show archived messages"}
        </button>

        {showArchived && (
          <div className="mt-4 space-y-3">
            {archivedQuery.isLoading && <p className="text-white/50 text-sm">Loading…</p>}
            {!archivedQuery.isLoading && archivedMessages.length === 0 && (
              <p className="text-white/40 text-sm">No archived messages.</p>
            )}
            {archivedMessages.map((msg) => (
              <MessageCard
                key={msg.id}
                msg={msg}
                archived
                onEdit={() => openEdit(msg)}
                onCopyUrl={() => copyUrl(msg.slug)}
                onUnarchive={() => unarchiveMutation.mutate(msg.id)}
                onDelete={() => setDeleteTarget(msg)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-black border border-white/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Welcome Message" : "New Welcome Message"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-sm text-white/70 mb-1">Label (admin-only)</label>
              <input
                data-testid="welcome-label-input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Acme Corp visit"
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-white/60"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">
                Slug{" "}
                <span className="text-white/40">(URL key — lowercase alphanumeric and hyphens)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-sm">?welcome=</span>
                <input
                  data-testid="welcome-slug-input"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                  placeholder="acme-corp"
                  className="flex-1 bg-transparent border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-white/60"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">
                Welcome message{" "}
                <span className="text-white/40">(newlines create separate typed lines)</span>
              </label>
              <textarea
                data-testid="welcome-message-input"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder={"Welcome to the team, Sarah!\nWe're glad you stopped by."}
                rows={4}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-white/60 resize-y font-mono"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 text-sm border border-white/20 hover:border-white/40"
              >
                Cancel
              </button>
              <button
                data-testid="save-welcome-message"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.slug || !form.label || !form.message}
                className="px-4 py-2 text-sm border border-cyan-300/50 hover:border-cyan-300/80 disabled:opacity-40"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-black border border-white/20 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Welcome Message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-white/70 mt-2">
            Permanently delete <span className="text-white font-mono">{deleteTarget?.slug}</span>?
            This cannot be undone. The URL will stop working immediately.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm border border-white/20 hover:border-white/40"
            >
              Cancel
            </button>
            <button
              data-testid="confirm-delete-welcome"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm border border-red-500/50 text-red-400 hover:border-red-500/80 disabled:opacity-40"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MessageCardProps {
  msg: WelcomeMessage;
  archived?: boolean;
  onEdit: () => void;
  onCopyUrl: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

function MessageCard({ msg, archived, onEdit, onCopyUrl, onArchive, onUnarchive, onDelete }: MessageCardProps) {
  const previewLines = msg.message.split("\n").slice(0, 2);
  const hasMore = msg.message.split("\n").length > 2;

  return (
    <div
      data-testid="welcome-message-card"
      className={`border p-4 space-y-2 ${archived ? "border-white/10 opacity-60" : "border-white/20"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{msg.label}</span>
            {archived && (
              <span className="text-[10px] uppercase tracking-wider text-white/40 border border-white/20 px-1">
                archived
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <code className="text-xs text-cyan-300/80">?welcome={msg.slug}</code>
            <button
              onClick={onCopyUrl}
              className="text-[10px] text-white/40 hover:text-white/70 underline"
            >
              copy URL
            </button>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs border border-white/20 px-2 py-1 hover:border-white/40"
          >
            Edit
          </button>
          {!archived && onArchive && (
            <button
              onClick={onArchive}
              className="text-xs border border-white/20 px-2 py-1 hover:border-white/40"
            >
              Archive
            </button>
          )}
          {archived && onUnarchive && (
            <button
              onClick={onUnarchive}
              className="text-xs border border-white/20 px-2 py-1 hover:border-white/40"
            >
              Restore
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs border border-red-500/30 text-red-400 px-2 py-1 hover:border-red-500/60"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="text-sm text-white/50 font-mono">
        {previewLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {hasMore && <div className="text-white/30">…</div>}
      </div>
    </div>
  );
}
