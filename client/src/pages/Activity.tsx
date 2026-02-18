import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Activity() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4">
        <h1 className="text-4xl font-display font-bold">COMING SOON :)</h1>
      </main>

      <Footer />
    </div>
  );
}
