import crypto from "node:crypto";
import { prisma } from "../server/db";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${crypto.randomBytes(3).toString("hex")}`;

export async function signedInUser(name = "Parent") {
  const user = await prisma.user.create({ data: { name, phone: `+1555${Math.floor(1e6 + Math.random() * 8e6)}${n++ % 10}` } });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 86_400_000) } });
  return { user, token, cookie: `sb_session=${token}` };
}

// A saved family with an owner, a child and a storybook.
export async function family(options: { grandfathered?: boolean; owner?: Awaited<ReturnType<typeof signedInUser>> } = {}) {
  const owner = options.owner ?? (await signedInUser());
  const household = await prisma.household.create({ data: { ownerUserId: owner.user.id, grandfathered: options.grandfathered ?? false } });
  const child = await prisma.child.create({ data: { householdId: household.id, displayName: `Kid ${uid()}`, stage: "born", birthDate: new Date("2024-01-01") } });
  const storybook = await prisma.storybook.create({ data: { childId: child.id, title: "Our story", status: "active" } });
  const me = await prisma.contributor.create({ data: { householdId: household.id, userId: owner.user.id, name: owner.user.name ?? "Parent", role: "owner", relationship: "Mom" } });
  return { owner, household, child, storybook, me };
}

export async function joinAsRelative(householdId: string, name = "Grandma") {
  const relative = await signedInUser(name);
  const place = await prisma.contributor.create({ data: { householdId, userId: relative.user.id, name, role: "contributor", relationship: "Grandparent" } });
  return { ...relative, place };
}

export const key = () => `test:${uid()}`;
