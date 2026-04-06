import { Tool, type ToolDefinition } from "../tool";
import { db } from "../../db";
import { projects, xyzBullets } from "../../../shared/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Lets the agent fetch the full project row on-demand rather than
 * stuffing everything into the system prompt up front.
 * Returns: all project columns + bullet points.
 */
export class ProjectContextTool extends Tool {
  readonly name = "get_project_details";
  readonly definition: ToolDefinition = {
    name: this.name,
    description:
      "Retrieve the full details of a portfolio project by its ID, including title, description, long description, tech stack, GitHub URL, deployed URL, and all bullet points. Call this at the start of a conversation to load full project context.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project to fetch",
        },
      },
      required: ["project_id"],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const projectId = String(args.project_id);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return JSON.stringify({ error: `Project '${projectId}' not found` });
    }

    const bullets = await db
      .select()
      .from(xyzBullets)
      .where(eq(xyzBullets.projectId, projectId));

    return JSON.stringify({
      id: project.id,
      title: project.title,
      category: project.category,
      description: project.description,
      longDescription: project.longDescription,
      tech: project.tech,
      githubUrl: project.githubUrl,
      deployedUrl: project.deployedUrl,
      bullets: bullets.map((b) => b.bulletText),
    });
  }
}
