import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import Footer from "@/components/Footer";

interface ProjectFormState {
  id?: string;
  title: string;
  category: string;
  description: string;
  longDescription: string;
  epilogue: string;
  tech: string;
  image: string;
  hoverImage: string;
  deployedUrl: string;
  githubUrl: string;
}

interface BioFormState {
  headline: string;
  description: string;
  paragraph: string;
}

export default function Admin() {
  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const isAdmin = me?.role === "admin";

  const projectsQuery = useQuery({
    queryKey: ["/api/admin/projects"],
    enabled: isAdmin,
  });

  const skillsQuery = useQuery({
    queryKey: ["/api/admin/skills"],
    enabled: isAdmin,
  });

  const bioQuery = useQuery({
    queryKey: ["/api/admin/bio"],
    enabled: isAdmin,
  });

  const bioVersionsQuery = useQuery({
    queryKey: ["/api/admin/bio/versions"],
    enabled: isAdmin,
  });

  const archivedProjectsQuery = useQuery({
    queryKey: ["/api/admin/archived/projects"],
    enabled: isAdmin,
  });

  const archivedSkillsQuery = useQuery({
    queryKey: ["/api/admin/archived/skills"],
    enabled: isAdmin,
  });

  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    title: "",
    category: "",
    description: "",
    longDescription: "",
    epilogue: "",
    tech: "",
    image: "",
    hoverImage: "",
    deployedUrl: "",
    githubUrl: "",
  });

  const [bioForm, setBioForm] = useState<BioFormState>({
    headline: "",
    description: "",
    paragraph: "",
  });

  const [skillInput, setSkillInput] = useState("");

  useEffect(() => {
    if (bioQuery.data) {
      setBioForm({
        headline: bioQuery.data.headline || "",
        description: bioQuery.data.description || "",
        paragraph: bioQuery.data.paragraph || "",
      });
    }
  }, [bioQuery.data]);

  const saveProject = useMutation({
    mutationFn: async () => {
      const payload = {
        title: projectForm.title,
        category: projectForm.category,
        description: projectForm.description,
        longDescription: projectForm.longDescription || null,
        epilogue: projectForm.epilogue || null,
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
      setProjectForm({ title: "", category: "", description: "", longDescription: "", epilogue: "", tech: "", image: "", hoverImage: "", deployedUrl: "", githubUrl: "" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/projects/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] }),
  });

  const reorderProjects = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("POST", "/api/admin/projects/reorder", { order });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] }),
  });

  const saveBio = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/admin/bio", bioForm);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/bio"] }),
  });

  const addSkill = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/skills", { label: skillInput });
    },
    onSuccess: () => {
      setSkillInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
    },
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/skills/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] }),
  });

  const reorderSkills = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("POST", "/api/admin/skills/reorder", { order });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] }),
  });

  const restoreProject = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/projects/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/projects"] });
    },
  });

  const restoreSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/skills/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/skills"] });
    },
  });

  const projects = projectsQuery.data ?? [];
  const skills = skillsQuery.data ?? [];

  const projectOrderIds = useMemo(() => projects.map((p: any) => p.id), [projects]);
  const skillOrderIds = useMemo(() => skills.map((s: any) => s.id), [skills]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Admin Access</h1>
          <a
            href="/auth/google"
            className="inline-flex items-center px-4 py-2 border border-white/20 text-white hover:border-white/60"
          >
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-white/70">You are not authorized to view this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10 space-y-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <button
          onClick={() => apiRequest("POST", "/api/auth/logout").then(() => window.location.reload())}
          className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
        >
          Log out
        </button>
      </div>

      <section className="space-y-4 border border-white/10 p-6">
        <h2 className="text-xl font-semibold">Bio</h2>
        <div className="grid gap-4">
          <input
            value={bioForm.headline}
            onChange={(e) => setBioForm((prev) => ({ ...prev, headline: e.target.value }))}
            placeholder="Headline"
            className="bg-black/60 border border-white/20 p-2"
          />
          <textarea
            value={bioForm.description}
            onChange={(e) => setBioForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Description"
            className="bg-black/60 border border-white/20 p-2"
            rows={3}
          />
          <textarea
            value={bioForm.paragraph}
            onChange={(e) => setBioForm((prev) => ({ ...prev, paragraph: e.target.value }))}
            placeholder="Paragraph"
            className="bg-black/60 border border-white/20 p-2"
            rows={2}
          />
        </div>
        <button
          onClick={() => saveBio.mutate()}
          className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
        >
          Save Bio
        </button>
      </section>

      <section className="space-y-4 border border-white/10 p-6">
        <h2 className="text-xl font-semibold">Projects</h2>
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
            value={projectForm.epilogue}
            onChange={(e) => setProjectForm((prev) => ({ ...prev, epilogue: e.target.value }))}
            placeholder="Epilogue (optional)"
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
              onClick={() => setProjectForm({ title: "", category: "", description: "", longDescription: "", epilogue: "", tech: "", image: "", hoverImage: "", deployedUrl: "", githubUrl: "" })}
              className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="space-y-2">
          {projects.map((project: any, index: number) => (
            <div key={project.id} className="border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{project.title}</div>
                  <div className="text-sm text-white/60">{project.category}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setProjectForm({
                        id: project.id,
                        title: project.title,
                        category: project.category,
                        description: project.description,
                        longDescription: project.longDescription || "",
                        epilogue: project.epilogue || "",
                        tech: (project.tech || []).join(", "),
                        image: project.image || "",
                        hoverImage: project.hoverImage || "",
                        deployedUrl: project.deployedUrl || "",
                        githubUrl: project.githubUrl || "",
                      });
                    }}
                    className="px-3 py-1 border border-white/20"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteProject.mutate(project.id)}
                    className="px-3 py-1 border border-white/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={index === 0}
                  onClick={() => {
                    const order = [...projectOrderIds];
                    [order[index - 1], order[index]] = [order[index], order[index - 1]];
                    reorderProjects.mutate(order);
                  }}
                  className="px-2 py-1 border border-white/20 disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  disabled={index === projects.length - 1}
                  onClick={() => {
                    const order = [...projectOrderIds];
                    [order[index + 1], order[index]] = [order[index], order[index + 1]];
                    reorderProjects.mutate(order);
                  }}
                  className="px-2 py-1 border border-white/20 disabled:opacity-40"
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border border-white/10 p-6">
        <h2 className="text-xl font-semibold">Skills</h2>
        <div className="flex gap-3">
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            placeholder="New skill"
            className="bg-black/60 border border-white/20 p-2 flex-1"
          />
          <button
            onClick={() => addSkill.mutate()}
            className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
            disabled={!skillInput.trim()}
          >
            Add
          </button>
        </div>
        <div className="space-y-2">
          {skills.map((skill: any, index: number) => (
            <div key={skill.id} className="flex items-center justify-between border border-white/10 p-2">
              <div>{skill.label}</div>
              <div className="flex gap-2">
                <button
                  disabled={index === 0}
                  onClick={() => {
                    const order = [...skillOrderIds];
                    [order[index - 1], order[index]] = [order[index], order[index - 1]];
                    reorderSkills.mutate(order);
                  }}
                  className="px-2 py-1 border border-white/20 disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  disabled={index === skills.length - 1}
                  onClick={() => {
                    const order = [...skillOrderIds];
                    [order[index + 1], order[index]] = [order[index], order[index + 1]];
                    reorderSkills.mutate(order);
                  }}
                  className="px-2 py-1 border border-white/20 disabled:opacity-40"
                >
                  Down
                </button>
                <button
                  onClick={() => deleteSkill.mutate(skill.id)}
                  className="px-2 py-1 border border-white/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border border-white/10 p-6">
        <h2 className="text-xl font-semibold">Archive</h2>
        <p className="text-sm text-white/60">Deleted items are archived, not permanently removed. You can restore them anytime.</p>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Bio Versions ({bioVersionsQuery.data?.length || 0})</h3>
            <div className="space-y-2">
              {bioVersionsQuery.data?.map((version: any, index: number) => (
                <div key={version.id} className="border border-white/10 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-white/60 mb-2">
                        Version {(bioVersionsQuery.data?.length || 0) - index} • Created: {new Date(version.createdAt).toLocaleString()}
                        {index === 0 && <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">Current</span>}
                      </div>
                      <div className="text-sm">
                        <div className="font-semibold">{version.headline}</div>
                        <div className="text-white/70 text-xs mt-1 line-clamp-2">{version.description}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(!bioVersionsQuery.data || bioVersionsQuery.data.length === 0) && (
                <div className="text-sm text-white/40 italic">No bio versions</div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Archived Projects ({archivedProjectsQuery.data?.length || 0})</h3>
            <div className="space-y-2">
              {archivedProjectsQuery.data?.map((project: any) => (
                <div key={project.id} className="border border-white/10 p-3 opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{project.title}</div>
                      <div className="text-xs text-white/50">
                        Archived {new Date(project.deletedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreProject.mutate(project.id)}
                      className="px-3 py-1 border border-white/20 hover:bg-white/5"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
              {(!archivedProjectsQuery.data || archivedProjectsQuery.data.length === 0) && (
                <div className="text-sm text-white/40 italic">No archived projects</div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Archived Skills ({archivedSkillsQuery.data?.length || 0})</h3>
            <div className="space-y-2">
              {archivedSkillsQuery.data?.map((skill: any) => (
                <div key={skill.id} className="border border-white/10 p-2 opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <div>{skill.label}</div>
                      <div className="text-xs text-white/50">
                        Archived {new Date(skill.deletedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreSkill.mutate(skill.id)}
                      className="px-3 py-1 border border-white/20 hover:bg-white/5"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
              {(!archivedSkillsQuery.data || archivedSkillsQuery.data.length === 0) && (
                <div className="text-sm text-white/40 italic">No archived skills</div>
              )}
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
