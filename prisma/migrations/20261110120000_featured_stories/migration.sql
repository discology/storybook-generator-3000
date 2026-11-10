-- The team's sample family, and its chapters featured on the landing page (VSB-141).
ALTER TABLE "Household" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FeaturedStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeaturedStory_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FeaturedStory_chapterId_key" ON "FeaturedStory"("chapterId");
CREATE UNIQUE INDEX "FeaturedStory_slug_key" ON "FeaturedStory"("slug");
