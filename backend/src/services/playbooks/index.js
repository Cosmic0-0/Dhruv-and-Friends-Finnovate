// Non-LLM, deterministic — a finite scam-stage/scam-type taxonomy plus a
// lookup table of what typically happens at each stage of each known scam
// format. The LLM only ever SELECTS a scamType/stage from these fixed
// enums (see services/analysis/index.js); "what may happen next" and the
// Scam Sandbox's example lines both come from this table, not from
// unconstrained LLM generation — see CLAUDE.md's "Scam Playbook Control"
// approach: keep playbook predictions deterministic.

export const SCAM_STAGES = [
  "INITIAL_CONTACT",
  "TRUST_BUILDING",
  "AUTHORITY_CLAIM",
  "URGENCY",
  "CREDENTIAL_REQUEST",
  "OTP_REQUEST",
  "PAYMENT_REQUEST",
  "PAYMENT_PRESSURE",
  "ACCOUNT_TAKEOVER",
];

export const SCAM_TYPES = [
  "MCB_IMPERSONATION",
  "SBM_IMPERSONATION",
  "ABSA_IMPERSONATION",
  "BANK_ONE_IMPERSONATION",
  "TELCO_PRIZE_SCAM",
  "MOBILE_MONEY_FRAUD",
  "FAKE_PARCEL",
  "MARKETPLACE_PAYMENT_FRAUD",
];

// The four bank-impersonation types share an identical stage flow, only the
// claimed institution's name differs - generated once rather than repeated
// four times.
function bankImpersonationPlaybook(bankName) {
  return {
    label: `${bankName} impersonation`,
    typicalStages: ["AUTHORITY_CLAIM", "URGENCY", "CREDENTIAL_REQUEST", "OTP_REQUEST", "ACCOUNT_TAKEOVER"],
    nextStageMap: {
      AUTHORITY_CLAIM: [
        { stage: "URGENCY", reason: `Having claimed to be ${bankName}, the next step is typically to create pressure to act immediately.` },
      ],
      URGENCY: [
        { stage: "CREDENTIAL_REQUEST", reason: "Urgency is commonly followed by a request to 'verify' login details." },
        { stage: "PAYMENT_REQUEST", reason: "Urgency can also lead directly to a demand for an urgent payment or transfer." },
      ],
      CREDENTIAL_REQUEST: [
        { stage: "OTP_REQUEST", reason: "Once login details are shared, the next ask is usually the one-time password (OTP) needed to complete account access." },
      ],
      OTP_REQUEST: [
        { stage: "ACCOUNT_TAKEOVER", reason: "Sharing an OTP hands over the final piece needed to take over the account." },
      ],
      PAYMENT_REQUEST: [
        { stage: "PAYMENT_PRESSURE", reason: "If an initial payment request is ignored, scammers often escalate with threats or deadlines." },
      ],
    },
    sandboxLines: {
      AUTHORITY_CLAIM: [
        `This is ${bankName} Security. We've detected unusual activity on your account.`,
        `${bankName} Alert: your account requires immediate verification.`,
      ],
      URGENCY: [
        "Your account will be suspended within 30 minutes if this is not resolved.",
        "Please act now, this link will expire shortly.",
      ],
      CREDENTIAL_REQUEST: [
        `Please confirm your ${bankName} login username and password to cancel this action.`,
        "Click the link and log in to verify your identity.",
      ],
      OTP_REQUEST: [
        "We've sent a verification code to your phone. Please read it back to confirm.",
        "Enter the OTP you just received to complete the security check.",
      ],
      PAYMENT_REQUEST: [
        "A refund is pending, please confirm your account number to receive it.",
        "To reverse the incorrect transaction, please transfer the stated amount first.",
      ],
      PAYMENT_PRESSURE: [
        "This is your final notice before legal action is taken.",
        "Failure to respond today will result in a permanent account freeze.",
      ],
      ACCOUNT_TAKEOVER: ["Thank you, your account has been verified.", "Your request is being processed."],
    },
  };
}

