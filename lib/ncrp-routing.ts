export type NcrpTopLevelRoute =
  | "WOMEN_CHILDREN_RELATED_CRIME"
  | "FINANCIAL_FRAUD"
  | "OTHER_CYBER_CRIME"
  | "UNKNOWN";

export type NcrpRouteProposal = {
  topLevelRoute: NcrpTopLevelRoute;
  label: string;
  confidence: number;
  matchedSignals: string[];
  explanation: string;
  requiresHumanConfirmation: true;
};

type SignalRule = { name: string; pattern: RegExp };

const WOMEN_CHILD_RULES: SignalRule[] = [
  { name: "child sexual abuse material", pattern: /\b(?:csam|cseam|child sexual|child porn(?:ography)?)\b/i },
  { name: "sexually explicit content", pattern: /\b(?:rape content|gang rape content|non-consensual intimate|intimate image|revenge porn|sextortion)\b/i },
  { name: "women/child explicit-content signal", pattern: /(?:बच्च|महिला|लड़की).{0,24}(?:अश्लील|यौन|नग्न|वीडियो|फोटो)/iu },
];

const FINANCIAL_RULES: SignalRule[] = [
  { name: "UPI/payment rail", pattern: /\b(?:upi|gpay|google pay|phonepe|paytm|wallet|qr code|collect request)\b/i },
  { name: "bank/card/OTP", pattern: /\b(?:bank|account|debit|credited|card|netbanking|otp|pin|cvv|utr|transaction(?: id| reference)?)\b/i },
  { name: "money movement", pattern: /(?:₹|\brs\.?\b|\binr\b|\bpaid\b|\bpayment\b|\btransferred\b|\bdeducted\b|\bwithdrawn\b|\blost money\b)/i },
  { name: "financial-scam pattern", pattern: /\b(?:part[ -]?time job|task scam|investment|trading|loan|refund|cashback|electricity bill|courier fee|digital arrest)\b/i },
  { name: "Code-mixed financial signal", pattern: /(?:paisa|paise|rupay|bank khata|account block|kat gaya|deduct ho gaya|bhej(?:a|e)|nikal gaya|otp share)/iu },
  { name: "Indic money signal", pattern: /(?:पैसे|रुपये|खाता|डेबिट|भुगतान|ಹಣ|ಖಾತೆ|డబ్బు|ఖాతా|பணம்|கணக்கு)/u },
];

const OTHER_CYBER_RULES: SignalRule[] = [
  { name: "account compromise", pattern: /\b(?:hacked|hacking|account takeover|password changed|locked out|malware|ransomware)\b/i },
  { name: "impersonation/harassment", pattern: /\b(?:impersonat|fake profile|cyberbully|harass|threat|stalk|defam|morph(?:ed|ing))\b/i },
  { name: "phishing/contact", pattern: /\b(?:phishing|smishing|vishing|suspicious link|whatsapp|telegram|social media|email scam)\b/i },
];

function matched(rules: SignalRule[], text: string): string[] {
  return rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.name);
}

/**
 * Produces a reviewable NCRP top-level route proposal only. It does not make a
 * legal finding, choose a police station, infer jurisdiction, or file anything.
 */
export function proposeNcrpTopLevelRoute(rawNarrative: string): NcrpRouteProposal {
  const narrative = rawNarrative.normalize("NFKC").trim();
  const womenChildSignals = matched(WOMEN_CHILD_RULES, narrative);
  const financialSignals = matched(FINANCIAL_RULES, narrative);
  const otherSignals = matched(OTHER_CYBER_RULES, narrative);

  if (womenChildSignals.length > 0) {
    return {
      topLevelRoute: "WOMEN_CHILDREN_RELATED_CRIME",
      label: "Women/Children Related Crime",
      confidence: Math.min(0.98, 0.84 + womenChildSignals.length * 0.05),
      matchedSignals: womenChildSignals,
      explanation: "The account contains an explicit women/child-content signal. This is only a top-level route proposal and must be confirmed by the citizen.",
      requiresHumanConfirmation: true,
    };
  }

  if (financialSignals.length > 0) {
    return {
      topLevelRoute: "FINANCIAL_FRAUD",
      label: "Financial Fraud",
      confidence: Math.min(0.98, 0.82 + financialSignals.length * 0.04),
      matchedSignals: financialSignals,
      explanation: "The account contains bank, payment, credential, or money-movement signals. This is only a top-level route proposal and must be confirmed by the citizen.",
      requiresHumanConfirmation: true,
    };
  }

  if (otherSignals.length > 0) {
    return {
      topLevelRoute: "OTHER_CYBER_CRIME",
      label: "Other Cyber Crime",
      confidence: Math.min(0.94, 0.76 + otherSignals.length * 0.05),
      matchedSignals: otherSignals,
      explanation: "The account contains a cyber incident signal without a clear financial or women/child-content route. The citizen must confirm the proposal.",
      requiresHumanConfirmation: true,
    };
  }

  return {
    topLevelRoute: "UNKNOWN",
    label: "Unknown",
    confidence: 0,
    matchedSignals: [],
    explanation: "The narrative does not contain enough information to propose a top-level route without guessing.",
    requiresHumanConfirmation: true,
  };
}
