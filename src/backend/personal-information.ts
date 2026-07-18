export interface PersonalInformationRecord {
  name: string;
  title: string;
  location: string;
  shortBio: string;
  email: string;
  phone: string;
  phoneFormatted: string;
  linkedinUrl: string;
  githubUrl: string;
  devpostUrl: string;
  portfolioUrl: string;
}

export interface ChatOwnerContext {
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

type ChatOwnerSource = Pick<
  PersonalInformationRecord,
  "name" | "email" | "phone" | "linkedinUrl" | "githubUrl" | "portfolioUrl"
>;

export function buildPublicPersonalInformationResponse<T>(
  row: T | null | undefined,
): T | null {
  return row ?? null;
}

export function buildChatOwnerContext(
  row: ChatOwnerSource | null | undefined,
): ChatOwnerContext | null {
  if (!row) return null;

  const values = [row.name, row.email, row.phone, row.linkedinUrl, row.githubUrl, row.portfolioUrl];
  if (values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    return null;
  }

  return {
    name: row.name.trim(),
    email: row.email.trim(),
    phone: row.phone.trim(),
    linkedinUrl: row.linkedinUrl.trim(),
    githubUrl: row.githubUrl.trim(),
    portfolioUrl: row.portfolioUrl.trim(),
  };
}