export const PLAYBOOKS = {
  MCB_IMPERSONATION: bankImpersonationPlaybook("MCB"),
  SBM_IMPERSONATION: bankImpersonationPlaybook("SBM"),
  ABSA_IMPERSONATION: bankImpersonationPlaybook("Absa"),
  BANK_ONE_IMPERSONATION: bankImpersonationPlaybook("Bank One"),

  TELCO_PRIZE_SCAM: {
    label: "Telecom prize scam",
    typicalStages: ["INITIAL_CONTACT", "TRUST_BUILDING", "PAYMENT_REQUEST", "PAYMENT_PRESSURE"],
    nextStageMap: {
      INITIAL_CONTACT: [{ stage: "TRUST_BUILDING", reason: "An unsolicited prize claim is usually followed by details meant to make it feel real." }],
      TRUST_BUILDING: [{ stage: "PAYMENT_REQUEST", reason: "Once you believe the prize is real, the next step is an upfront 'processing' or 'release' fee." }],
      PAYMENT_REQUEST: [{ stage: "PAYMENT_PRESSURE", reason: "Hesitation is met with a deadline, to stop you thinking it over or checking with the real telecom provider." }],
    },
    sandboxLines: {
      INITIAL_CONTACT: ["Congratulations! Your number has won Rs 50,000 in our anniversary draw.", "You've been selected to win a free smartphone and data bundle."],
      TRUST_BUILDING: ["This is a genuine promotion, you can verify your entry code below.", "Thousands have already claimed their prize this week."],
      PAYMENT_REQUEST: ["To release your prize, please pay a small delivery fee of Rs 500.", "A processing fee is required before we can transfer your winnings."],
      PAYMENT_PRESSURE: ["Your prize will be forfeited if payment isn't received within the hour.", "This offer expires today, act now to avoid losing your winnings."],
    },
  },

  MOBILE_MONEY_FRAUD: {
    label: "Mobile money fraud",
    typicalStages: ["AUTHORITY_CLAIM", "URGENCY", "OTP_REQUEST", "ACCOUNT_TAKEOVER"],
    nextStageMap: {
      AUTHORITY_CLAIM: [{ stage: "URGENCY", reason: "Posing as a mobile money agent is typically followed by urgency about a supposed wrong transaction." }],
      URGENCY: [{ stage: "OTP_REQUEST", reason: "The claimed fix for a 'wrong payment' or 'account upgrade' is always the OTP needed to authorize a real transaction." }],
      OTP_REQUEST: [{ stage: "ACCOUNT_TAKEOVER", reason: "Sharing the OTP authorizes the scammer's own transaction, not a reversal." }],
    },
    sandboxLines: {
      AUTHORITY_CLAIM: ["This is mobile money support, we've noticed a wrong transfer to your wallet.", "We need to upgrade your mobile money account for security."],
      URGENCY: ["This must be reversed now or the funds will be locked.", "Your wallet will be suspended if we can't confirm this immediately."],
      OTP_REQUEST: ["Please share the code you just received so we can cancel the wrong transfer.", "Read us the OTP to complete the account upgrade."],
      ACCOUNT_TAKEOVER: ["The wallet change is complete; please ignore any security alerts.", "Your wallet is now registered to our verification device."],
    },
  },

  FAKE_PARCEL: {
    label: "Fake parcel / customs fee",
    typicalStages: ["INITIAL_CONTACT", "URGENCY", "PAYMENT_REQUEST"],
    nextStageMap: {
      INITIAL_CONTACT: [{ stage: "URGENCY", reason: "A parcel notice is usually paired with a short deadline to create pressure." }],
      URGENCY: [{ stage: "PAYMENT_REQUEST", reason: "The claimed fix for the 'stuck' parcel is always a small fee paid through a link." }],
    },
    sandboxLines: {
      INITIAL_CONTACT: ["Your parcel is being held at customs pending a clearance fee.", "We attempted delivery of your package but could not complete customs clearance."],
      URGENCY: ["Your parcel will be returned to sender if this isn't resolved today.", "Please clear this within 24 hours to avoid storage charges."],
      PAYMENT_REQUEST: ["Pay the Rs 150 clearance fee through this link to release your parcel.", "A small customs fee is required before delivery can proceed."],
    },
  },

  MARKETPLACE_PAYMENT_FRAUD: {
    label: "Marketplace payment fraud",
    typicalStages: ["INITIAL_CONTACT", "TRUST_BUILDING", "PAYMENT_REQUEST", "PAYMENT_PRESSURE"],
    nextStageMap: {
      INITIAL_CONTACT: [{ stage: "TRUST_BUILDING", reason: "An eager buyer or seller message is usually followed by a claimed payment confirmation to seem legitimate." }],
      TRUST_BUILDING: [{ stage: "PAYMENT_REQUEST", reason: "A fake 'payment sent' screenshot is typically followed by a request for an extra fee to 'release' or 'unlock' it." }],
      PAYMENT_REQUEST: [{ stage: "PAYMENT_PRESSURE", reason: "Hesitation is met with pressure to pay quickly before the 'deal' or 'payment window' closes." }],
    },
    sandboxLines: {
      INITIAL_CONTACT: ["I'm very interested in your listing, I can pay today.", "I've already sent the payment, please check your account."],
      TRUST_BUILDING: ["Here's my payment confirmation screenshot, it should reflect shortly.", "My bank says an extra courier fee is needed to release the funds to you."],
      PAYMENT_REQUEST: ["Please send the courier fee first so I can release the full payment.", "Pay the small unlock fee and the transfer will complete immediately."],
      PAYMENT_PRESSURE: ["I need this resolved in the next 10 minutes or I'll have to cancel.", "Other buyers are waiting, please confirm now."],
    },
  },
};

