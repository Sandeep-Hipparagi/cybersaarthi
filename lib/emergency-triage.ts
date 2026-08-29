export type EmergencyAdvisory = {
  label: string;
  actions: string[];
};

const checks: Array<{ pattern: RegExp; advisory: EmergencyAdvisory }> = [
  {
    pattern: /\b(?:anydesk|teamviewer|remote access|apk|screen share|screen sharing)\b/i,
    advisory: {
      label: "Possible remote-access or malicious-app incident",
      actions: [
        "Disconnect the affected device from mobile data and Wi-Fi.",
        "Use a different trusted device to contact your bank and secure important accounts.",
        "Preserve the app name, messages, permissions, and transaction records before changing the device.",
      ],
    },
  },
  {
    pattern: /\b(?:digital arrest|police|cbi|customs|enforcement|public servant)\b/i,
    advisory: {
      label: "Possible authority-impersonation incident",
      actions: [
        "Stop the call and do not send more money or identity documents.",
        "Preserve caller numbers, payment references, and chat history.",
        "Contact 1930 if money moved; use 112 if there is an immediate safety threat.",
      ],
    },
  },
  {
    pattern: /\b(?:sextortion|intimate image|private photo|private video|blackmail)\b/i,
    advisory: {
      label: "Possible intimate-content blackmail incident",
      actions: [
        "Do not pay, negotiate, or forward the intimate content to others.",
        "Preserve account links, threats, timestamps, and payment demands.",
        "Use 112 for immediate danger and the official cybercrime portal for reporting.",
      ],
    },
  },
  {
    pattern: /\b(?:part[ -]?time|task|telegram|crypto|investment|trading)\b/i,
    advisory: {
      label: "Possible task, job, or investment fraud",
      actions: [
        "Stop all further payments, deposits, and recovery-fee requests.",
        "Call 1930 and contact the bank through a verified official channel.",
        "Preserve every transaction reference, chat, profile, and payment request.",
      ],
    },
  },
  {
    pattern: /\b(?:upi|bank|card|otp|wallet|payment|debited|transaction|money|₹|rs\.?|inr)\b/i,
    advisory: {
      label: "Possible financial fraud",
      actions: [
        "Call 1930 immediately and keep the transaction reference ready.",
        "Contact your bank through its app, card, or verified official website.",
        "Preserve transaction messages and suspect chats; never share an OTP, PIN, or recovery fee.",
      ],
    },
  },
  {
    pattern: /\b(?:hacked|account takeover|password changed|locked out|compromised)\b/i,
    advisory: {
      label: "Possible account compromise",
      actions: [
        "Use a trusted device to change the password and sign out other sessions.",
        "Turn on two-step verification and save login-alert evidence.",
        "Contact the service through its verified recovery channel.",
      ],
    },
  },
];

export function emergencyAdvisoryFor(narrative: string): EmergencyAdvisory {
  return checks.find((check) => check.pattern.test(narrative))?.advisory ?? {
    label: "Immediate safety steps",
    actions: [
      "Stop contact with the suspected sender and do not share credentials.",
      "Preserve messages, account links, timestamps, and payment records.",
      "Call 1930 if money moved, or 112 for an immediate safety threat.",
    ],
  };
}
