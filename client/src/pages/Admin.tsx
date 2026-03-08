import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import Footer from "@/components/Footer";
import { toast } from "@/hooks/use-toast";

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

interface BioFormState {
  headline: string;
  description: string;
  paragraph: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
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

  const skillGroupsQuery = useQuery({
    queryKey: ["/api/admin/skills-groups"],
    enabled: isAdmin,
  });

  const allSkillsQuery = useQuery({
    queryKey: ["/api/admin/all-skills"],
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
    xyzBullets: "",
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

  const [skillGroupInput, setSkillGroupInput] = useState("");
  const [allSkillNameInput, setAllSkillNameInput] = useState("");
  const [allSkillGroupingIdInput, setAllSkillGroupingIdInput] = useState("");
  const [selectedAllSkillId, setSelectedAllSkillId] = useState("");

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
      setProjectForm({ title: "", category: "", description: "", longDescription: "", xyzBullets: "", tech: "", image: "", hoverImage: "", deployedUrl: "", githubUrl: "" });
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

  const saveBio = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/admin/bio", bioForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio/versions"] });
      toast({ title: "Success", description: "Bio saved" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Bio save failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const restoreBioVersion = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/bio/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio/versions"] });
      toast({ title: "Success", description: "Bio version restored" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Bio restore failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const addSkillGroup = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/skills-groups", { name: skillGroupInput });
    },
    onSuccess: () => {
      setSkillGroupInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "Skill group added" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill group add failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const updateSkillGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiRequest("PUT", `/api/admin/skills-groups/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "Skill group updated" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill group update failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const deleteSkillGroup = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/skills-groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "Skill group deleted" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill group delete failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const addAllSkill = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/all-skills", {
        name: allSkillNameInput,
        groupingId: allSkillGroupingIdInput || null,
      });
    },
    onSuccess: () => {
      setAllSkillNameInput("");
      setAllSkillGroupingIdInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "all_skill added" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `all_skill add failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const updateAllSkill = useMutation({
    mutationFn: async ({ id, name, groupingId }: { id: string; name: string; groupingId?: string | null }) => {
      await apiRequest("PUT", `/api/admin/all-skills/${id}`, {
        name,
        groupingId: groupingId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "all_skill updated" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `all_skill update failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const deleteAllSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/all-skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "all_skill deleted" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `all_skill delete failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const addSkill = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/skills", { allSkillId: selectedAllSkillId });
    },
    onSuccess: () => {
      setSelectedAllSkillId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Skill assigned to portfolio" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Portfolio skill add failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Skill archived" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill delete failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const reorderSkills = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("POST", "/api/admin/skills/reorder", { order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Skill order updated" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill reorder failed: ${getErrorMessage(error)}`, variant: "destructive" });
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

  const restoreSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/skills/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Skill restored" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Skill restore failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const projects = projectsQuery.data ?? [];
  const skills = skillsQuery.data ?? [];
  const skillGroups = skillGroupsQuery.data ?? [];
  const allSkills = allSkillsQuery.data ?? [];

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
              onClick={() => setProjectForm({ title: "", category: "", description: "", longDescription: "", xyzBullets: "", tech: "", image: "", hoverImage: "", deployedUrl: "", githubUrl: "" })}
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
                        xyzBullets: Array.isArray(project.xyzBullets)
                          ? project.xyzBullets.join("\n")
                          : "",
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
        <h2 className="text-xl font-semibold">Skills Data Model</h2>

        <div className="space-y-3 border border-white/10 p-4">
          <h3 className="text-lg font-semibold">skills_group</h3>
          <div className="flex gap-3">
            <input
              value={skillGroupInput}
              onChange={(e) => setSkillGroupInput(e.target.value)}
              placeholder="Group name"
              className="bg-black/60 border border-white/20 p-2 flex-1"
            />
            <button
              onClick={() => addSkillGroup.mutate()}
              className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
              disabled={!skillGroupInput.trim()}
            >
              Add Group
            </button>
          </div>
          <div className="space-y-2">
            {skillGroups.map((group: any) => (
              <div key={group.id} className="flex items-center justify-between border border-white/10 p-2">
                <div>{group.name}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const nextName = window.prompt("Update group name", group.name) || "";
                      if (!nextName.trim() || nextName.trim() === group.name) return;
                      updateSkillGroup.mutate({ id: group.id, name: nextName.trim() });
                    }}
                    className="px-2 py-1 border border-white/20"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteSkillGroup.mutate(group.id)}
                    className="px-2 py-1 border border-white/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {skillGroups.length === 0 && <div className="text-sm text-white/40 italic">No skill groups</div>}
          </div>
        </div>

        <div className="space-y-3 border border-white/10 p-4">
          <h3 className="text-lg font-semibold">all_skills</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={allSkillNameInput}
              onChange={(e) => setAllSkillNameInput(e.target.value)}
              placeholder="Skill name"
              className="bg-black/60 border border-white/20 p-2"
            />
            <select
              value={allSkillGroupingIdInput}
              onChange={(e) => setAllSkillGroupingIdInput(e.target.value)}
              className="bg-black/60 border border-white/20 p-2"
            >
              <option value="">No group</option>
              {skillGroups.map((group: any) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button
              onClick={() => addAllSkill.mutate()}
              className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
              disabled={!allSkillNameInput.trim()}
            >
              Add all_skill
            </button>
          </div>
          <div className="space-y-2">
            {allSkills.map((allSkill: any) => (
              <div key={allSkill.id} className="flex items-center justify-between border border-white/10 p-2">
                <div>
                  <div>{allSkill.name}</div>
                  <div className="text-xs text-white/50">Group: {allSkill.groupingName || "None"}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const nextName = window.prompt("Update all_skill name", allSkill.name) || "";
                      if (!nextName.trim()) return;
                      const nextGroupId = window.prompt("Update grouping_id (blank for none)", allSkill.groupingId || "") ?? allSkill.groupingId ?? "";
                      updateAllSkill.mutate({
                        id: allSkill.id,
                        name: nextName.trim(),
                        groupingId: nextGroupId.trim() || null,
                      });
                    }}
                    className="px-2 py-1 border border-white/20"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAllSkill.mutate(allSkill.id)}
                    className="px-2 py-1 border border-white/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {allSkills.length === 0 && <div className="text-sm text-white/40 italic">No all_skills entries</div>}
          </div>
        </div>

        <div className="space-y-3 border border-white/10 p-4">
          <h3 className="text-lg font-semibold">portfolio_skills</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={selectedAllSkillId}
              onChange={(e) => setSelectedAllSkillId(e.target.value)}
              className="bg-black/60 border border-white/20 p-2"
            >
              <option value="">Select all_skill to assign</option>
              {allSkills.map((allSkill: any) => (
                <option key={allSkill.id} value={allSkill.id}>{allSkill.name}</option>
              ))}
            </select>
            <button
              onClick={() => addSkill.mutate()}
              className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
              disabled={!selectedAllSkillId}
            >
              Assign to portfolio_skills
            </button>
          </div>
          <div className="space-y-2">
            {skills.map((skill: any, index: number) => (
              <div key={skill.id} className="flex items-center justify-between border border-white/10 p-2">
                <div>
                  <div>{skill.label}</div>
                  <div className="text-xs text-white/50">Group: {skill.groupingName || "None"}</div>
                </div>
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
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {skills.length === 0 && <div className="text-sm text-white/40 italic">No portfolio_skills assignments</div>}
          </div>
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
                    <button
                      onClick={() => restoreBioVersion.mutate(version.id)}
                      disabled={index === 0}
                      className="px-3 py-1 border border-white/20 hover:bg-white/5 disabled:opacity-40"
                    >
                      Restore
                    </button>
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
