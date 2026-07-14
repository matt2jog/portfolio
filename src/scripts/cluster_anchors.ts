import fs from "fs";
import dotenv from "dotenv";
import { isNotNull } from "drizzle-orm";
import { assertProductionMutationAllowed } from "./production-execution-guard";

dotenv.config();

const FIREWORKS_TOKEN = process.env.FIREWORKS_AI_TOKEN;
const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

const categories = [
  { id: "languages", prompt: "A syntax-defined programming language like Python, C++, JavaScript, TypeScript, Java, Rust, or C, HTML, CSS" },
  { id: "frameworks", prompt: "A software framework, library, programming toolkit, or API wrapper like React, Node.js, Next.js, FastAPI, Tailwind, Flask" },
  { id: "AI/ML", prompt: "Artificial Intelligence, Machine Learning, embeddings, LLMs, data science, algorithms, neural networks, like LangChain, K-Means, XGBoost, Recommendation Algorithms, RAG, BERT" },
  { id: "infrastructure", prompt: "Cloud infrastructure, server hosting, networking, embedded systems, OS, hardware, or physical systems like AWS, GCP, Linux, Windows, macOS, Kubernetes, Docker, Ardupilot, GKE" },
  { id: "data & messaging", prompt: "A database system, data storage, message broker, event streaming, or big data processing tool like SQL, PostgreSQL, Hadoop, Kafka, PubSub, TimeScaleDB, Firestore" },
  { id: "tools & devops", prompt: "A development tool, IDE, terminal utility, version control, CI/CD pipeline, testing or software tool like VS Code, Git, Vim, GitHub Apps, Bash, Selenium, Wireshark, Docker Compose" },
  { id: "technology types", prompt: "A type/category of technology, for example 'wearable tech', 'health tech', 'vr/ar', or even 'blockchain technology'"}
];

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function run() {
  assertProductionMutationAllowed(process.env, "Skill clustering");
  const [{ db }, { allSkills }] = await Promise.all([
    import("../backend/data/db.js"),
    import("../shared/schema.js"),
  ]);
  console.log("Fetching embeddings for anchor categories...");
  const res = await fetch("https://api.fireworks.ai/inference/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIREWORKS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: categories.map(c => c.prompt)
    })
  });

  if (!res.ok) {
    console.error("Failed to fetch category embeddings:", await res.text());
    return;
  }

  const data = await res.json();
  const categoryEmbeddings = data.data.map((d: any, i: number) => ({
    ...categories[i],
    embedding: d.embedding
  }));

  console.log("Loading skill vectors from database...");
  const skills = await db.select().from(allSkills).where(isNotNull(allSkills.embedding));

  const communities: Record<string, { community_id: string, name: string, skills: any[] }> = {};
  for (const cat of categories) {
    let friendlyName = cat.id;
    if (friendlyName === "data & messaging") friendlyName = "Data & Messaging";
    else if (friendlyName === "tools & devops") friendlyName = "Tools & DevOps";
    else if (friendlyName === "languages" || friendlyName === "frameworks" || friendlyName === "infrastructure") {
        friendlyName = friendlyName.charAt(0).toUpperCase() + friendlyName.slice(1);
    }
    else if (friendlyName === "AI/ML") {
        friendlyName = "AI/ML";
    }
    else if (friendlyName === "technology types") {
        friendlyName = "Tech Domains"
    }

    communities[cat.id] = { community_id: cat.id, name: friendlyName, skills: [] };
  }

  console.log("Assigning skills to closest category anchor...");
  for (const skill of skills) {
    let bestCategory = null;
    let maxSim = -Infinity;

    const skillEmb = typeof skill.embedding === 'string' ? JSON.parse(skill.embedding) : skill.embedding;

    for (const cat of categoryEmbeddings) {
      const sim = cosineSimilarity(skillEmb, cat.embedding);
      if (sim > maxSim) {
        maxSim = sim;
        bestCategory = cat.id;
      }
    }
    communities[bestCategory!].skills.push({ id: skill.id, name: skill.name, similarity: maxSim.toFixed(3) });
  }

  for (const catId of Object.keys(communities)) {
    communities[catId].skills.sort((a, b) => b.similarity - a.similarity);
  }

  const output = Object.values(communities);
  
  fs.writeFileSync("script/skill_communities_anchored.json", JSON.stringify(output, null, 2));
  
  for (const group of output) {
    console.log(`\n=== ${group.name} (${group.skills.length} skills) ===`);
    console.log(group.skills.map(s => s.name).join(", "));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
