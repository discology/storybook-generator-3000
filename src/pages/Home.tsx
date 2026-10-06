import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiGet } from "../lib/api";
import { LAST_STORYBOOK_KEY } from "../hooks/useStorybookData";
import type { StorybookSummary } from "../types";
import { Loading } from "../components/ui";
import Landing from "./Landing";

// "/": visitors see the landing page; signed-in families go to the storybook
// they opened last, or start one.
export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    apiGet("/api/storybooks")
      .then((books: StorybookSummary[]) => {
        if (books.length === 0) return navigate("/start", { replace: true });
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_STORYBOOK_KEY);
        } catch {
          last = null;
        }
        const target = books.find((b) => b.id === last) ?? books[0];
        navigate(`/storybooks/${target.id}`, { replace: true });
      })
      .catch(() => navigate("/start", { replace: true }));
  }, [user, navigate]);

  if (loading || user) return <Loading />;
  return <Landing />;
}
