// OpenAI limits how many input (reference) images image requests may use per
// minute. This paces requests to stay inside that budget and waits out 429s, so
// pages wait their turn instead of failing.

const LIMIT = Math.max(1, Number(process.env.OPENAI_IMAGE_INPUTS_PER_MIN ?? 5));
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 6;

// A single request can't use more reference images than the per-minute budget.
export const MAX_REFERENCE_IMAGES = LIMIT;

const used: { at: number; count: number }[] = [];
let turn: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reserve(count: number) {
  const need = Math.min(count, LIMIT);
  for (;;) {
    const now = Date.now();
    while (used.length && now - used[0].at > WINDOW_MS) used.shift();
    if (used.reduce((n, u) => n + u.count, 0) + need <= LIMIT) {
      used.push({ at: now, count: need });
      return;
    }
    await sleep(used[0].at + WINDOW_MS - now + 250);
  }
}

export async function withImageRateLimit<T>(inputImages: number, request: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    // Callers reserve one at a time, so concurrent pages can't all claim the same budget.
    const mine = turn.then(() => reserve(inputImages));
    turn = mine.catch(() => undefined);
    await mine;
    try {
      return await request();
    } catch (error: any) {
      // A slow response can trip the network timeout, and a connection can drop
      // mid-request; one more try usually lands.
      const transient =
        error?.name === "APIConnectionTimeoutError" || error?.name === "APIConnectionError" || /timed out|connection error/i.test(String(error?.message));
      if (transient && attempt === 1) {
        console.log(`Image request failed (${error?.message ?? error?.name}); retrying once`);
        continue;
      }
      if (error?.status !== 429 || attempt >= MAX_ATTEMPTS) throw error;
      const seconds = Number(String(error?.message).match(/try again in ([\d.]+)s/)?.[1] ?? 20);
      console.log(`Image request rate limited; retrying in ${Math.ceil(seconds) + 1}s (attempt ${attempt + 1})`);
      await sleep((Math.ceil(seconds) + 1) * 1000);
    }
  }
}
