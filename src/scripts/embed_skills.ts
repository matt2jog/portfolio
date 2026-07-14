import dotenv from "dotenv";
dotenv.config();

import { isNull, eq } from "drizzle-orm";
import { assertProductionMutationAllowed } from "./production-execution-guard";

const FIREWORKS_TOKEN = process.env.FIREWORKS_AI_TOKEN;
const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

async function run() {
  assertProductionMutationAllowed(process.env, "Skill embedding");
  const [{ db }, { allSkills }] = await Promise.all([
    import("../backend/data/db.js"),
    import("../shared/schema.js"),
  ]);
  if (!FIREWORKS_TOKEN) {
    console.error("Missing FIREWORKS_AI_TOKEN");
    return;
  }

  const skills = await db.select().from(allSkills).where(isNull(allSkills.embedding));
  console.log(`Found ${skills.length} skills to embed...`);

  if (skills.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < skills.length; i += batchSize) {
      const batch = skills.slice(i, i + batchSize);
      const inputs = batch.map(s => s.name);
      
      console.log(`Embedding batch ${i / batchSize + 1} / ${Math.ceil(skills.length / batchSize)}`);
      
      const res = await fetch("https://api.fireworks.ai/inference/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${FIREWORKS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: inputs
        })
      });

      if (!res.ok) {
        console.error("Error from Fireworks API:", await res.text());
        return;
      }

      const data = await res.json();
      
      for (let j = 0; j < batch.length; j++) {
        const skill = batch[j];
        const embedding = data.data[j].embedding;
        
        await db.update(allSkills)
          .set({ 
            embedding: embedding,
            embeddingModel: EMBEDDING_MODEL
          })
          .where(eq(allSkills.id, skill.id));
      }
    }
    console.log("Finished embedding all skills.");
  } else {
    console.log("All skills already have an embedding.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
