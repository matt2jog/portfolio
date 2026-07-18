import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProjectPresentation {
  id: string;
  title: string;
  category: string;
  image?: string | null;
  hoverImage?: string | null;
  aiSystemPrompt?: string | null;
}

interface PresentationForm {
  category: string;
  image: string;
  hoverImage: string;
  aiSystemPrompt: string;
}

const emptyForm: PresentationForm = {
  category: "",
  image: "",
  hoverImage: "",
  aiSystemPrompt: "",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function AdminProjectPresentationPanel() {
  const projectsQuery = useQuery({ queryKey: ["/api/admin/projects"] });
  const [selected, setSelected] = useState<ProjectPresentation | null>(null);
  const [form, setForm] = useState<PresentationForm>(emptyForm);

  useEffect(() => {
    setForm(selected ? {
      category: selected.category,
      image: selected.image ?? "",
      hoverImage: selected.hoverImage ?? "",
      aiSystemPrompt: selected.aiSystemPrompt ?? "",
    } : emptyForm);
  }, [selected]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a project before saving");
      await apiRequest("PUT", `/api/admin/projects/${selected.id}`, {
        category: form.category.trim(),
        image: form.image.trim() || null,
        hoverImage: form.hoverImage.trim() || null,
        aiSystemPrompt: form.aiSystemPrompt.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setSelected(null);
      toast({ title: "Saved", description: "Project presentation updated" });
    },
    onError: (error) => {
      toast({
        title: "Project presentation update failed",
        description: message(error),
        variant: "destructive",
      });
    },
  });

  const projects = Array.isArray(projectsQuery.data)
    ? projectsQuery.data as ProjectPresentation[]
    : [];

  return (
    <section className="space-y-6 border border-white/10 p-4 sm:p-6" data-testid="admin-project-presentation-panel">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Project presentation</h2>
        <p className="max-w-[65ch] text-sm leading-6 text-white/70">
          Create and edit canonical projects in Admin Dashboard. Manage only Portfolio imagery, category,
          and project-chat guidance here.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setSelected(project)}
            className="space-y-1 border border-white/15 p-4 text-left hover:border-white/50"
          >
            <span className="block font-semibold">{project.title}</span>
            <span className="block text-sm text-white/60">{project.category}</span>
          </button>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-white/50">No projected projects are available.</p>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="w-[95vw] max-w-2xl bg-black text-white border-white/20">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span>Portfolio category</span>
                  <input
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="border border-white/20 bg-black/60 p-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Primary image URL</span>
                  <input
                    value={form.image}
                    onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))}
                    className="border border-white/20 bg-black/60 p-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Hover image URL</span>
                  <input
                    value={form.hoverImage}
                    onChange={(event) => setForm((current) => ({ ...current, hoverImage: event.target.value }))}
                    className="border border-white/20 bg-black/60 p-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Project-chat guidance</span>
                  <textarea
                    value={form.aiSystemPrompt}
                    onChange={(event) => setForm((current) => ({ ...current, aiSystemPrompt: event.target.value }))}
                    className="min-h-28 border border-white/20 bg-black/60 p-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={!form.category.trim() || save.isPending}
                  className="justify-self-start border border-white/30 px-4 py-2 hover:border-white/70 disabled:opacity-40"
                >
                  {save.isPending ? "Saving…" : "Save presentation"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
