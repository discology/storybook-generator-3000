-- VSB-134: before the birth, a chapter grows a page at a time until it finishes.
ALTER TABLE "Chapter" ADD COLUMN "growing" BOOLEAN NOT NULL DEFAULT false;
