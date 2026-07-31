import type { RequestHandler } from "express";
import { z } from "zod";

const optionalNullableText = z.string().nullable().optional();

export const projectPresentationUpdateSchema = z
  .object({
    category: z.string().min(1).optional(),
    image: optionalNullableText,
    hoverImage: optionalNullableText,
    aiSystemPrompt: optionalNullableText,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one Portfolio presentation field is required");

export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (databaseError.code === "23503" && databaseError.constraint === constraint) return true;
  const cause = databaseError.cause;
  if (!cause || typeof cause !== "object") return false;
  const databaseCause = cause as { code?: unknown; constraint?: unknown };
  return databaseCause.code === "23503" && databaseCause.constraint === constraint;
}

export const canonicalCareerMutationRejected: RequestHandler = (_req, res) =>
  res.status(409).json({
    code: "CANONICAL_CAREER_READ_ONLY",
    message: "Canonical career data is managed by Admin Dashboard.",
    authority: "https://admin.2jog.dev",
  });
