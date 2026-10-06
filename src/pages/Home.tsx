import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiGet } from "../lib/api";
import type { StorybookSummary } from "../types";
import { Loading } from "../components/ui";
import Landing from "./Landing";

// "/": visitors see the landing page. Signed-in families with one storybook go
// straight in; someone in several picks from Your storybooks.
export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    apiGet("/api/storybooks")
      .then((books: StorybookSummary[]) => {
        if (books.length === 0) return navigate("/start", { replace: true });
        if (books.length > 1) return navigate("/storybooks", { replace: true });
        navigate(`/storybooks/${books[0].id}`, { replace: true });
      })
      .catch(() => navigate("/start", { replace: true }));
  }, [user, navigate]);

  if (loading || user) return <Loading />;
  return <Landing />;
}
