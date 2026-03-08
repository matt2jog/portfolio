import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProjectFormState {
  id?: string;
  title: string;
  category: string;
  description: string;
  longDescription: string;
  xyzBullets: string;
  tech: string;
  image: string;
  hoverImage: string;
  deployedUrl: string;
  githubUrl: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

const blankProjectForm: ProjectFormState = {
  title: "",
  category: "",
  description: "",
  longDescription: "",
  xyzBullets: "",
  tech: "",
  image: "",
  hoverImage: "",
  deployedUrl: "",
  githubUrl: "",
};

export default function AdminProjectsPanel() {
  const projectsQuery = useQuery({ queryKey: ["/api/admin/projects"] });
  const archivedProjectsQuery = useQuery({ queryKey: ["/api/admin/archived/projects"] });

  const [projectForm, setProjectForm] = useState<ProjectFormState>(blankProjectForm);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [selectedArchivedProject, setSelectedArchivedProject] = useState<any | null>(null);

  const saveProject = useMutation({
    mutationFn: async () => {
      const payload = {
        title: projectForm.title,
        category: projectForm.category,
        description: projectForm.description,
        longDescription: projectForm.longDescription || null,
        xyzBullets: projectForm.xyzBullets
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        tech: projectForm.tech
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        image: projectForm.image || null,
        hoverImage: projectForm.hoverImage || null,
        deployedUrl: projectForm.deployedUrl || null,
        githubUrl: projectForm.githubUrl || null,
      };

      if (projectForm.id) {
        await apiRequest("PUT", `/api/admin/projects/${projectForm.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/projects", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setProjectForm(blankProjectForm);
      toast({ title: "Success", description: projectForm.id ? "Project updated" : "Project added" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Project save failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/projects"] });
      toast({ title: "Success", description: "Project archived" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Project delete failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const reorderProjects = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("POST", "/api/admin/projects/reorder", { order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({ title: "Success", description: "Project order updated" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Project reorder failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const restoreProject = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/projects/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/projects"] });
      toast({ title: "Success", description: "Project restored" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Project restore failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const projects = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
  const archivedProjects = Array.isArray(archivedProjectsQuery.data) ? archivedProjectsQuery.data : [];
  const projectOrderIds = useMemo(() => projects.map((project: any) => project.id), [projects]);

  return (
    <section className="space-y-6 border border-white/10 p-4 sm:p-6">
      <h2 className="text-xl font-semibold">Projects CRUD</h2>

      <div className="grid gap-3">
        <input
          value={projectForm.title}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Title"
          className="bg-black/60 border border-white/20 p-2"
        />
        <input
          value={projectForm.category}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, category: e.target.value }))}
          placeholder="Category"
          className="bg-black/60 border border-white/20 p-2"
        />
        <input
          value={projectForm.image}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, image: e.target.value }))}
          placeholder="Image URL (optional)"
          className="bg-black/60 border border-white/20 p-2"
        />
        <input
          value={projectForm.hoverImage}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, hoverImage: e.target.value }))}
          placeholder="Hover Image URL (optional)"
          className="bg-black/60 border border-white/20 p-2"
        />
        <textarea
          value={projectForm.description}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description (short)"
          className="bg-black/60 border border-white/20 p-2"
          rows={2}
        />
        <textarea
          value={projectForm.longDescription}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, longDescription: e.target.value }))}
          placeholder="Long Description (optional)"
          className="bg-black/60 border border-white/20 p-2"
          rows={4}
        />
        <textarea
          value={projectForm.xyzBullets}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, xyzBullets: e.target.value }))}
          placeholder="xyz_bullets (one bullet per line)"
          className="bg-black/60 border border-white/20 p-2"
          rows={3}
        />
        <input
          value={projectForm.deployedUrl}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, deployedUrl: e.target.value }))}
          placeholder="Deployed URL (optional)"
          className="bg-black/60 border border-white/20 p-2"
        />
        <input
          value={projectForm.githubUrl}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, githubUrl: e.target.value }))}
          placeholder="GitHub URL (optional)"
          className="bg-black/60 border border-white/20 p-2"
        />
        <input
          value={projectForm.tech}
          onChange={(e) => setProjectForm((prev) => ({ ...prev, tech: e.target.value }))}
          placeholder="Tech (comma separated)"
          className="bg-black/60 border border-white/20 p-2"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => saveProject.mutate()}
          className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
        >
          {projectForm.id ? "Update Project" : "Add Project"}
        </button>
        {projectForm.id && (
          <button
            onClick={() => setProjectForm(blankProjectForm)}
            className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="space-y-2">
        {projects.map((project: any, index: number) => (
          <div
            key={project.id}
            className="border border-white/10 p-3 cursor-pointer hover:border-white/40"
            onClick={() => setSelectedProject({ ...project, index })}
          >
            <div className="font-semibold">{project.title}</div>
            <div className="text-sm text-white/60">{project.category}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 border border-white/10 p-4">
        <h3 className="text-lg font-semibold">Projects History (Archived)</h3>
        <div className="space-y-2">
          {archivedProjects.map((project: any) => (
            <div
              key={project.id}
              className="border border-white/10 p-3 opacity-60 cursor-pointer hover:border-white/40"
              onClick={() => setSelectedArchivedProject(project)}
            >
              <div className="font-semibold">{project.title}</div>
              <div className="text-xs text-white/50">
                Archived {new Date(project.deletedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {archivedProjects.length === 0 && (
            <div className="text-sm text-white/40 italic">No archived projects</div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProject.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-white/80">
                <div><span className="text-white/50">Category:</span> {selectedProject.category}</div>
                <div><span className="text-white/50">Description:</span> {selectedProject.description}</div>
                <div><span className="text-white/50">Tech:</span> {(selectedProject.tech || []).join(", ")}</div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => {
                    setProjectForm({
                      id: selectedProject.id,
                      title: selectedProject.title,
                      category: selectedProject.category,
                      description: selectedProject.description,
                      longDescription: selectedProject.longDescription || "",
                      xyzBullets: Array.isArray(selectedProject.xyzBullets) ? selectedProject.xyzBullets.join("\n") : "",
                      tech: (selectedProject.tech || []).join(", "),
                      image: selectedProject.image || "",
                      hoverImage: selectedProject.hoverImage || "",
                      deployedUrl: selectedProject.deployedUrl || "",
                      githubUrl: selectedProject.githubUrl || "",
                    });
                    setSelectedProject(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Edit in Form
                </button>
                <button
                  onClick={() => {
                    deleteProject.mutate(selectedProject.id);
                    setSelectedProject(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Archive
                </button>
                <button
                  disabled={selectedProject.index === 0}
                  onClick={() => {
                    const order = [...projectOrderIds];
                    const index = selectedProject.index;
                    [order[index - 1], order[index]] = [order[index], order[index - 1]];
                    reorderProjects.mutate(order);
                    setSelectedProject(null);
                  }}
                  className="px-3 py-1 border border-white/20 disabled:opacity-40"
                >
                  Move Up
                </button>
                <button
                  disabled={selectedProject.index === projects.length - 1}
                  onClick={() => {
                    const order = [...projectOrderIds];
                    const index = selectedProject.index;
                    [order[index + 1], order[index]] = [order[index], order[index + 1]];
                    reorderProjects.mutate(order);
                    setSelectedProject(null);
                  }}
                  className="px-3 py-1 border border-white/20 disabled:opacity-40"
                >
                  Move Down
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedArchivedProject} onOpenChange={(open) => !open && setSelectedArchivedProject(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedArchivedProject && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedArchivedProject.title}</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-white/80">
                Archived {new Date(selectedArchivedProject.deletedAt).toLocaleString()}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    restoreProject.mutate(selectedArchivedProject.id);
                    setSelectedArchivedProject(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Restore
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
