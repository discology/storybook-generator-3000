import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, ApiError } from "../lib/api";
import type { Storybook } from "../types";

type Status = "loading" | "ready" | "denied" | "notfound";

export function useStorybookData(id: string | undefined) {
  const [storybook, setStorybook] = useState<Storybook | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(() => {
    if (!id) return;
    setStatus("loading");
    apiGet(`/api/storybooks/${id}`)
      .then((data) => {
        setStorybook(data);
        setStatus("ready");
      })
      .catch((err: ApiError) => {
        if (err.status === 401) {
          navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
        } else if (err.status === 403) {
          setStatus("denied");
        } else {
          setStatus("notfound");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(load, [load]);

  return { storybook, status, reload: load };
}
