import fs from "fs";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { assertProductionMutationAllowed } from "./production-execution-guard";

dotenv.config();

async function run() {
  assertProductionMutationAllowed(process.env, "Skill-group update");
  const [{ db }, { skillsGroup, allSkills, portfolioSkills }] = await Promise.all([
    import("../backend/data/db.js"),
    import("../shared/schema.js"),
  ]);
  const filePath = "script/skill_communities_anchored.json";
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.log("Please run the clustering script first: npx tsx script/cluster_anchors.ts");
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log(`Loaded ${data.length} communities from JSON.`);

  for (const community of data) {
    console.log(`Processing group: ${community.name} with ${community.skills.length} skills...`);

    // Find or create the skills group
    let group = await db.select().from(skillsGroup).where(eq(skillsGroup.name, community.name)).limit(1);
    let groupId;
    
    if (group.length === 0) {
      const inserted = await db.insert(skillsGroup).values({ name: community.name }).returning();
      groupId = inserted[0].id;
      console.log(`  -> Created new group in DB: ${community.name}`);
    } else {
      groupId = group[0].id;
      console.log(`  -> Found existing group in DB: ${community.name}`);
    }

    // Update all skills in this community
    let updateCount = 0;
    for (const skill of community.skills) {
      await db.update(allSkills)
        .set({ groupingId: groupId })
        .where(eq(allSkills.id, skill.id));
      
      // Ensure the skill is tracked in portfolioSkills
      const existingPortfolioSkill = await db.select().from(portfolioSkills).where(eq(portfolioSkills.allSkillId, skill.id)).limit(1);
      if (existingPortfolioSkill.length === 0) {
        await db.insert(portfolioSkills).values({
          allSkillId: skill.id,
          position: 0,
        });
      }

      updateCount++;
    }
    
    console.log(`  -> Updated ${updateCount} skills to grouping '${community.name}'.\n`);
  }

  // Ensure any other skills in allSkills that somehow weren't in the JSON are also tracked 
  // in portfolioSkills just in case.
  const allExistingSkills = await db.select().from(allSkills);
  let extraAdded = 0;
  for (const skill of allExistingSkills) {
    const existingPortfolioSkill = await db.select().from(portfolioSkills).where(eq(portfolioSkills.allSkillId, skill.id)).limit(1);
    if (existingPortfolioSkill.length === 0) {
      await db.insert(portfolioSkills).values({
        allSkillId: skill.id,
        position: 0,
      });
      extraAdded++;
    }
  }
  
  if (extraAdded > 0) {
    console.log(`Added ${extraAdded} additional skills from all_skills into portfolio_skills that weren't in the JSON.`);
  }

  console.log("Database update complete! All skills have been categorized.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
