import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export default function AdminSkillsPanel() {
  const skillsQuery = useQuery({ queryKey: ["/api/admin/skills"] });
  const skillGroupsQuery = useQuery({ queryKey: ["/api/admin/skills-groups"] });
  const allSkillsQuery = useQuery({ queryKey: ["/api/admin/all-skills"] });

  const [skillGroupInput, setSkillGroupInput] = useState("");
  const [allSkillNameInput, setAllSkillNameInput] = useState("");
  const [allSkillGroupingNameInput, setAllSkillGroupingNameInput] = useState("");
  const [selectedAllSkillNameInput, setSelectedAllSkillNameInput] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [selectedAllSkill, setSelectedAllSkill] = useState<any | null>(null);
  const [selectedPortfolioSkill, setSelectedPortfolioSkill] = useState<any | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "Validation Error",
    message: "",
  });
  const [groupEditNameInput, setGroupEditNameInput] = useState("");
  const [allSkillEditNameInput, setAllSkillEditNameInput] = useState("");
  const [allSkillEditGroupingNameInput, setAllSkillEditGroupingNameInput] = useState("");

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
    mutationFn: async ({ name, groupingId }: { name: string; groupingId: string | null }) => {
      await apiRequest("POST", "/api/admin/all-skills", {
        name,
        groupingId,
      });
    },
    onSuccess: () => {
      setAllSkillNameInput("");
      setAllSkillGroupingNameInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-skills"] });
      toast({ title: "Success", description: "all_skill added" });
    },
    onError: (error) => {
      setErrorDialog({
        open: true,
        title: "all_skill Add Failed",
        message: getErrorMessage(error),
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "all_skill updated" });
    },
    onError: (error) => {
      setErrorDialog({
        open: true,
        title: "all_skill Update Failed",
        message: getErrorMessage(error),
      });
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

  const addPortfolioSkill = useMutation({
    mutationFn: async ({ allSkillId }: { allSkillId: string }) => {
      await apiRequest("POST", "/api/admin/skills", { allSkillId });
    },
    onSuccess: () => {
      setSelectedAllSkillNameInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Skill assigned to portfolio" });
    },
    onError: (error) => {
      setErrorDialog({
        open: true,
        title: "Portfolio Skill Add Failed",
        message: getErrorMessage(error),
      });
    },
  });

  const deletePortfolioSkill = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Portfolio skill removed" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Portfolio skill remove failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const reorderPortfolioSkills = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("POST", "/api/admin/skills/reorder", { order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/skills"] });
      toast({ title: "Success", description: "Portfolio skill order updated" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Portfolio skill reorder failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const skills = Array.isArray(skillsQuery.data) ? skillsQuery.data : [];
  const skillGroups = Array.isArray(skillGroupsQuery.data) ? skillGroupsQuery.data : [];
  const allSkills = Array.isArray(allSkillsQuery.data) ? allSkillsQuery.data : [];
  const skillOrderIds = useMemo(() => skills.map((skill: any) => skill.id), [skills]);

  useEffect(() => {
    setGroupEditNameInput(selectedGroup?.name || "");
  }, [selectedGroup]);

  useEffect(() => {
    setAllSkillEditNameInput(selectedAllSkill?.name || "");
    setAllSkillEditGroupingNameInput(selectedAllSkill?.groupingName || "");
  }, [selectedAllSkill]);

  const resolveGroupIdByName = (groupName: string): string | null => {
    const trimmed = groupName.trim();
    if (!trimmed) return null;
    const match = skillGroups.find((group: any) => group.name.toLowerCase() === trimmed.toLowerCase());
    return match?.id ?? null;
  };

  const resolveAllSkillIdByName = (skillName: string): string | null => {
    const trimmed = skillName.trim();
    if (!trimmed) return null;
    const match = allSkills.find((allSkill: any) => allSkill.name.toLowerCase() === trimmed.toLowerCase());
    return match?.id ?? null;
  };

  const handleAddAllSkill = () => {
    const name = allSkillNameInput.trim();
    if (!name) {
      setErrorDialog({ open: true, title: "Invalid all_skill", message: "Skill name is required." });
      return;
    }

    const groupingId = resolveGroupIdByName(allSkillGroupingNameInput);
    if (allSkillGroupingNameInput.trim() && !groupingId) {
      setErrorDialog({ open: true, title: "Invalid Group", message: "Group must match an existing skills_group name." });
      return;
    }

    addAllSkill.mutate({ name, groupingId });
  };

  const handleAddPortfolioSkill = () => {
    const allSkillId = resolveAllSkillIdByName(selectedAllSkillNameInput);
    if (!allSkillId) {
      setErrorDialog({ open: true, title: "Invalid all_skill", message: "Select an existing all_skill name to assign." });
      return;
    }

    addPortfolioSkill.mutate({ allSkillId });
  };

  return (
    <section className="space-y-6 border border-white/10 p-4 sm:p-6">
      <h2 className="text-xl font-semibold">Skills CRUD</h2>

      <div className="space-y-3 border border-white/10 p-4">
        <h3 className="text-lg font-semibold">skills_group</h3>
        <div className="flex flex-col sm:flex-row gap-3">
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
            <div
              key={group.id}
              className="border border-white/10 p-2 cursor-pointer hover:border-white/40"
              onClick={() => setSelectedGroup(group)}
            >
              {group.name}
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
          <input
            list="skills-group-options"
            value={allSkillGroupingNameInput}
            onChange={(e) => setAllSkillGroupingNameInput(e.target.value)}
            placeholder="Group name (autocomplete)"
            className="bg-black/60 border border-white/20 p-2"
          />
          <datalist id="skills-group-options">
            {skillGroups.map((group: any) => (
              <option key={group.id} value={group.name} />
            ))}
          </datalist>
          <button
            onClick={handleAddAllSkill}
            className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
            disabled={!allSkillNameInput.trim()}
          >
            Add all_skill
          </button>
        </div>

        <div className="space-y-2">
          {allSkills.map((allSkill: any) => (
            <div
              key={allSkill.id}
              className="border border-white/10 p-2 cursor-pointer hover:border-white/40"
              onClick={() => setSelectedAllSkill(allSkill)}
            >
              <div>
                <div>{allSkill.name}</div>
                <div className="text-xs text-white/50">Group: {allSkill.groupingName || "None"}</div>
              </div>
            </div>
          ))}
          {allSkills.length === 0 && <div className="text-sm text-white/40 italic">No all_skills entries</div>}
        </div>
      </div>

      <div className="space-y-3 border border-white/10 p-4">
        <h3 className="text-lg font-semibold">portfolio_skills</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            list="all-skills-options"
            value={selectedAllSkillNameInput}
            onChange={(e) => setSelectedAllSkillNameInput(e.target.value)}
            placeholder="all_skill name (autocomplete)"
            className="bg-black/60 border border-white/20 p-2"
          />
          <datalist id="all-skills-options">
            {allSkills.map((allSkill: any) => (
              <option key={allSkill.id} value={allSkill.name} />
            ))}
          </datalist>
          <button
            onClick={handleAddPortfolioSkill}
            className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
            disabled={!selectedAllSkillNameInput.trim()}
          >
            Assign to portfolio_skills
          </button>
        </div>

        <div className="space-y-2">
          {skills.map((skill: any, index: number) => (
            <div
              key={skill.id}
              className="border border-white/10 p-2 cursor-pointer hover:border-white/40"
              onClick={() => setSelectedPortfolioSkill({ ...skill, index })}
            >
              <div>
                <div>{skill.label}</div>
                <div className="text-xs text-white/50">Group: {skill.groupingName || "None"}</div>
              </div>
            </div>
          ))}
          {skills.length === 0 && <div className="text-sm text-white/40 italic">No portfolio_skills assignments</div>}
        </div>
      </div>

      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedGroup && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedGroup.name}</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-white/70">skills_group detail</div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    const nextName = groupEditNameInput.trim();
                    if (!nextName || nextName === selectedGroup.name) return;
                    updateSkillGroup.mutate({ id: selectedGroup.id, name: nextName });
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    deleteSkillGroup.mutate(selectedGroup.id);
                    setSelectedGroup(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Delete
                </button>
              </div>
              <input
                value={groupEditNameInput}
                onChange={(e) => setGroupEditNameInput(e.target.value)}
                placeholder="Edit group name"
                className="bg-black/60 border border-white/20 p-2"
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAllSkill} onOpenChange={(open) => !open && setSelectedAllSkill(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedAllSkill && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedAllSkill.name}</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-white/80">Group: {selectedAllSkill.groupingName || "None"}</div>
              <input
                value={allSkillEditNameInput}
                onChange={(e) => setAllSkillEditNameInput(e.target.value)}
                placeholder="Edit all_skill name"
                className="bg-black/60 border border-white/20 p-2"
              />
              <input
                list="skills-group-options"
                value={allSkillEditGroupingNameInput}
                onChange={(e) => setAllSkillEditGroupingNameInput(e.target.value)}
                placeholder="Edit group name (autocomplete)"
                className="bg-black/60 border border-white/20 p-2"
              />
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    const nextName = allSkillEditNameInput.trim();
                    if (!nextName) {
                      setErrorDialog({ open: true, title: "Invalid all_skill", message: "all_skill name is required." });
                      return;
                    }
                    const nextGroupingId = resolveGroupIdByName(allSkillEditGroupingNameInput);
                    if (allSkillEditGroupingNameInput.trim() && !nextGroupingId) {
                      setErrorDialog({ open: true, title: "Invalid Group", message: "Group must match an existing skills_group name." });
                      return;
                    }
                    updateAllSkill.mutate({
                      id: selectedAllSkill.id,
                      name: nextName,
                      groupingId: nextGroupingId,
                    });
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    deleteAllSkill.mutate(selectedAllSkill.id);
                    setSelectedAllSkill(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPortfolioSkill} onOpenChange={(open) => !open && setSelectedPortfolioSkill(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedPortfolioSkill && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedPortfolioSkill.label}</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-white/80">Group: {selectedPortfolioSkill.groupingName || "None"}</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  disabled={selectedPortfolioSkill.index === 0}
                  onClick={() => {
                    const order = [...skillOrderIds];
                    const index = selectedPortfolioSkill.index;
                    [order[index - 1], order[index]] = [order[index], order[index - 1]];
                    reorderPortfolioSkills.mutate(order);
                    setSelectedPortfolioSkill(null);
                  }}
                  className="px-3 py-1 border border-white/20 disabled:opacity-40"
                >
                  Move Up
                </button>
                <button
                  disabled={selectedPortfolioSkill.index === skills.length - 1}
                  onClick={() => {
                    const order = [...skillOrderIds];
                    const index = selectedPortfolioSkill.index;
                    [order[index + 1], order[index]] = [order[index], order[index + 1]];
                    reorderPortfolioSkills.mutate(order);
                    setSelectedPortfolioSkill(null);
                  }}
                  className="px-3 py-1 border border-white/20 disabled:opacity-40"
                >
                  Move Down
                </button>
                <button
                  onClick={() => {
                    deletePortfolioSkill.mutate(selectedPortfolioSkill.id);
                    setSelectedPortfolioSkill(null);
                  }}
                  className="px-3 py-1 border border-white/20"
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="w-[95vw] max-w-lg bg-black text-white border-white/20">
          <DialogHeader>
            <DialogTitle>{errorDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-white/80">{errorDialog.message}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
