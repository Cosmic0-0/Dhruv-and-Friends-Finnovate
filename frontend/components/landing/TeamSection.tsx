import { TEAM, TEAM_NAME, HACKATHON, initials, type TeamMember } from "@/lib/team";

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="17.35" cy="6.65" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Avatar({ member, size }: { member: TeamMember; size: "lg" | "sm" }) {
  const className = `landing-avatar landing-avatar-${size}`;
  if (member.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.photo} alt={member.name} className={className} />;
  }
  return (
    <span className={className} role="img" aria-label={member.name}>
      {initials(member.name)}
    </span>
  );
}

function ProfileCard({ member }: { member: TeamMember }) {
  const handle = member.github.replace(/^https:\/\/github\.com\//, "");
  return (
    <article className="landing-profile">
      <div className="landing-profile-top">
        <Avatar member={member} size="lg" />
        <div>
          <h3 className="landing-profile-name">{member.name}</h3>
          <p className="landing-profile-role">{member.role}</p>
        </div>
      </div>
      <ul className="landing-profile-built">
        {member.built.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="landing-profile-links">
        <a href={member.github} target="_blank" rel="noopener noreferrer" className="landing-social">
          <GitHubIcon className="size-4" />
          <span>{handle}</span>
        </a>
        {member.linkedin && (
          <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="landing-social">
            <LinkedInIcon className="size-4" />
            <span>LinkedIn</span>
          </a>
        )}
        {member.instagram && (
          <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="landing-social">
            <InstagramIcon className="size-4" />
            <span>Instagram</span>
          </a>
        )}
      </div>
    </article>
  );
}

export default function TeamSection() {
  return (
    <section className="landing-section" aria-labelledby="team-heading" id="team">
      <div className="landing-section-head">
        <h2 id="team-heading" className="landing-h2">
          Built by {TEAM_NAME}
        </h2>
        <p className="landing-lede">
          Four students, one weekend-shaped month, and a lot of scam messages forwarded by family. FraudLens was built for the{" "}
          {HACKATHON}.
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/group_photo.jpeg"
        alt={`The ${TEAM_NAME} team`}
        className="landing-group-photo"
        loading="lazy"
      />
      <div className="landing-team">
        {TEAM.map((member) => (
          <ProfileCard key={member.id} member={member} />
        ))}
      </div>
    </section>
  );
}
