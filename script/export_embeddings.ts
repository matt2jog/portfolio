import dotenv from "dotenv";
dotenv.config();

import { db } from "../server/db.js";
import { allSkills } from "../shared/schema.js";
import { isNotNull } from "drizzle-orm";
import fs from "fs";

async function run() {
  const skills = await db.select().from(allSkills).where(isNotNull(allSkills.embedding));
  
  const data = skills.map(s => ({
    id: s.id,
    name: s.name,
    embedding: s.embedding,
    groupingId: s.groupingId
  }));

  fs.writeFileSync("script/skills_vectors.json", JSON.stringify(data, null, 2));
  console.log(`Exported ${data.length} skills to script/skills_vectors.json`);
}

run().catch(console.error);