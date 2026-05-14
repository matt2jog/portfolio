import { useQuery } from "@tanstack/react-query";

export interface BioParagraph {
  id: string;
  bioId: string;
  content: string;
  position: number;
}

export interface BioData {
  id: string;
  headline: string;
  paragraphs: BioParagraph[];
}

export function useBio() {
  return useQuery<BioData>({
    queryKey: ["/api/public/bio"],
  });
}
