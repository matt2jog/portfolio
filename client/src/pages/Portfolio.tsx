import { Navbar } from "@/components/Navbar";
import { useQuery } from "@tanstack/react-query";
import { BlueprintCard } from "@/components/BlueprintCard";

export default function Portfolio() {
  const projectsQuery = useQuery({ queryKey: ["/api/public/projects"] });
  const projects = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-24">
        <h1 className="text-4xl font-display font-bold mb-4">2jog.portfolio</h1>
        <p className="text-gray-400 mb-8">Full project catalog — each project gets its own dedicated page and metadata.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.length > 0 ? (
            projects.slice(0, 12).map((p: any) => (
              <BlueprintCard key={p.id ?? p.title} {...p} className="min-h-0" />
            ))
          ) : (
            <div className="text-gray-500">No projects available.</div>
          )}
        </div>
      </main>
    </div>
  );
}
