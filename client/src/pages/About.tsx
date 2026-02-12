import { Navbar } from "@/components/Navbar";
import { useQuery } from "@tanstack/react-query";

export default function About() {
  const bioQuery = useQuery({ queryKey: ["/api/public/bio"] });
  const bio = bioQuery.data || { headline: "", description: "", paragraph: "" };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-24 w-full">
        <div className="relative bg-card border border-white/6 rounded-lg p-8">
          <div className="flex items-start justify-between mb-6">
            <h1 className="text-4xl font-display font-bold">2jog.about</h1>
            <span className="px-2 py-1 text-xs font-mono rounded bg-primary/10 text-primary border border-primary/20">WIP</span>
          </div>

          <h2 className="text-2xl font-semibold mb-3">{bio.headline || "MATTHEW TUJAGUE"}</h2>
          <p className="text-gray-300 mb-4 whitespace-pre-line">{bio.description}</p>
          <p className="text-gray-500 font-mono">{bio.paragraph}</p>
        </div>
      </main>
    </div>
  );
}
