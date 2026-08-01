import type { RequestHandler } from "express";

export const canonicalCareerMutationRejected: RequestHandler = (_req, res) =>
  res.status(409).json({
    code: "CANONICAL_CAREER_READ_ONLY",
    message: "Canonical career data is managed by Admin Dashboard.",
    authority: "https://admin.2jog.dev",
  });
