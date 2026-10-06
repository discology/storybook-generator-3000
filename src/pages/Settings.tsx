import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import { IconBell, IconBook, IconChevronRight, IconHelp, IconPeople, IconShield, IconSignOut, IconUser } from "../components/icons";
import { Avatar, Loading, Masthead, MenuRow, Sheet } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet } from "../lib/api";
import { formatClock, formatDate, possessive } from "../lib/format";
import type { StorybookView } from "../types";

export function reminderSummary(s: Pick<StorybookView, "remindersPaused" | "remindersPausedUntil" | "reminderFrequency" | "reminderDay" | "reminderTime">) {
  if (s.remindersPaused) return "Off";
  if (s.remindersPausedUntil && new Date(s.remindersPausedUntil) > new Date()) return `Paused until ${formatDate(s.remindersPausedUntil, { month: "short", day: "numeric" })}`;
  return s.reminderFrequency === "daily" ? `Daily at ${formatClock(s.reminderTime)}` : `Weekly · ${s.reminderDay} at ${formatClock(s.reminderTime)}`;
}

export default function Settings() {
  const { id } = useParams();
  const { storybook, status } = useStorybookData(id);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [others, setOthers] = useState<{ id: string; title: string; childName: string }[]>([]);

  useEffect(() => {
    apiGet("/api/account")
      .then((a) => setOthers(a.storybooks.filter((b: { id: string }) => b.id !== id)))
      .catch(() => setOthers([]));
  }, [id]);

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const owner = storybook.me.role === "owner";
  const signOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="page page--nav">
      <TopBar back={base} wordmark />
      <Masthead title={<>Make it<br />work for you.</>} style={{ paddingTop: 0 }} />
      <div className="pad">
        <Link to={`${base}/settings/account`} className="person" style={{ textDecoration: "none" }}>
          <Avatar name={user?.name ?? "You"} vambie />
          <span className="grow">
            <span className="person__name" style={{ display: "block" }}>{user?.name || storybook.me.name}</span>
            <span className="person__meta" style={{ display: "block" }}>
              {storybook.me.relationship || "Family"} · {possessive(storybook.child.displayName)} story
            </span>
          </span>
          <IconChevronRight size={22} />
        </Link>
      </div>
      <Sheet style={{ marginTop: 14 }}>
        <div className="menu">
          {owner && <MenuRow icon={<IconBook size={24} />} title="Story preferences" to={`${base}/settings/story-preferences`} />}
          {owner && <MenuRow icon={<IconBell size={24} />} title="Reminders" sub={reminderSummary(storybook)} to={`${base}/settings/reminders`} />}
          <MenuRow icon={<IconPeople size={24} />} title="Family & access" to={`${base}/family`} />
          <MenuRow icon={<IconShield size={24} />} title="Privacy & data" to={`${base}/settings/privacy`} />
          <MenuRow icon={<IconUser size={24} />} title="Account & sign-in" to={`${base}/settings/account`} />
          <MenuRow icon={<IconHelp size={24} />} title="Help" to="/help" />
          {others.length > 0 && (
            <MenuRow
              icon={<IconBook size={24} />}
              title="Switch storybook"
              sub={`You're in ${others.length + 1} storybooks`}
              to="/storybooks"
            />
          )}
          <hr className="divider" style={{ margin: "4px 0" }} />
          <MenuRow icon={<IconSignOut size={24} />} title="Sign out" onClick={() => void signOut()} danger right={<span />} />
        </div>
      </Sheet>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}
