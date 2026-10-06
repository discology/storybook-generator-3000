export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Slow actions answer 202 with a job id right away (server/jobs.ts); this asks
// for the result until it's ready, so callers just get the final response.
export async function settle(res: Response): Promise<Response> {
  if (res.status !== 202) return res;
  const data = await res.clone().json().catch(() => null);
  if (!data?.jobId) return res;
  const started = Date.now();
  let failures = 0;
  for (;;) {
    await sleep(1500);
    try {
      const next = await fetch(`/api/jobs/${data.jobId}`);
      failures = 0;
      if (next.status !== 202) return next;
    } catch {
      if (++failures >= 5) throw new ApiError(0, "We lost the connection. Check your internet and try again.");
    }
    if (Date.now() - started > 16 * 60 * 1000) throw new ApiError(504, "This took too long. Try again.");
  }
}

export async function apiGet(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText);
  }
  return res.json();
}

export async function apiSend(url: string, method: string, body?: unknown) {
  const res = await settle(
    await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}
