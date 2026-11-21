import { prisma } from "./db";

// The newest ready picture of each page, in one query. Asking for it inside a
// nested include (`assets: { orderBy, take: 1 }`) crashes Prisma 6's query
// engine once a storybook has ~100 chapters (VSB: Prisma "no entry found for
// key"), so callers select pages without assets and attach them here.
// Prisma splits a long `IN` list into several queries on its own, but not when
// the query also has a negation filter ("imagePath not null"), and it then
// fails. So the ids go in chunks here and nulls are dropped in code.
const CHUNK = 500;

export async function latestReadyImages(pageIds: string[]): Promise<Map<string, string>> {
  const newest = new Map<string, string>();
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    const assets = await prisma.pageAsset.findMany({
      where: { pageId: { in: pageIds.slice(i, i + CHUNK) }, status: "ready" },
      orderBy: { version: "desc" },
      select: { pageId: true, imagePath: true },
    });
    for (const a of assets) if (a.imagePath && !newest.has(a.pageId)) newest.set(a.pageId, a.imagePath);
  }
  return newest;
}

type WithImage<C extends { pages: { id: string }[] }> = Omit<C, "pages"> & { pages: (C["pages"][number] & { assets: { imagePath: string }[] })[] };

// Pages shaped as before (`assets: [{ imagePath }]`), so the callers' code is unchanged.
export async function withLatestImage<C extends { pages: { id: string }[] }>(chapters: C[]): Promise<WithImage<C>[]> {
  const images = await latestReadyImages(chapters.flatMap((c) => c.pages.map((p) => p.id)));
  return chapters.map((c) => ({
    ...c,
    pages: c.pages.map((p) => ({ ...p, assets: images.has(p.id) ? [{ imagePath: images.get(p.id)! }] : [] })),
  }));
}
