import { useMemo } from "react";
import { Experience } from "@/hooks/use-experience";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildBackbone, assignSides, assignDepths } from "./timeline/timeline-utils";
import TimelineDesktop from "./timeline/TimelineDesktop";
import TimelineMobile from "./timeline/TimelineMobile";

interface TimelineProps {
  experiences: Experience[];
}

export default function ExperienceTimeline({ experiences }: TimelineProps) {
  const isMobile = useIsMobile();

  const { backbone, parsedExps } = useMemo(
    () => buildBackbone(experiences),
    [experiences]
  );

  const sides = useMemo(
    () => (isMobile ? undefined : assignSides(parsedExps)),
    [isMobile, parsedExps]
  );

  const depths = useMemo(
    () => (isMobile || !sides ? undefined : assignDepths(parsedExps, sides)),
    [isMobile, parsedExps, sides]
  );

  if (backbone.length === 0) return null;

  return isMobile
    ? <TimelineMobile experiences={parsedExps} />
    : <TimelineDesktop backbone={backbone} experiences={parsedExps} sides={sides!} depths={depths!} />;
}
