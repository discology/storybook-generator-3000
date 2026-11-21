import crypto from "crypto";
import type { ErrorRequestHandler } from "express";

// The last stop for a request that threw. Express 5 hands rejected async
// handlers here; Express 4 left them hanging until the browser gave up.
// The reply has the shape the app already reads (`{ error }`).
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  // Errors with their own 4xx status are the caller's: bad JSON, a body or
  // upload that's too large.
  const status = Number(error?.status ?? error?.statusCode);
  const tooLarge = status === 413 || error?.code === "LIMIT_FILE_SIZE";
  if (tooLarge) return res.status(413).json({ error: "That file is too large." });
  if (status >= 400 && status < 500) return res.status(status).json({ error: "That request couldn't be read." });

  const id = crypto.randomBytes(4).toString("hex");
  console.error(`Request failed [${id}] ${req.method} ${req.originalUrl.split("?")[0]}:`, error);
  res.status(500).json({ error: `Something went wrong on our side. Try again. (ref ${id})` });
};
