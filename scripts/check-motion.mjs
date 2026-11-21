#!/usr/bin/env node
/**
 * Vambie Motion & Interaction Lint (`npm run check:motion`)
 * Codified via Emil Kowalski's `/learn-taste` & `/animate` rules:
 *  1. No `transition: all` (name exact compositor-safe properties).
 *  2. No UI `ease-in` curves (excludes `ease-in-out`; UI must start responsive).
 *  3. No `scale(0)` entrances (start >= 0.88 with opacity).
 *  4. Foundation motion tokens (`--ease-out`, `--ease-in-out`, `--ease-drawer`) exist in `src/index.css`.
 *  5. `@media (prefers-reduced-motion: reduce)` coverage exists for every CSS file with animations/transitions
 *     and for every TSX file that calls `.animate(`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(css|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** @param {string} text @returns {string} */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const violations = [];
const files = walk(SRC_DIR);

// Rule 1-3 across all CSS/TS/TSX files
const TRANSITION_ALL_RE = /\btransition(?:-property)?\s*:\s*[^;}\n]*\ball\b/i;
const TRANSITION_ALL_JS_RE = /\btransition\s*:\s*["'`][^"'`]*\ball\b/i;
// Match standalone `ease-in` (not `ease-in-out` or `--ease-in-out`)
const EASE_IN_CSS_RE = /(?<!-)\bease-in\b(?!-out)/;
const SCALE_ZERO_RE = /\bscale\(\s*0(?:\.0+)?\s*\)/;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file, "utf8");
  const clean = stripComments(raw);
  const lines = clean.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Ignore pure single-line JS comments
    const codeLine = line.replace(/\/\/.*$/, "");

    if (file.endsWith(".css") ? TRANSITION_ALL_RE.test(codeLine) : TRANSITION_ALL_JS_RE.test(codeLine)) {
      violations.push(`${rel}:${lineNum} — Forbidden \`transition: all\`. Name exact properties (transform, opacity, clip-path).`);
    }

    if (EASE_IN_CSS_RE.test(codeLine)) {
      // Only flag inside CSS or style/animation strings
      if (file.endsWith(".css") || /easing|transition|animation/.test(codeLine)) {
        violations.push(`${rel}:${lineNum} — Forbidden \`ease-in\` on UI motion. Use \`var(--ease-out)\` or \`var(--ease-in-out)\`.`);
      }
    }

    if (SCALE_ZERO_RE.test(codeLine)) {
      violations.push(`${rel}:${lineNum} — Forbidden \`scale(0)\`. Start from \`scale(0.88–0.97)\` with \`opacity: 0\`.`);
    }
  });

  // Rule 5a: CSS files with @keyframes or transition/animation must include prefers-reduced-motion
  if (file.endsWith(".css") && /@keyframes\b|\banimation\s*:/.test(clean)) {
    if (!/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(clean)) {
      violations.push(`${rel} — Missing \`@media (prefers-reduced-motion: reduce)\` block in stylesheet with animations.`);
    }
  }

  // Rule 5b: TSX/TS files calling WAAPI `.animate(` must guard with `prefers-reduced-motion`
  if (/\.(tsx|ts)$/.test(file) && /\.animate\s*\(/.test(clean)) {
    if (!/prefers-reduced-motion/.test(raw)) {
      violations.push(`${rel} — WAAPI \`.animate()\` used without \`prefers-reduced-motion\` check.`);
    }
  }
}

// Rule 4: Verify foundation tokens in src/index.css
const indexCssPath = path.join(SRC_DIR, "index.css");
if (fs.existsSync(indexCssPath)) {
  const indexCss = fs.readFileSync(indexCssPath, "utf8");
  for (const token of ["--ease-out", "--ease-in-out", "--ease-drawer"]) {
    if (!indexCss.includes(`${token}:`)) {
      violations.push(`src/index.css — Missing required foundation motion token \`${token}\`.`);
    }
  }
  // Ensure key Category 3 classes are covered inside @media (prefers-reduced-motion: reduce)
  const rmBlocks = [...indexCss.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?\n\})/g)].map((m) => m[1]).join("\n");
  for (const requiredSelector of [".ink-reveal", ".vambie-enter", ".sheet__peek", ".morph-slot__item", ".seg__overlay"]) {
    if (!rmBlocks.includes(requiredSelector)) {
      violations.push(`src/index.css — Selector \`${requiredSelector}\` is missing reduced-motion handling inside \`@media (prefers-reduced-motion: reduce)\`.`);
    }
  }
}

if (violations.length > 0) {
  console.error("Motion lint failed:\n");
  for (const v of violations) console.error(`  ✕ ${v}`);
  process.exit(1);
}

console.log(`✓ Motion lint passed across ${files.length} source files (0 violations).`);
