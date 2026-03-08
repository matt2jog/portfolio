import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface BioFormState {
  headline: string;
  description: string;
  paragraph: string;
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
    description: "",
    paragraph: "",
  });

  useEffect(() => {
    const bioData = bioQuery.data as any;
    if (bioData) {
      setBioForm({
        headline: bioData.headline || "",
        description: bioData.description || "",
        paragraph: bioData.paragraph || "",
      });
    }
  }, [bioQuery.data]);

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

  const versions = Array.isArray(bioVersionsQuery.data) ? bioVersionsQuery.data : [];

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

      <div className="space-y-3 border border-white/10 p-4">
        <h3 className="text-lg font-semibold">Bio History ({versions.length})</h3>
        <div className="space-y-2">
          {versions.map((version: any, index: number) => (
            <div key={version.id} className="border border-white/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm text-white/60 mb-2">
                    Version {versions.length - index} • Created: {new Date(version.createdAt).toLocaleString()}
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
          {versions.length === 0 && <div className="text-sm text-white/40 italic">No bio versions</div>}
        </div>
      </div>
    </section>
  );
}
