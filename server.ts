import "dotenv/config";
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";
import authRoutes from "./server/authRoutes";
import storybookRoutes from "./server/storybookRoutes";
import familyRoutes from "./server/familyRoutes";
import promptRoutes from "./server/promptRoutes";
import messageRoutes from "./server/messageRoutes";
import aiInstructionRoutes from "./server/aiInstructionRoutes";
import pageRoutes from "./server/pageRoutes";
import { failInterruptedIllustrations } from "./server/storyPages";
import guardianRoutes from "./server/guardianRoutes";
import exportRoutes from "./server/exportRoutes";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api", authRoutes);
app.use("/api", storybookRoutes);
app.use("/api", familyRoutes);
app.use("/api", promptRoutes);
app.use("/api", messageRoutes);
app.use("/api", aiInstructionRoutes);
app.use("/api", pageRoutes);
app.use("/api", guardianRoutes);
app.use("/api", exportRoutes);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
app.listen(PORT, () => {
  console.log(`Storybook Generator 3000 backend listening on http://localhost:${PORT}`);
  void failInterruptedIllustrations();
});
