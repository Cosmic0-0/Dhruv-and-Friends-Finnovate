import { TEAM_NAME } from "@/lib/team";

/**
 * The team badge, slowly turning, sitting on the seam between the dark hero
 * and the page. Two counter-rotating tick rings frame it; motion stops for
 * people who ask for reduced motion (landing.css).
 */
export default function BadgeDivider() {
  return (
    <div className="landing-divider" role="img" aria-label={`${TEAM_NAME} team badge`}>
      <span className="landing-divider-rule" aria-hidden="true" />
      <div className="landing-divider-badge" aria-hidden="true">
        <svg className="landing-divider-ticks landing-divider-ticks-outer" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="96" pathLength="360" />
        </svg>
        <svg className="landing-divider-ticks landing-divider-ticks-inner" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="88" pathLength="360" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/dhruv-and-friends.png" alt="" width={148} height={148} className="landing-divider-logo" />
      </div>
      <span className="landing-divider-rule" aria-hidden="true" />
    </div>
  );
}
