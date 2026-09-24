// The team behind FraudLens, for the /about landing page. Roles and "built"
// lines come from each person's commits in this repo.
//
// To finish a profile: drop a square photo in public/team/ and set `photo`
// to its path (e.g. "/team/dhruv.jpg"), and paste the LinkedIn/Instagram
// profile URLs. A missing photo shows initials; a missing social link is
// simply not shown.

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  built: string[];
  github: string;
  linkedin: string | null;
  instagram: string | null;
  photo: string | null;
}

export const TEAM_NAME = "Dhruv & Friends";
export const REPO_URL = "https://github.com/Cosmic0-0/Dhruv-and-Friends-Finnovate";
export const HACKATHON = "Finnovate Web and AI Hackathon 2026";

export const TEAM: TeamMember[] = [
  {
    id: "dhruv",
    name: "Dhruv Bisht",
    role: "Backend, browser extension and forensics",
    built: [
      "The detection backend and its deployment",
      "The Chrome extension and site Security Report",
      "Document forensics for forged screenshots",
    ],
    github: "https://github.com/dhruvksbisht",
    linkedin: null,
    instagram: null,
    photo: "/brand/dhruv.jpeg",
  },
  {
    id: "oleg",
    name: "Oleg Narainen",
    role: "Product design and web app",
    built: [
      "The phone-first web app and its design system",
      "Motion, layout and the desktop experience",
      "Kreol and French interface copy",
    ],
    github: "https://github.com/oleg-nar",
    linkedin: null,
    instagram: null,
    photo: "/brand/oleg.jpeg",
  },
  {
    id: "joshua",
    name: "Joshua Wang",
    role: "Risk engine, Outlook add-in and Kreol",
    built: [
      "The deterministic risk engine that owns every verdict",
      "The Outlook add-in for workplace email fraud",
      "The reviewed Kreol scam corpus and translation memory",
    ],
    github: "https://github.com/joshwmy",
    linkedin: null,
    instagram: null,
    photo: "/brand/joshua.jpeg",
  },
  {
    id: "caellum",
    name: "Caellum Buys",
    role: "Quality, testing and document checks",
    built: [
      "Test pages, QA rounds and the fix-check harness",
      "PDF and Word document forensics",
      "Kreol review and consistency testing",
    ],
    github: "https://github.com/Cosmic0-0",
    linkedin: null,
    instagram: null,
    photo: "/brand/caellum.jpeg",
  },
];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
