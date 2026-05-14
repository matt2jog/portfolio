import LegalDocLayout from "@/components/LegalDocLayout";

export default function Terms() {
  return <LegalDocLayout fetchPath="/api/legal/terms" title="Terms of Use" />;
}
