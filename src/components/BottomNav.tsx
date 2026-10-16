import { NavLink, useLocation } from "react-router-dom";
import { IconBook, IconHeart, IconHome, IconPeople } from "./icons";

// Four tabs (VSB-136): Home, Book (the chapters), Memories, Family.
export default function BottomNav({ storybookId }: { storybookId: string }) {
  const { pathname } = useLocation();
  const base = `/storybooks/${storybookId}`;
  const familyActive = pathname.startsWith(`${base}/family`) || pathname.startsWith(`${base}/characters`);
  const bookActive = pathname.startsWith(`${base}/book`);
  const memoriesActive = pathname.startsWith(`${base}/memories`);
  const homeActive = pathname === base;
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to={base} end className={homeActive ? "active" : ""}>
        <IconHome size={28} filled={homeActive} />
        Home
      </NavLink>
      <NavLink to={`${base}/book`} className={bookActive ? "active" : ""}>
        <IconBook size={28} />
        Book
      </NavLink>
      <NavLink to={`${base}/memories`} className={memoriesActive ? "active" : ""}>
        <IconHeart size={28} filled={memoriesActive} />
        Memories
      </NavLink>
      <NavLink to={`${base}/family`} className={familyActive ? "active" : ""}>
        <IconPeople size={28} filled={familyActive} />
        Family
      </NavLink>
    </nav>
  );
}
