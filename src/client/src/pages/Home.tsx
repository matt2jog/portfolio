import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary/30">
      <div className="fixed inset-0 grid-pattern opacity-[0.15] pointer-events-none z-0" />
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-primary/5 blur-[80px] rounded-full pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-accent/5 blur-[60px] rounded-full pointer-events-none z-0" />

      <Navbar />

      <main className="relative z-10">
        <Hero />
        <Footer />
      </main>
    </div>
  );
}
