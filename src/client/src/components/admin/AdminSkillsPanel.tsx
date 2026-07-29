import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SkillGroup = {
  id: string;
  name: string;
  position: number;
};

type CanonicalSkill = {
  id: string;
  name: string;
};

type PortfolioSkill = {
  id: string;
  allSkillId: string;
  groupId: string | null;
  groupingName: string | null;
  label: string;
  position: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

const skillQueryKeys = [
  ["/api/admin/skills"],
  ["/api/admin/skills-groups"],
  ["/api/admin/all-skills"],
  ["/api/public/skills"],
  ["/api/skills-constellation"],
] as const;

function invalidateSkillQueries() {
  return Promise.all(
    skillQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })),
  );
}

export default function AdminSkillsPanel() {
  const skillsQuery = useQuery<PortfolioSkill[]>({ queryKey: ["/api/admin/skills"] });
  const groupsQuery = useQuery<SkillGroup[]>({ queryKey: ["/api/admin/skills-groups"] });
  const canonicalQuery = useQuery<CanonicalSkill[]>({ queryKey: ["/api/admin/all-skills"] });

  const [newGroupName, setNewGroupName] = useState("");
  const [selectedCanonicalId, setSelectedCanonicalId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [editingGroup, setEditingGroup] = useState<SkillGroup | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [deletingGroup, setDeletingGroup] = useState<SkillGroup | null>(null);
  const [removingSkill, setRemovingSkill] = useState<PortfolioSkill | null>(null);

  const groups = useMemo(
    () => Array.isArray(groupsQuery.data) ? groupsQuery.data : [],
    [groupsQuery.data],
  );
  const skills = useMemo(
    () => Array.isArray(skillsQuery.data) ? skillsQuery.data : [],
    [skillsQuery.data],
  );
  const canonicalSkills = useMemo(
    () => Array.isArray(canonicalQuery.data) ? canonicalQuery.data : [],
    [canonicalQuery.data],
  );
  const visibleCanonicalIds = useMemo(
    () => new Set(skills.map((skill) => skill.allSkillId)),
    [skills],
  );
  const availableCanonicalSkills = canonicalSkills.filter(
    (skill) => !visibleCanonicalIds.has(skill.id),
  );
  const skillsByGroup = useMemo(() => {
    const result = new Map<string, PortfolioSkill[]>();
    for (const group of groups) result.set(group.id, []);
    for (const skill of skills) {
      const groupId = skill.groupId ?? "";
      if (!result.has(groupId)) result.set(groupId, []);
      result.get(groupId)!.push(skill);
    }
    for (const groupSkills of Array.from(result.values())) {
      groupSkills.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
    }
    return result;
  }, [groups, skills]);

  const createGroup = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/skills-groups", { name: newGroupName.trim() }),
    onSuccess: async () => {
      setNewGroupName("");
      await invalidateSkillQueries();
      toast({ title: "Display group created" });
    },
    onError: (error) => toast({
      title: "Could not create group",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest("PUT", `/api/admin/skills-groups/${id}`, { name }),
    onSuccess: async () => {
      setEditingGroup(null);
      await invalidateSkillQueries();
      toast({ title: "Display group renamed" });
    },
    onError: (error) => toast({
      title: "Could not rename group",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/skills-groups/${id}`),
    onSuccess: async () => {
      setDeletingGroup(null);
      await invalidateSkillQueries();
      toast({ title: "Empty display group deleted" });
    },
    onError: (error) => toast({
      title: "Could not delete group",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const reorderGroups = useMutation({
    mutationFn: (order: string[]) =>
      apiRequest("POST", "/api/admin/skills-groups/reorder", { order }),
    onSuccess: invalidateSkillQueries,
    onError: (error) => toast({
      title: "Could not reorder groups",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const addSkill = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/skills", {
      allSkillId: selectedCanonicalId,
      groupId: selectedGroupId,
    }),
    onSuccess: async () => {
      setSelectedCanonicalId("");
      await invalidateSkillQueries();
      toast({ title: "Skill added to the public map" });
    },
    onError: (error) => toast({
      title: "Could not add skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const moveSkill = useMutation({
    mutationFn: ({ id, groupId }: { id: string; groupId: string }) =>
      apiRequest("PUT", `/api/admin/skills/${id}`, { groupId }),
    onSuccess: async () => {
      await invalidateSkillQueries();
      toast({ title: "Skill moved" });
    },
    onError: (error) => toast({
      title: "Could not move skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const reorderSkills = useMutation({
    mutationFn: (order: string[]) => apiRequest("POST", "/api/admin/skills/reorder", { order }),
    onSuccess: invalidateSkillQueries,
    onError: (error) => toast({
      title: "Could not reorder skills",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const removeSkill = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/skills/${id}`),
    onSuccess: async () => {
      setRemovingSkill(null);
      await invalidateSkillQueries();
      toast({ title: "Skill removed from the public map" });
    },
    onError: (error) => toast({
      title: "Could not remove skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const handleGroupStep = (index: number, direction: 1 | -1) => {
    const order = groups.map((group) => group.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    reorderGroups.mutate(order);
  };

  const handleSkillStep = (groupSkills: PortfolioSkill[], index: number, direction: 1 | -1) => {
    const target = index + direction;
    if (target < 0 || target >= groupSkills.length) return;
    const groupOrder = groupSkills.map((skill) => skill.id);
    [groupOrder[index], groupOrder[target]] = [groupOrder[target], groupOrder[index]];
    const otherIds = skills
      .map((skill) => skill.id)
      .filter((id) => !groupOrder.includes(id));
    reorderSkills.mutate([...groupOrder, ...otherIds]);
  };

  const isLoading = skillsQuery.isLoading || groupsQuery.isLoading || canonicalQuery.isLoading;

  return (
    <section data-testid="admin-skills-panel" className="space-y-6 border border-white/10 p-4 sm:p-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300/75">Public skill map</p>
        <h2 className="text-2xl font-semibold">Curate what visitors see</h2>
        <p className="max-w-[70ch] text-sm leading-6 text-white/65">
          Portfolio owns display groups, visible skills, and their order. Canonical skill names stay
          managed in Admin Dashboard so Portfolio and Resume share one spelling.
        </p>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse border border-white/10 bg-white/[0.03]" role="status">
          <span className="sr-only">Loading skill presentation</span>
        </div>
      ) : (
        <>
          <div className="grid gap-4 border border-white/10 bg-white/[0.02] p-4 lg:grid-cols-2">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (newGroupName.trim()) createGroup.mutate();
              }}
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Display groups</h3>
                <p className="text-sm text-white/55">Six clear disciplines work better than numbered overflow groups.</p>
              </div>
              <Label htmlFor="new-skill-group">New group name</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="new-skill-group"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="e.g. Tools & DevOps"
                  maxLength={80}
                  className="h-11 bg-black/50"
                />
                <Button
                  type="submit"
                  className="min-h-11 shrink-0"
                  disabled={!newGroupName.trim() || createGroup.isPending}
                >
                  <Plus aria-hidden="true" />
                  Add group
                </Button>
              </div>
            </form>

            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (selectedCanonicalId && selectedGroupId) addSkill.mutate();
              }}
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Add a visible skill</h3>
                <p className="text-sm text-white/55">Choose a shared canonical skill, then its Portfolio display group.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="canonical-skill">Skill</Label>
                  <select
                    id="canonical-skill"
                    value={selectedCanonicalId}
                    onChange={(event) => setSelectedCanonicalId(event.target.value)}
                    className="min-h-11 w-full border border-white/20 bg-black px-3 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:text-sm"
                  >
                    <option value="">Choose a skill</option>
                    {availableCanonicalSkills.map((skill) => (
                      <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skill-display-group">Display group</Label>
                  <select
                    id="skill-display-group"
                    value={selectedGroupId}
                    onChange={(event) => setSelectedGroupId(event.target.value)}
                    className="min-h-11 w-full border border-white/20 bg-black px-3 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:text-sm"
                  >
                    <option value="">Choose a group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                type="submit"
                className="min-h-11 self-start"
                disabled={!selectedCanonicalId || !selectedGroupId || addSkill.isPending}
              >
                <Plus aria-hidden="true" />
                Add to map
              </Button>
            </form>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Public order</h3>
                <p className="text-sm text-white/55">Groups and skills appear in this order on the homepage.</p>
              </div>
              <span className="font-mono text-xs text-white/45">{skills.length} visible skills</span>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {groups.map((group, groupIndex) => {
                const groupSkills = skillsByGroup.get(group.id) ?? [];
                return (
                  <article key={group.id} className="min-w-0 overflow-hidden border border-white/10 bg-black/35">
                    <header className="grid min-h-14 grid-cols-4 items-center gap-1 border-b border-white/10 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_repeat(4,2.75rem)]">
                      <div className="col-span-4 min-w-0 sm:col-span-1">
                        <h4 className="truncate font-semibold text-white">{group.name}</h4>
                        <p className="text-xs text-white/45">
                          {groupSkills.length} {groupSkills.length === 1 ? "skill" : "skills"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`Move ${group.name} up`}
                        disabled={groupIndex === 0 || reorderGroups.isPending}
                        onClick={() => handleGroupStep(groupIndex, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`Move ${group.name} down`}
                        disabled={groupIndex === groups.length - 1 || reorderGroups.isPending}
                        onClick={() => handleGroupStep(groupIndex, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`Rename ${group.name}`}
                        onClick={() => {
                          setEditingGroup(group);
                          setEditingGroupName(group.name);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11 text-red-300"
                        aria-label={`Delete ${group.name}`}
                        disabled={groupSkills.length > 0}
                        title={groupSkills.length ? "Move or remove every skill first" : "Delete empty group"}
                        onClick={() => setDeletingGroup(group)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </header>

                    {groupSkills.length ? (
                      <ul className="divide-y divide-white/10">
                        {groupSkills.map((skill, skillIndex) => (
                          <li key={skill.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{skill.label}</span>
                            <div className="grid w-full grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)] items-center gap-1 sm:flex sm:w-auto">
                              <Label htmlFor={`group-${skill.id}`} className="sr-only">Move {skill.label} to group</Label>
                              <select
                                id={`group-${skill.id}`}
                                value={group.id}
                                onChange={(event) => moveSkill.mutate({
                                  id: skill.id,
                                  groupId: event.target.value,
                                })}
                                aria-label={`Display group for ${skill.label}`}
                                className="min-h-11 min-w-0 w-full border border-white/15 bg-black px-2 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:w-52 sm:text-sm"
                              >
                                {groups.map((option) => (
                                  <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11"
                                aria-label={`Move ${skill.label} up`}
                                disabled={skillIndex === 0 || reorderSkills.isPending}
                                onClick={() => handleSkillStep(groupSkills, skillIndex, -1)}
                              >
                                <ArrowUp aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11"
                                aria-label={`Move ${skill.label} down`}
                                disabled={skillIndex === groupSkills.length - 1 || reorderSkills.isPending}
                                onClick={() => handleSkillStep(groupSkills, skillIndex, 1)}
                              >
                                <ArrowDown aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11 text-red-300"
                                aria-label={`Remove ${skill.label} from Portfolio`}
                                onClick={() => setRemovingSkill(skill)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="p-4 text-sm italic text-white/40">No visible skills in this group yet.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(editingGroup)} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-white/20 bg-black text-white">
          <DialogHeader>
            <DialogTitle>Rename display group</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (editingGroup && editingGroupName.trim()) {
                updateGroup.mutate({ id: editingGroup.id, name: editingGroupName.trim() });
              }
            }}
          >
            <Label htmlFor="edit-skill-group">Group name</Label>
            <Input
              id="edit-skill-group"
              value={editingGroupName}
              onChange={(event) => setEditingGroupName(event.target.value)}
              maxLength={80}
              className="h-11 bg-black/50"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditingGroup(null)}>
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={!editingGroupName.trim() || updateGroup.isPending}>
                Save name
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingGroup)} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] border-white/20 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletingGroup?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the empty display group. It does not delete canonical skills.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-red-600 text-white"
              onClick={() => deletingGroup && deleteGroup.mutate(deletingGroup.id)}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(removingSkill)} onOpenChange={(open) => !open && setRemovingSkill(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] border-white/20 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removingSkill?.label}” from Portfolio?</AlertDialogTitle>
            <AlertDialogDescription>
              The canonical skill remains available to Resume and can be added back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-red-600 text-white"
              onClick={() => removingSkill && removeSkill.mutate(removingSkill.id)}
            >
              Remove from map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
