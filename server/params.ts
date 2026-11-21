import type { Request } from "express";

// A named route parameter (`/things/:id`) as a string. Express 5's types allow
// a string array (wildcard routes); named parameters are always one string, and
// routes with middleware such as multer lose the typed form.
export function param(req: Pick<Request, "params">, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value.join("/") : (value ?? "");
}
