import { randomUUID } from "crypto";
import express, { type NextFunction, type Request, type Response, Router } from "express";
import { SESSION_COOKIE } from "./session";

// Some actions take longer than a hosting proxy keeps a quiet connection open
// (Fly.io closes it after about a minute). For those routes, the server answers
// 202 with a job id right away and keeps working; the browser asks
// /api/jobs/:id until the route's real answer is ready (see src/lib/api.ts).

interface Job {
  owner: string | null; // the session that started it
  done: boolean;
  status: number;
  body: unknown;
  createdAt: number;
}

const jobs = new Map<string, Job>();
const GIVE_UP_MS = 15 * 60 * 1000;

export function asJob(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  const job: Job = { owner: req.cookies?.[SESSION_COOKIE] ?? null, done: false, status: 200, body: null, createdAt: Date.now() };
  jobs.set(id, job);
  res.status(202).json({ jobId: id });

  // The route still runs on this response; what it sends is kept for the job instead.
  let status = 200;
  const finish = (body: unknown) => {
    if (job.done) return;
    job.done = true;
    job.status = status;
    job.body = body ?? null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shadow = res as any;
  shadow.status = (code: number) => {
    status = code;
    return shadow;
  };
  shadow.sendStatus = (code: number) => {
    status = code;
    finish(null);
    return shadow;
  };
  shadow.json = (body: unknown) => {
    finish(body);
    return shadow;
  };
  shadow.send = (body: unknown) => {
    finish(typeof body === "string" ? { message: body } : body);
    return shadow;
  };
  shadow.end = () => {
    finish(null);
    return shadow;
  };
  shadow.setHeader = shadow.set = shadow.type = () => shadow;
  next();
}

const router: Router = express.Router();

router.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || (job.owner && job.owner !== req.cookies?.[SESSION_COOKIE])) {
    return res.status(404).json({ error: "This request has expired. Try again." });
  }
  if (!job.done) {
    if (Date.now() - job.createdAt > GIVE_UP_MS) {
      jobs.delete(req.params.id);
      return res.status(504).json({ error: "This took too long. Try again." });
    }
    return res.status(202).json({ jobId: req.params.id, pending: true });
  }
  jobs.delete(req.params.id);
  res.status(job.status).json(job.body ?? {});
});

// Results nobody collected are dropped after an hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 10 * 60 * 1000).unref();

export default router;
