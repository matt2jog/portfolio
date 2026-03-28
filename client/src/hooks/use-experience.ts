import { useQuery } from "@tanstack/react-query";

export interface Experience {
  id: string;
  role: string;
  company: string;
  location: string;
  duration: string;
  description: string;
  technologies: string[];
  isActive: boolean;
  position: number;
}

export function useExperience() {
  return useQuery<Experience[]>({
    queryKey: ["/api/public/experiences"],
  });
}
