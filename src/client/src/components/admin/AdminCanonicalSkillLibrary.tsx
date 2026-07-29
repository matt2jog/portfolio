import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SkillGroupOption = {
  id: string;
  name: string;
};

export type CanonicalSkill = {
  id: string;
  name: string;
  groupingId: string | null;
  groupingName: string | null;
  portfolioReferences: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function AdminCanonicalSkillLibrary({
  groups,
  skills,
  onChanged,
}: {
  groups: SkillGroupOption[];
  skills: CanonicalSkill[];
  onChanged: () => Promise<unknown>;
}) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroupingId, setNewGroupingId] = useState("");
  const [editing, setEditing] = useState<CanonicalSkill | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGroupingId, setEditingGroupingId] = useState("");
  const [deleting, setDeleting] = useState<CanonicalSkill | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) => (
      `${skill.name} ${skill.groupingName ?? ""}`.toLocaleLowerCase().includes(needle)
    ));
  }, [search, skills]);

  const createSkill = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/all-skills", {
      name: newName.trim(),
      groupingId: newGroupingId || null,
    }),
    onSuccess: async () => {
      setNewName("");
      setNewGroupingId("");
      await onChanged();
      toast({ title: "Skill added to the shared library" });
    },
    onError: (error) => toast({
      title: "Could not add skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const updateSkill = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/all-skills/${editing!.id}`, {
      name: editingName.trim(),
      groupingId: editingGroupingId || null,
    }),
    onSuccess: async () => {
      setEditing(null);
      await onChanged();
      toast({ title: "Shared skill updated" });
    },
    onError: (error) => toast({
      title: "Could not update skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  const deleteSkill = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/all-skills/${deleting!.id}`),
    onSuccess: async () => {
      setDeleting(null);
      await onChanged();
      toast({ title: "Unused skill deleted" });
    },
    onError: (error) => toast({
      title: "Could not delete skill",
      description: getErrorMessage(error),
      variant: "destructive",
    }),
  });

  return (
    <section className="space-y-4 border border-white/10 bg-white/[0.02] p-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Shared skill library</h3>
        <p className="text-sm leading-6 text-white/55">
          These names are suggestions for both Portfolio and Resume. Deleting a skill is
          blocked while either service still uses it.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim()) createSkill.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="new-canonical-skill">Skill name</Label>
          <Input
            id="new-canonical-skill"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g. Cloud Run"
            maxLength={120}
            className="h-11 bg-black/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-canonical-group">Suggested group</Label>
          <select
            id="new-canonical-group"
            value={newGroupingId}
            onChange={(event) => setNewGroupingId(event.target.value)}
            className="min-h-11 w-full border border-white/20 bg-black px-3 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:text-sm"
          >
            <option value="">No suggested group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          className="min-h-11 self-end"
          disabled={!newName.trim() || createSkill.isPending}
        >
          <Plus aria-hidden="true" />
          Add skill
        </Button>
      </form>

      <div className="space-y-2">
        <Label htmlFor="canonical-skill-search">Find a skill</Label>
        <Input
          id="canonical-skill-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by skill or suggested group"
          className="h-11 bg-black/50"
        />
      </div>

      <div className="max-h-80 overflow-y-auto border border-white/10">
        {filtered.map((skill) => (
          <div
            key={skill.id}
            className="flex min-h-14 items-center gap-3 border-b border-white/10 px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{skill.name}</p>
              <p className="truncate text-xs text-white/45">
                {skill.groupingName ?? "No suggested group"}
                {skill.portfolioReferences > 0
                  ? ` · visible in Portfolio`
                  : " · not visible in Portfolio"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label={`Edit ${skill.name}`}
              onClick={() => {
                setEditing(skill);
                setEditingName(skill.name);
                setEditingGroupingId(skill.groupingId ?? "");
              }}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 text-red-300"
              aria-label={`Delete ${skill.name}`}
              disabled={skill.portfolioReferences > 0}
              title={skill.portfolioReferences > 0
                ? "Remove this skill from the Portfolio map first"
                : "Delete unused skill"}
              onClick={() => setDeleting(skill)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="p-4 text-sm italic text-white/40">No matching skills.</p>
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-white/20 bg-black text-white">
          <DialogHeader>
            <DialogTitle>Edit shared skill</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (editing && editingName.trim()) updateSkill.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-canonical-skill">Skill name</Label>
              <Input
                id="edit-canonical-skill"
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                maxLength={120}
                className="h-11 bg-black/50"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-canonical-group">Suggested group</Label>
              <select
                id="edit-canonical-group"
                value={editingGroupingId}
                onChange={(event) => setEditingGroupingId(event.target.value)}
                className="min-h-11 w-full border border-white/20 bg-black px-3 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:text-sm"
              >
                <option value="">No suggested group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editingName.trim() || updateSkill.isPending}>
                Save skill
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] border-white/20 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes an unused shared skill. If a Resume still uses it,
              the database will reject the deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-red-600 text-white"
              onClick={() => deleting && deleteSkill.mutate()}
            >
              Delete unused skill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
