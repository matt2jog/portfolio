import { db } from "../server/db";
import { experiences } from "../shared/schema";

const mockExperiences = [
  {
    role: "Lead Software Engineer",
    company: "Tech Corp",
    location: "New York, NY",
    duration: "2022 - Present",
    description: "Led development of scalable microservices and implemented CI/CD pipelines. Mentored junior developers and established code quality standards across the engineering department.",
    technologies: ["React", "Node.js", "Docker", "AWS"],
    isActive: true,
    position: 0,
  },
  {
    role: "Senior Frontend Developer",
    company: "Design Studio",
    location: "Remote",
    duration: "2020 - 2022",
    description: "Architected modern frontend applications focusing on performance and accessible UI/UX. Collaborated closely with design team to implement pixel-perfect user interfaces.",
    technologies: ["TypeScript", "Next.js", "Tailwind CSS"],
    isActive: false,
    position: 1,
  },
  {
    role: "Full Stack Engineer",
    company: "Startup Inc",
    location: "San Francisco, CA",
    duration: "2018 - 2020",
    description: "Built end-to-end features for a fast-growing SaaS platform. Integrated third-party APIs and optimized database queries for improved performance.",
    technologies: ["Vue.js", "Python", "PostgreSQL"],
    isActive: false,
    position: 2,
  }
];

async function seed() {
  console.log("Seeding experiences table...");
  try {
    const existing = await db.select().from(experiences);
    if (existing.length > 0) {
      console.log("Experiences table already populated. Skipping seed.");
      return;
    }
    await db.insert(experiences).values(mockExperiences);
    console.log("Successfully seeded experiences!");
  } catch (error) {
    console.error("Failed to seed experiences:", error);
  }
}

seed().catch(console.error);
