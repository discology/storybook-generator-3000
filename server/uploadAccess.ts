import type { NextFunction, Request, Response } from "express";
import path from "path";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { isAdmin } from "./admin";

// Who may open files under /uploads. The address is normalized first, so a
// path like /uploads/x/../private/... is judged by where it really leads.
// - private/, memories/, exports/: never served directly (recordings and
//   exports go through access-checked API routes; photos are server-only).
// - pages/ and characters/family/: a family's page pictures and family members'
//   design pictures, only for that family's members and admins.
// - everything else (Vambie artwork, prompt artwork): public.

const UPLOADS = path.join(process.cwd(), "uploads");
const PRIVATE_FOLDERS = ["private", "memories", "exports"];
const FAMILY_FOLDERS = ["pages/", "characters/family/"];

const householdOf = async (file: string): Promise<string | null> => {
  const asset = await prisma.pageAsset.findFirst({
    where: { imagePath: file },
    select: { page: { select: { chapter: { select: { storybook: { select: { child: { select: { householdId: true } } } } } } } } },
  });
  if (asset) return asset.page.chapter.storybook.child.householdId;
  const sheet = await prisma.chapter.findFirst({
    where: { characterSheetImage: file },
    select: { storybook: { select: { child: { select: { householdId: true } } } } },
  });
  if (sheet) return sheet.storybook.child.householdId;
  const design = await prisma.characterDesign.findFirst({
    where: { OR: [{ portraitPath: file }, { sheetPath: file }] },
    select: { familyCharacter: { select: { householdId: true } } },
  });
  if (design) return design.familyCharacter.householdId;
  const proposal = await prisma.designProposal.findFirst({
    where: { imagePath: file },
    select: { design: { select: { familyCharacter: { select: { householdId: true } } } } },
  });
  return proposal?.design.familyCharacter.householdId ?? null;
};

export async function guardUploads(req: Request, res: Response, next: NextFunction) {
  let rel: string;
  try {
    rel = path.posix.normalize(decodeURIComponent(req.path)).replace(/^\/+/, "");
  } catch {
    return res.status(400).end();
  }
  if (rel.startsWith("..") || rel.includes("\0")) return res.status(404).end();
  if (PRIVATE_FOLDERS.includes(rel.split("/")[0])) return res.status(404).end();
  if (!FAMILY_FOLDERS.some((folder) => rel.startsWith(folder))) return next();

  const user = await getCurrentUser(req);
  if (!user) return res.status(401).end();
  const householdId = await householdOf(`uploads/${rel}`);
  if (!householdId) return res.status(404).end();
  const allowed =
    isAdmin(user) || (await prisma.contributor.count({ where: { householdId, userId: user.id, inviteStatus: { not: "revoked" } } })) > 0;
  if (!allowed) return res.status(403).end();
  res.sendFile(path.join(UPLOADS, rel), { headers: { "Cache-Control": "private, max-age=86400" } }, (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
}
