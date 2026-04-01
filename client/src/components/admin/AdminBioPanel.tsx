import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BioParagraph {
  id: string;
  bioId: string;
  content: string;
  position: number;
}

interface BioRecord {
  id: string;
  headline: string;
  paragraphs: BioParagraph[];
  createdAt: string;
}

interface BioFormState {
  headline: string;
  paragraphs: string[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export default function AdminBioPanel() {
  const bioQuery = useQuery({ queryKey: ["/api/admin/bio"] });
  const bioVersionsQuery = useQuery({ queryKey: ["/api/admin/bio/versions"] });

  const [bioForm, setBioForm] = useState<BioFormState>({
    headline: "",
    paragraphs: [""],
  });
  const [selectedVersion, setSelectedVersion] = useState<(BioRecord & { index: number }) | null>(null);

  useEffect(() => {
    const bioData = bioQuery.data as any;
    if (bioData) {
      const paragraphs = Array.isArray(bioData.paragraphs) && bioData.paragraphs.length > 0
        ? bioData.paragraphs.map((p: any) => p.content)
        : [""];
      setBioForm({
        headline: bioData.headline || "",
        paragraphs,
      });
    }
  }, [bioQuery.data]);

  const saveBio = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/admin/bio", {
        headline: bioForm.headline,
        paragraphs: bioForm.paragraphs.filter((p) => p.trim() !== ""),
      });
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

  const deleteBioVersion = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/bio/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bio/versions"] });
      toast({ title: "Success", description: "Bio version deleted" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: `Bio version delete failed: ${getErrorMessage(error)}`, variant: "destructive" });
    },
  });

  const updateParagraph = (index: number, value: string) => {
    setBioForm((prev) => {
      const updated = [...prev.paragraphs];
      updated[index] = value;
      return { ...prev, paragraphs: updated };
    });
  };

  const addParagraph = () => {
    setBioForm((prev) => ({ ...prev, paragraphs: [...prev.paragraphs, ""] }));
  };

  const removeParagraph = (index: number) => {
    setBioForm((prev) => ({
      ...prev,
      paragraphs: prev.paragraphs.filter((_, i) => i !== index),
    }));
  };

  const moveParagraph = (index: number, direction: -1 | 1) => {
    setBioForm((prev) => {
      const updated = [...prev.paragraphs];
      const target = index + direction;
      if (target < 0 || target >= updated.length) return prev;
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return { ...prev, paragraphs: updated };
    });
  };

  const versions = Array.isArray(bioVersionsQuery.data) ? (bioVersionsQuery.data as BioRecord[]) : [];

  return (
    <section className="space-y-6 border border-white/10 p-4 sm:p-6">
      <h2 className="text-xl font-semibold">Bio CRUD</h2>

      <div className="grid gap-4">
        <input
          value={bioForm.headline}
          onChange={(e) => setBioForm((prev) => ({ ...prev, headline: e.target.value }))}
          placeholder="Headline"
          className="bg-black/60 border border-white/20 p-2"
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-white/60">Paragraphs</label>
            <button
              type="button"
              onClick={addParagraph}
              className="px-3 py-1 text-xs border border-white/20 hover:border-white/60"
            >
              + Add Paragraph
            </button>
          </div>

          {bioForm.paragraphs.map((paragraph, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => moveParagraph(index, -1)}
                  disabled={index === 0}
                  className="px-1.5 py-0.5 text-xs border border-white/20 hover:border-white/60 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveParagraph(index, 1)}
                  disabled={index === bioForm.paragraphs.length - 1}
                  className="px-1.5 py-0.5 text-xs border border-white/20 hover:border-white/60 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-white/40 mb-1">Paragraph {index + 1}</div>
                <textarea
                  value={paragraph}
                  onChange={(e) => updateParagraph(index, e.target.value)}
                  placeholder={`Paragraph ${index + 1}`}
                  className="w-full bg-black/60 border border-white/20 p-2"
                  rows={3}
                />
              </div>
              {bioForm.paragraphs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeParagraph(index)}
                  className="px-2 py-1 text-xs border border-red-500/40 text-red-400 hover:border-red-500/80 shrink-0 mt-5"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => saveBio.mutate()}
        className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
      >
        Save Bio
      </button>

      <div className="space-y-3 border border-white/10 p-4">
        <h3 className="text-lg font-semibold">Bio History ({versions.length})</h3>
        <div className="space-y-2">
          {versions.map((version, index) => (
            <div
              key={version.id}
              className="border border-white/10 p-3 cursor-pointer hover:border-white/40"
              onClick={() => setSelectedVersion({ ...version, index })}
            >
              <div className="text-sm text-white/60 mb-2">
                Version {versions.length - index} • Created: {new Date(version.createdAt).toLocaleString()}
                {index === 0 && <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">Current</span>}
              </div>
              <div className="text-sm">
                <div className="font-semibold">{version.headline}</div>
                <div className="text-white/70 text-xs mt-1">
                  {(version.paragraphs || []).length} paragraph{(version.paragraphs || []).length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          ))}
          {versions.length === 0 && <div className="text-sm text-white/40 italic">No bio versions</div>}
        </div>
      </div>

      <Dialog open={!!selectedVersion} onOpenChange={(open) => !open && setSelectedVersion(null)}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-black text-white border-white/20">
          {selectedVersion && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedVersion.headline || "Bio Version"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-white/80">
                <div>
                  <span className="text-white/50">Created:</span> {new Date(selectedVersion.createdAt).toLocaleString()}
                </div>
                <div>
                  <span className="text-white/50">Paragraphs:</span>
                  <div className="mt-1 space-y-2">
                    {(selectedVersion.paragraphs || []).length > 0 ? (
                      selectedVersion.paragraphs.map((p, i) => (
                        <div key={p.id} className="pl-3 border-l border-white/10">
                          <span className="text-white/40 text-xs">#{i + 1}</span>
                          <div className="whitespace-pre-wrap">{p.content}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-white/40 italic">No paragraphs</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => {
                    restoreBioVersion.mutate(selectedVersion.id);
                    setSelectedVersion(null);
                  }}
                  disabled={selectedVersion.index === 0}
                  className="px-3 py-1 border border-white/20 hover:bg-white/5 disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    deleteBioVersion.mutate(selectedVersion.id);
                    setSelectedVersion(null);
                  }}
                  className="px-3 py-1 border border-white/20 hover:bg-white/5"
                >
                  Delete Version
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
