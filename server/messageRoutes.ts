import express, { Router } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { MESSAGE_TYPES, getMessageType, getTemplate, findUnknownVariables } from "./messageTemplates";

const router: Router = express.Router();

router.use("/admin/messages", async (req, res, next) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Sign in first" });
  next();
});

router.get("/admin/messages", async (_req, res) => {
  res.json(await Promise.all(MESSAGE_TYPES.map((t) => getTemplate(t.key))));
});

router.get("/admin/messages/:key", async (req, res) => {
  if (!getMessageType(req.params.key)) return res.status(404).json({ error: "Not found" });
  res.json(await getTemplate(req.params.key));
});

router.put("/admin/messages/:key", async (req, res) => {
  const type = getMessageType(req.params.key);
  if (!type) return res.status(404).json({ error: "Not found" });

  const current = await getTemplate(type.key);
  const body = req.body?.body !== undefined ? String(req.body.body).trim() : current.body;
  const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : current.enabled;
  if (!body) return res.status(400).json({ error: "The message can't be empty." });

  const unknown = findUnknownVariables(type, body);
  if (unknown.length) {
    return res.status(400).json({
      error: `This message doesn't support ${unknown.map((n) => `<${n}>`).join(", ")}. Use one of the variables listed.`,
    });
  }

  await prisma.messageTemplate.upsert({
    where: { key: type.key },
    create: { key: type.key, body, enabled },
    update: { body, enabled },
  });
  res.json(await getTemplate(type.key));
});

export default router;
