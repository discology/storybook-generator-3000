import { apiSend } from "./api";

// The browser's own funnel steps (GitHub #2); the server records the rest.
// One send per page load per step: the server also keeps only the first per
// visitor, so a reload never double-counts.
const sent = new Set<string>();

export function track(step: "landing_view" | "preview_viewed" | "preview_completed") {
  if (sent.has(step)) return;
  sent.add(step);
  void apiSend("/api/funnel/events", "POST", { name: step }).catch(() => sent.delete(step));
}

// Fires the ad pixel when the landing page loaded it; a no-ops otherwise, so
// the app works the same with or without ads running.
export function pixel(event: "ViewContent" | "CompleteRegistration" | "Subscribe") {
  (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq?.("track", event);
}
