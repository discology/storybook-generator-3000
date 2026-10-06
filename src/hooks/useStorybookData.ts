import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, ApiError } from "../lib/api";
import type { StorybookView } from "../types";

type Status = "loading" | "ready" | "denied" | "notfound";

export const LAST_STORYBOOK_KEY = "vambie:lastStorybook";

export function useStorybookData(id: string | undefined) {
  const [storybook, setStorybook] = useState<StorybookView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const navigate = useNavigate();
  const location = useLocation();

  // `quiet` refreshes without flashing the loading state (polling).
  const load = useCallback(
    (quiet = false) => {
      if (!id) return;
      if (!quiet) setStatus((s) => (s === "ready" ? s : "loading"));
      apiGet(`/api/storybooks/${id}`)
        .then((data: StorybookView) => {
          setStorybook(data);
          setStatus("ready");
          try {
            localStorage.setItem(LAST_STORYBOOK_KEY, data.id);
          } catch {
            // storage may be unavailable
          }
        })
        .catch((err: ApiError) => {
          if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
          else if (err.status === 403) setStatus("denied");
          else setStatus("notfound");
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  useEffect(() => load(), [load]);

  return { storybook, status, reload: load };
}
