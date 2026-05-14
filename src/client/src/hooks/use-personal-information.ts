import { useQuery } from "@tanstack/react-query";

export interface PersonalInformation {
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

export function usePersonalInformation() {
  return useQuery<PersonalInformation>({
    queryKey: ["/api/public/personal-information"],
  });
}
