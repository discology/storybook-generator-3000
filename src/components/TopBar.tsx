import { Link } from "react-router-dom";
import { IconChevronLeft, IconMenu } from "./icons";

interface TopBarProps {
  backTo?: string;
  backLabel?: string;
  wordmark?: boolean;
  title?: string;
  menuTo?: string;
}

export default function TopBar({ backTo, backLabel, wordmark, title, menuTo }: TopBarProps) {
  return (
    <div className="top-bar">
      {backTo ? (
        <Link to={backTo} className="top-bar-back">
          <IconChevronLeft size={18} />
          {backLabel || "Back"}
        </Link>
      ) : wordmark ? (
        <span className="top-bar-wordmark">VAMBIE</span>
      ) : (
        <span className="top-bar-wordmark" style={{ fontSize: "0.95rem" }}>
          {title}
        </span>
      )}
      {menuTo && (
        <Link to={menuTo} className="top-bar-icon-btn" aria-label="Menu">
          <IconMenu size={22} />
        </Link>
      )}
    </div>
  );
}
