import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconChevronRight, IconPlus } from "../components/icons";
import { Avatar, Loading, Masthead } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { apiGet } from "../lib/api";
import { possessive } from "../lib/format";
import type { StorybookSummary } from "../types";

// Everyone sees each child's storybook once, as the relationship they hold in
// that family. Someone in several storybooks lands here after signing in.
export default function YourStorybooks() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<StorybookSummary[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/sign-in?next=/storybooks", { replace: true });
      return;
    }
    apiGet("/api/storybooks")
      .then(setBooks)
      .catch(() => setBooks([]));
  }, [user, loading, navigate]);

  if (!books) return <Loading />;

  const role = (b: StorybookSummary) => b.me?.relationship || (b.me?.role === "owner" ? "Parent" : "Family");
  const chapters = (n: number) => (n === 1 ? "1 chapter" : `${n} chapters`);

  return (
    <div className="page">
      <TopBar wordmark />
      <Masthead title={<>Your<br />storybooks.</>} art="hug-book" artMode="corner" style={{ paddingTop: 0 }} />
      <div className="pad" style={{ paddingBottom: 28 }}>
        {books.map((b) => (
          <Link key={b.id} to={`/storybooks/${b.id}`} className="person" style={{ textDecoration: "none", color: "inherit" }}>
            <Avatar name={b.child.displayName} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="person__name" style={{ display: "block" }}>{possessive(b.child.displayName)} storybook</span>
              <span className="person__meta" style={{ display: "block" }}>
                {role(b)} · {chapters(b._count.chapters)}
              </span>
              {b.latestChapter && (
                <span className="person__meta" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Latest: {b.latestChapter.title}
                </span>
              )}
            </span>
            <IconChevronRight size={22} />
          </Link>
        ))}
        {books.length === 0 && <p className="t-body t-muted-dark">You're not in any storybooks yet.</p>}
        <Link to="/start" className="tlink tlink--light" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 20 }}>
          <IconPlus size={18} /> Start a storybook for another child
        </Link>
      </div>
    </div>
  );
}
