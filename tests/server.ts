import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

// Runs the real server (server.ts) against the test file's scratch database.
export async function startServer() {
  const port = await new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  const child: ChildProcess = spawn("npx", ["tsx", "server.ts"], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", ADMIN_PHONES: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout!.on("data", (d) => (log += d));
  child.stderr!.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    const ok = await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    if (i === 149 || child.exitCode !== null) throw new Error(`Server didn't start:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    log: () => log,
    stop: () => new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    }),
  };
}

// Waits for a request answered in the background (server/jobs.ts).
export async function settleJob(base: string, cookie: string, res: Response) {
  if (res.status !== 202) return res;
  const { jobId } = await res.json();
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`${base}/api/jobs/${jobId}`, { headers: { cookie } });
    if (r.status !== 202) return r;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Job didn't finish");
}
