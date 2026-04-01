/**
 * Generates a preview SVG of the business card dog-ear corner.
 * Run: node scripts/generate-dogear-preview.mjs
 * Output: preview/dogear-preview.svg
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "preview");
const outFile = join(outDir, "dogear-preview.svg");

mkdirSync(outDir, { recursive: true });

const W = 340;
const H = 640;
const r = 16; // card border radius
const FOLD = 36; // dog-ear fold size

// Colors
const BG = "#0B0C10";
const FOLD_BG = "#1e2028";
const CYAN = "#00FFFF";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Card clip (rounded rect) -->
    <clipPath id="card-clip">
      <rect width="${W}" height="${H}" rx="${r}" ry="${r}" />
    </clipPath>

    <!-- Top shimmer gradient -->
    <linearGradient id="shimmer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>

    <!-- Divider gradient -->
    <linearGradient id="divider" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="50%" stop-color="white" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>

    <!-- Dog-ear crease gradient (135deg diagonal) -->
    <linearGradient id="crease" x1="0" y1="0" x2="1" y2="1">
      <stop offset="40%" stop-color="${CYAN}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${CYAN}" stop-opacity="0.25"/>
      <stop offset="55%" stop-color="${CYAN}" stop-opacity="0.08"/>
      <stop offset="65%" stop-color="${CYAN}" stop-opacity="0"/>
    </linearGradient>

    <!-- Headshot clip -->
    <clipPath id="headshot-clip">
      <circle cx="${W / 2}" cy="156" r="88" />
    </clipPath>

    <!-- Dog-ear drop shadow filter -->
    <filter id="fold-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="-2" dy="-2" stdDeviation="2" flood-color="${CYAN}" flood-opacity="0.18"/>
    </filter>
  </defs>

  <!-- Card background -->
  <rect width="${W}" height="${H}" rx="${r}" ry="${r}" fill="${BG}" />

  <!-- Card border -->
  <rect width="${W}" height="${H}" rx="${r}" ry="${r}" fill="none" stroke="white" stroke-opacity="0.06" stroke-width="1"/>

  <g clip-path="url(#card-clip)">

    <!-- Top shimmer overlay -->
    <rect width="${W}" height="160" fill="url(#shimmer)" />

    <!-- Headshot circle bg -->
    <circle cx="${W / 2}" cy="156" r="88" fill="none"
      stroke="${CYAN}" stroke-opacity="0.3" stroke-width="2"
    />
    <!-- Headshot placeholder -->
    <circle cx="${W / 2}" cy="156" r="87" fill="#16181f" />
    <!-- Headshot inner glow -->
    <circle cx="${W / 2}" cy="156" r="88"
      fill="none"
      stroke="${CYAN}"
      stroke-opacity="0.15"
      stroke-width="16"
    />

    <!-- Silhouette placeholder -->
    <circle cx="${W / 2}" cy="140" r="32" fill="#2a2d38" />
    <ellipse cx="${W / 2}" cy="196" rx="52" ry="34" fill="#2a2d38" />

    <!-- Name -->
    <text
      x="${W / 2}" y="298"
      text-anchor="middle"
      font-family="'Arial', sans-serif"
      font-weight="600"
      font-size="20"
      letter-spacing="2"
      fill="white"
      text-decoration="none"
    >MATTHEW TUJAGUE</text>

    <!-- Title -->
    <text
      x="${W / 2}" y="320"
      text-anchor="middle"
      font-family="'Arial', sans-serif"
      font-weight="300"
      font-size="9"
      letter-spacing="3"
      fill="#e2e2e2"
    >SOFTWARE ENGINEER</text>

    <!-- Location -->
    <text
      x="${W / 2}" y="336"
      text-anchor="middle"
      font-family="'Arial', sans-serif"
      font-weight="300"
      font-size="8"
      letter-spacing="2"
      fill="${CYAN}"
      fill-opacity="0.8"
    >NJ · NY · PA</text>

    <!-- Divider full -->
    <rect x="${W * 0.1}" y="350" width="${W * 0.8}" height="1" fill="url(#divider)" />
    <!-- Divider cyan accent -->
    <rect x="${W * 0.375}" y="350" width="${W * 0.25}" height="1" fill="${CYAN}" opacity="0.9"/>
    <!-- Divider glow -->
    <rect x="${W * 0.375}" y="349" width="${W * 0.25}" height="3" fill="${CYAN}" opacity="0.15"/>

    <!-- Contact rows -->
    <!-- Phone icon placeholder -->
    <circle cx="96" cy="396" r="6" fill="${CYAN}" fill-opacity="0.18" />
    <text x="96" y="400" text-anchor="middle" font-family="Arial" font-size="8" fill="${CYAN}" fill-opacity="0.7">☎</text>
    <text x="116" y="400" font-family="'Arial'" font-size="10" letter-spacing="2" fill="#ccc">(732) 639-3889</text>

    <!-- Mail -->
    <text x="96" y="422" text-anchor="middle" font-family="Arial" font-size="8" fill="${CYAN}" fill-opacity="0.7">✉</text>
    <text x="116" y="422" font-family="'Arial'" font-size="10" letter-spacing="2" fill="#ccc">matthew@2jog.dev</text>

    <!-- Globe -->
    <text x="96" y="444" text-anchor="middle" font-family="Arial" font-size="8" fill="${CYAN}" fill-opacity="0.7">⊕</text>
    <text x="116" y="444" font-family="'Arial'" font-size="10" letter-spacing="2" fill="#ccc">2jog.dev</text>

    <!-- ── Dog-ear fold (bottom-right) ── -->
    <!-- Flap triangle: points from (W-FOLD, H) to (W, H) to (W, H-FOLD) -->
    <polygon
      points="${W - FOLD},${H} ${W},${H} ${W},${H - FOLD}"
      fill="${FOLD_BG}"
      filter="url(#fold-shadow)"
    />
    <!-- Crease overlay -->
    <rect
      x="${W - FOLD}" y="${H - FOLD}"
      width="${FOLD}" height="${FOLD}"
      fill="url(#crease)"
    />
    <!-- Crease line (diagonal) -->
    <line
      x1="${W - FOLD}" y1="${H}"
      x2="${W}" y2="${H - FOLD}"
      stroke="${CYAN}" stroke-opacity="0.3" stroke-width="0.75"
    />

  </g>
</svg>`;

writeFileSync(outFile, svg, "utf8");
console.log(`Written: ${outFile}`);
