import { Link } from "react-router-dom";
import { Chev, Mascot } from "../components/ui";

// First screen for someone who isn't signed in.
export default function Landing() {
  return (
    <div className="page">
      <div className="tbar">
        <span className="wordmark" style={{ marginLeft: 8 }}>
          Vambie
        </span>
        <div className="tbar__right">
          <Link to="/sign-in" className="tlink tlink--light tlink--plain" style={{ fontSize: 18, padding: "8px 6px" }}>
            Sign in
          </Link>
        </div>
      </div>

      <header className="landing-hero">
        <h1 className="h-display">
          Little
          <br />
          moments.
          <br />A story
          <br />
          for life.
        </h1>
        <p className="masthead__sub">
          Your voice. Their childhood.
          <br />
          One growing Vambie storybook.
        </p>
        <Mascot name="book" className="landing-art" />
        <div className="landing-cta">
          <Link className="btn btn--lime btn--caps" to="/sign-in?next=/start">
            Start their story <Chev />
          </Link>
          <p className="t-center" style={{ margin: "12px 0 0" }}>
            <Link to="/sign-in" className="tlink tlink--light">
              I already have an account
            </Link>
          </p>
        </div>
      </header>

      <Link to="/how-it-works" className="promo">
        <Mascot name="peek" />
        <span style={{ flex: 1 }}>
          Record a memory.
          <br />
          Read it together.
        </span>
        <Chev size={26} />
      </Link>
    </div>
  );
}
