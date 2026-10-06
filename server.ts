import "dotenv/config";
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";
import authRoutes from "./server/authRoutes";
import { requireAdmin } from "./server/admin";
import storybookRoutes from "./server/storybookRoutes";
import familyRoutes from "./server/familyRoutes";
import promptRoutes from "./server/promptRoutes";
import messageRoutes from "./server/messageRoutes";
import aiInstructionRoutes from "./server/aiInstructionRoutes";
import pageRoutes from "./server/pageRoutes";
import characterRoutes from "./server/characterRoutes";
import familyCharacterRoutes from "./server/familyCharacterRoutes";
import { failInterruptedIllustrations } from "./server/storyPages";
import { resumeUnfinishedMemories } from "./server/memoryPipeline";
import { startWeeklyChapters } from "./server/weeklyChapters";
import guardianRoutes from "./server/guardianRoutes";
import exportRoutes, { failInterruptedExports } from "./server/exportRoutes";
import accountRoutes from "./server/accountRoutes";
import jobRoutes, { asJob } from "./server/jobs";
import { guardUploads } from "./server/uploadAccess";
import { usageFromRequest } from "./server/aiUsage";
import costRoutes from "./server/costRoutes";

const production = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
if (production) {
  // Behind Fly.io's proxy: requests arrive over HTTPS at the edge.
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=15552000");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Recordings, exports and reference photos are never served directly, and a
// family's pictures only to its members (server/uploadAccess.ts).
app.use("/uploads", guardUploads);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// AI calls made while answering a request record who asked (server/aiUsage.ts).
app.use("/api", usageFromRequest("family"));
app.use("/api/admin", usageFromRequest("admin"));

app.use("/api/admin", requireAdmin);
app.use("/api/prompts", (req, res, next) => (req.method === "GET" ? next() : requireAdmin(req, res, next)));

// Actions that can take longer than a proxy keeps a quiet connection open
// answer right away and finish in the background (server/jobs.ts).
app.post(
  [
    "/api/admin/chapters/:id/request-revision",
    "/api/admin/chapters/:id/run-guardian",
    "/api/admin/ai-instructions/:key/test",
    "/api/admin/characters/:id/art/generate",
    "/api/admin/characters/:id/art/restyle",
    "/api/designs/:designId/proposals",
    "/api/pages/:pageId/revise",
    "/api/chapters/:id/people",
    "/api/chapters/:id/pages/recheck",
    "/api/storybooks/:id/chapters",
  ],
  asJob
);
app.put("/api/pages/:pageId/text", asJob);

app.use("/api", authRoutes);
app.use("/api", storybookRoutes);
app.use("/api", familyRoutes);
app.use("/api", promptRoutes);
app.use("/api", messageRoutes);
app.use("/api", aiInstructionRoutes);
app.use("/api", pageRoutes);
app.use("/api", characterRoutes);
app.use("/api", familyCharacterRoutes);
app.use("/api", guardianRoutes);
app.use("/api", exportRoutes);
app.use("/api", accountRoutes);
app.use("/api", costRoutes);
app.use("/api", jobRoutes);

// In production this server also serves the built web app (npm run build);
// in development Vite serves it.
if (production) {
  const dist = path.join(process.cwd(), "dist");
  app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html"), { headers: { "Cache-Control": "no-cache" } }));
}

// One failed request shouldn't take the whole server down.
process.on("unhandledRejection", (error) => console.error("Unhandled error:", error));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
app.listen(PORT, () => {
  console.log(`Storybook Generator 3000 backend listening on http://localhost:${PORT}`);
  void failInterruptedIllustrations();
  void resumeUnfinishedMemories();
  void failInterruptedExports();
  // Weekly chapters are made by the hosted app. A development copy only makes
  // them when asked (WEEKLY_CHAPTERS=on), so two copies don't both spend on one.
  if (production || process.env.WEEKLY_CHAPTERS === "on") startWeeklyChapters();
  else console.log("Weekly chapters are off in development (set WEEKLY_CHAPTERS=on to turn them on).");
});
