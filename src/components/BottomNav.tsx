import { NavLink } from "react-router-dom";
import { IconHeart, IconHome, IconPeople } from "./icons";

interface BottomNavProps {
  storybookId: string;
}

export default function BottomNav({ storybookId }: BottomNavProps) {
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={linkClass}>
        <IconHome size={20} />
        Home
      </NavLink>
      <NavLink to={`/storybooks/${storybookId}`} end className={linkClass}>
        <IconHeart size={20} />
        Memories
      </NavLink>
      <NavLink to={`/storybooks/${storybookId}/family`} className={linkClass}>
        <IconPeople size={20} />
        Family
      </NavLink>
    </nav>
  );
}
