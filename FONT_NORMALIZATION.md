# Font Normalization Options

## Current State

Three fonts defined in `index.css`:
- **`font-sans`** (Inter) — body default via `<body>`
- **`font-display`** (Space Grotesk) — auto-applied to all `h1-h6` via base layer
- **`font-mono`** (JetBrains Mono) — used ad-hoc for technical/meta text

**Problems:** redundant `font-display` on headings that already inherit it, redundant `font-sans` on body elements, inconsistent weights (`font-bold` vs `font-semibold` vs `font-extrabold` on same-level headings), arbitrary pixel sizes (`text-[9px]`, `text-[11px]`) mixed with Tailwind scale, inconsistent tracking values, and `text-gray-100` vs `text-foreground` on page roots.

---

## Option 1 — Strict Cleanup (minimal visual change)

Strip redundancy, normalize weights, keep all current font assignments. No font role changes — just consistency.

| What | Before | After |
|------|--------|-------|
| `font-display` on `<h1>`–`<h6>` | Explicit everywhere | Remove (base layer handles it) |
| `font-sans` on non-heading elements | Explicit in ~15 places | Remove (body handles it) |
| Page heading weight | Mixed `bold`/`extrabold` | All `font-bold` |
| Card title weight | Mixed `bold`/`semibold` | All `font-semibold` |
| Page root text color | `text-gray-100` / `text-foreground` | All `text-foreground` |
| Arbitrary sizes | Keep as-is | Keep as-is (intentional per-component sizing) |
| Tracking | Keep as-is | Keep as-is |

**Impact:** Near-zero visual change. Tree.tsx h1 drops from `extrabold` to `bold`. Cleaned-up class strings. ~40 edits across ~12 files.

---

## Option 2 — Unified Scale (moderate visual refinement)

Everything from Option 1, plus consolidate arbitrary font sizes into a reduced set and standardize tracking on mono labels.

| What | Before | After |
|------|--------|-------|
| All of Option 1 | ✓ | ✓ |
| `text-[7.5px]` | SkillsMarquee | `text-[8px]` |
| `text-[9px]` | BusinessCard3D, BlueprintCard | `text-[10px]` |
| `text-[10px]` | Various | Keep `text-[10px]` (smallest allowed) |
| `text-[11px]` | Various | `text-xs` (12px) |
| `text-[13px]` | TimelineDesktop | `text-xs` (12px) |
| Mono label tracking | `tracking-wide`/`wider`/`widest`/`[0.2em]` | All `tracking-wider` |
| Uppercase label pattern | Inconsistent | All mono labels: `font-mono text-[10px] tracking-wider uppercase` or `font-mono text-xs tracking-wider uppercase` |

**Impact:** Slight size bumps on some small text. More uniform label appearance across pages. ~55 edits.

---

## Option 3 — Full Redesign (visible change)

Everything from Options 1+2, plus rethink the font role assignments and enforce a strict type scale.

| What | Before | After |
|------|--------|-------|
| All of Options 1+2 | ✓ | ✓ |
| Hero `font-display` h1 | `text-6xl md:text-8xl lg:text-9xl` | `text-5xl md:text-7xl lg:text-8xl` (less extreme) |
| All non-heading `font-display` | Used on divs/spans (year pills, BlueprintCard titles, stat values) | Move to `font-sans font-bold` — reserve `font-display` strictly for semantic headings |
| Body text leading | Mixed `leading-relaxed`/`leading-7`/`leading-8` | Standardize to `leading-relaxed` everywhere |
| Footer/Navbar mono links | Separate sizing per breakpoint | Uniform `text-xs tracking-wider` |
| BusinessCard subtitle | `font-light` | `font-normal` (light weight not loaded, browser fakes it) |
| Add CSS custom utility | — | `.label-mono { @apply font-mono text-[10px] tracking-wider uppercase }` |

**Impact:** Noticeable visual changes. Display font becomes heading-exclusive. More typographic discipline. ~70 edits.