function normalizeEnum(raw, values) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return values.includes(key) ? key : null;
}

export function normalizeScamType(raw) {
  return normalizeEnum(raw, SCAM_TYPES);
}

export function normalizeStage(raw) {
  return normalizeEnum(raw, SCAM_STAGES);
}

// Capped at 3 so the UI never has to truncate a long list itself.
const MAX_NEXT_STAGES = 3;

export function getLikelyNextStages(scamType, stage) {
  const playbook = Object.hasOwn(PLAYBOOKS, scamType) ? PLAYBOOKS[scamType] : null;
  if (!playbook || !stage) return [];
  return (Object.hasOwn(playbook.nextStageMap, stage) ? playbook.nextStageMap[stage] : []).slice(0, MAX_NEXT_STAGES);
}

// Used by the Scam Sandbox (backend/src/routes/index.js's /sandbox/next) as
// both LLM grounding and the deterministic fallback line if the LLM call
// fails - see that route for the failure-handling contract.
export function getSandboxLines(scamType, stage) {
  const playbook = Object.hasOwn(PLAYBOOKS, scamType) ? PLAYBOOKS[scamType] : null;
  if (!playbook || !stage) return [];
  return Object.hasOwn(playbook.sandboxLines, stage) ? playbook.sandboxLines[stage] : [];
}

export const STAGE_TACTICS = {
  INITIAL_CONTACT: { label: "Unsolicited contact", explanation: "An unexpected message creates a reason to engage. Verify who contacted you independently." },
  TRUST_BUILDING: { label: "Manufactured trust", explanation: "Claims and apparent proof try to make the story feel credible. They are not independent verification." },
  AUTHORITY_CLAIM: { label: "Borrowed authority", explanation: "The sender claims to represent a trusted organization. Contact that organization through a known official channel." },
  URGENCY: { label: "Artificial urgency", explanation: "A deadline discourages careful checking. Pause before responding." },
  CREDENTIAL_REQUEST: { label: "Credential harvesting", explanation: "A request for login details can expose your account. Never share your password." },
  OTP_REQUEST: { label: "Verification-code theft", explanation: "A one-time code can authorize access or a payment. Never share it with a caller or sender." },
  PAYMENT_REQUEST: { label: "Payment pretext", explanation: "A fee or transfer is presented as necessary to solve a problem or receive a reward. Verify before paying." },
  PAYMENT_PRESSURE: { label: "Escalating pressure", explanation: "Threats or expiring offers push you to pay without checking. Stop and seek independent advice." },
  ACCOUNT_TAKEOVER: { label: "Loss of account control", explanation: "The story concludes with claimed access or a changed account. If you shared details, contact the real provider immediately." },
};
