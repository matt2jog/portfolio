import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import coverage from "istanbul-lib-coverage";
import type { CoverageMapData } from "istanbul-lib-coverage";
import report from "istanbul-lib-report";
import reports from "istanbul-reports";

const { createCoverageMap } = coverage;
const { createContext } = report;

function normalizeCoverageData(data: CoverageMapData): CoverageMapData {
  return Object.fromEntries(
    Object.entries(data).map(([filePath, fileCoverage]) => {
      const normalizedPath = filePath.replaceAll("\\", "/");
      return [
        normalizedPath,
        { ...fileCoverage, path: normalizedPath },
      ];
    }),
  );
}

const threshold = 70;
const coverageRoot = path.resolve(process.cwd(), "coverage", "client");
const rawDirectory = path.join(coverageRoot, "raw");
const unitCoverageFile = path.join(coverageRoot, "unit", "coverage-final.json");
const rawFiles = (await readdir(rawDirectory)).filter((file) => file.endsWith(".json"));

if (rawFiles.length === 0) {
  throw new Error(`No browser coverage files were written to ${rawDirectory}`);
}

const coverageMap = createCoverageMap({});
coverageMap.merge(
  normalizeCoverageData(
    JSON.parse(await readFile(unitCoverageFile, "utf8")) as CoverageMapData,
  ),
);
for (const rawFile of rawFiles) {
  const payload = JSON.parse(
    await readFile(path.join(rawDirectory, rawFile), "utf8"),
  ) as CoverageMapData;
  coverageMap.merge(normalizeCoverageData(payload));
}

if (coverageMap.files().length === 0) {
  throw new Error("The merged browser coverage map contains no application files.");
}

const context = createContext({
  coverageMap,
  dir: path.join(coverageRoot, "report"),
});
reports.create("text").execute(context);
reports.create("json-summary").execute(context);

const summary = coverageMap.getCoverageSummary();
const failures = (
  ["lines", "branches", "functions", "statements"] as const
).filter((metric) => summary[metric].pct < threshold);

if (failures.length > 0) {
  const detail = failures
    .map((metric) => `${metric}=${summary[metric].pct}%`)
    .join(", ");
  throw new Error(`Client coverage must be at least ${threshold}%: ${detail}`);
}
