import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { prisma } from "../server/db";
import { validateKey } from "../server/characters";

// Imports the official Vambie 3D renders (one ZIP per Vambie, each with
// front/angle/side views of 7 expressions) into the Character Library, labeled
// by view and expression so illustrations can attach the render that matches
// each page. Renders already uploaded by hand are labeled instead of copied
// again, and a character's chosen reference art is never replaced. Safe to re-run.
//   npm run characters:import-renders -- [path/to/Vambie 3D Pictures]

const DEFAULT_FOLDER = path.join(os.homedir(), "Library", "CloudStorage", "Dropbox", "Vambie 3D Pictures");

// Which ZIP belongs to which character. "set" names an alternate look; the
// usual look is "". Keys match characters imported from the VOOT bible.
const SETS: { zip: RegExp; key: string; name?: string; set: string }[] = [
  { zip: /^01_baby_vambie/i, key: "baby_vambie", set: "" },
  { zip: /^02_dj/i, key: "vambie_gene", set: "" },
  { zip: /^04_vared/i, key: "vambie_vared", set: "" },
  { zip: /^sunset_no_guitar/i, key: "vambie_sunset", set: "" },
  { zip: /^sunset_guitar/i, key: "vambie_sunset", set: "with guitar" },
  { zip: /^tiger_no_helmet/i, key: "vambie_tiggs", set: "" },
  { zip: /^tiger_helmet/i, key: "vambie_tiggs", set: "with helmet" },
  { zip: /^06_lil_vitcoin/i, key: "lil_vitcoin", name: "Lil VitCoin", set: "" },
  { zip: /^08_vaurora/i, key: "vaurora", name: "VAurora", set: "" },
  { zip: /^09_vellie/i, key: "vellie", name: "Vellie", set: "" },
  { zip: /^10_vg_vambie/i, key: "vg_vambie", name: "VG Vambie", set: "" },
  { zip: /^11_vilo_vambie/i, key: "vilo_vambie", name: "Vilo Vambie", set: "" },
  { zip: /^12_vorty/i, key: "vorty", name: "Vorty", set: "" },
];
// Render files are numbered 1-7 in this order.
const EXPRESSIONS = ["happy", "sad", "excited", "angry", "surprised", "in_love", "amused"];
const VIEWS = ["front", "angle", "side"];

const hashOf = (file: string) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "main";

function listPngs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__MACOSX" ? [] : listPngs(full);
    return /\.png$/i.test(entry.name) ? [full] : [];
  });
}

const folder = process.argv[2] ?? DEFAULT_FOLDER;
const zips = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".zip"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vambie-renders-"));
const touched = new Map<string, { added: number; labeled: number }>();

try {
  for (const zip of zips) {
    const mapping = SETS.find((s) => s.zip.test(zip));
    if (!mapping) {
      console.log(`skip   ${zip} (no matching character)`);
      continue;
    }

    let character = await prisma.character.findUnique({ where: { key: mapping.key }, include: { art: true } });
    if (!character) {
      if (!mapping.name) {
        console.log(`skip   ${zip}: <${mapping.key}> isn't in the library`);
        continue;
      }
      const keyError = validateKey(mapping.key);
      if (keyError) throw new Error(`${mapping.key}: ${keyError}`);
      character = await prisma.character.create({
        data: { key: mapping.key, name: mapping.name, group: "Vambies (3D renders)", importedFrom: `renders:${zip}` },
        include: { art: true },
      });
      console.log(`added  <${mapping.key}> ${mapping.name} (draft)`);
    }

    // Fingerprint existing art so renders uploaded by hand are recognized.
    const known = new Map<string, string>();
    for (const art of character.art) {
      const file = path.join(process.cwd(), art.imagePath);
      const hash = art.fileHash ?? (fs.existsSync(file) ? hashOf(file) : null);
      if (!hash) continue;
      if (!art.fileHash) await prisma.characterArt.update({ where: { id: art.id }, data: { fileHash: hash } });
      known.set(hash, art.id);
    }

    const target = path.join(scratch, slug(zip));
    execFileSync("unzip", ["-oq", path.join(folder, zip), "-d", target]);
    const counts = touched.get(character.id) ?? { added: 0, labeled: 0 };
    for (const file of listPngs(target)) {
      const view = path.basename(path.dirname(file)).toLowerCase();
      const number = Number(path.basename(file).match(/^(\d+)_/)?.[1]);
      const expression = EXPRESSIONS[number - 1];
      if (!VIEWS.includes(view) || !expression) continue;
      const hash = hashOf(file);
      const labels = { view, expression, artSet: mapping.set, fileHash: hash };

      const existing = known.get(hash);
      if (existing) {
        await prisma.characterArt.update({ where: { id: existing }, data: labels });
        counts.labeled++;
        continue;
      }
      const relative = path.join("uploads", "characters", mapping.key, slug(mapping.set), `${view}-${expression}.png`);
      fs.mkdirSync(path.dirname(path.join(process.cwd(), relative)), { recursive: true });
      fs.copyFileSync(file, path.join(process.cwd(), relative));
      const art = await prisma.characterArt.create({ data: { characterId: character.id, imagePath: relative, source: "render", ...labels } });
      known.set(hash, art.id);
      counts.added++;
    }
    touched.set(character.id, counts);
    console.log(`       ${zip} → <${mapping.key}>${mapping.set ? ` (${mapping.set})` : ""}`);
  }

  // New renders change what new chapters attach, so bump the version; keep any
  // reference art already chosen, otherwise use the usual look, front, happy.
  for (const [characterId, counts] of touched) {
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: { art: true } });
    const fallback = character.art.find((a) => a.artSet === "" && a.view === "front" && a.expression === "happy");
    const setReference = !character.referenceArtId && fallback;
    if (counts.added || setReference) {
      await prisma.character.update({
        where: { id: characterId },
        data: { version: { increment: 1 }, ...(setReference ? { referenceArtId: fallback.id } : {}) },
      });
    }
    console.log(
      `<${character.key}>: ${counts.added} renders added, ${counts.labeled} existing images labeled, reference ${setReference ? "set to front/happy" : "kept"}`
    );
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
  await prisma.$disconnect();
}
