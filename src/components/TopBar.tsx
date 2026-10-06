import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconChevronLeft, IconMenu } from "./icons";
import { Mascot } from "./ui";

interface TopBarProps {
  back?: string | (() => void) | true; // a path, a handler, or true for the browser's back
  title?: ReactNode;
  wordmark?: boolean;
  menu?: string; // where the menu icon goes (settings)
  avatar?: string; // where the avatar goes (settings)
  right?: ReactNode;
  // Older screens:
  backTo?: string;
  backLabel?: string;
  menuTo?: string;
}

export default function TopBar(props: TopBarProps) {
  const navigate = useNavigate();
  const back = props.back ?? props.backTo;
  const title = props.title ?? props.backLabel;
  const menu = props.menu ?? props.menuTo;
  const centered = props.wordmark && back;

  const backButton =
    back === undefined ? null : typeof back === "string" ? (
      <Link to={back} className="tbar__back" aria-label="Back">
        <IconChevronLeft size={28} strokeWidth={2.4} />
      </Link>
    ) : (
      <button type="button" className="tbar__back" aria-label="Back" onClick={back === true ? () => navigate(-1) : back}>
        <IconChevronLeft size={28} strokeWidth={2.4} />
      </button>
    );

  return (
    <div className="tbar">
      {backButton}
      {props.wordmark && (
        <Link to="/" className={`wordmark ${centered ? "tbar__center" : ""}`} style={centered ? undefined : { marginLeft: back ? 0 : 8 }}>
          Vambie
        </Link>
      )}
      {title && !props.wordmark && <span className="tbar__title">{title}</span>}
      <div className="tbar__right">
        {props.right}
        {menu && (
          <Link to={menu} className="tbar__icon" aria-label="Menu">
            <IconMenu size={30} />
          </Link>
        )}
        {props.avatar && (
          <Link to={props.avatar} className="avatar-ring" aria-label="Settings">
            <Mascot name="peek" style={{ width: "100%", height: "100%", borderRadius: 999, objectFit: "cover", objectPosition: "50% 70%", background: "#1b1430" }} />
          </Link>
        )}
      </div>
    </div>
  );
}
