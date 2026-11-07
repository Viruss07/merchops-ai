/**
 * Prompt Injection Defense & Untrusted Text Spotlight
 *
 * Implements input boundary isolation, pattern detection for malicious directives,
 * and strict delimiting to protect AI reasoning and reminder drafting.
 */

const SUSPICIOUS_DIRECTIVE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'instruction_override', regex: /\b(ignore|disregard|forget|override)\b[\s\S]*?\b(instructions|rules|prompts|directives)\b/i },
  { name: 'role_impersonation', regex: /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\b[\s\S]*?\b(system|admin|root|developer|cfo)\b/i },
  { name: 'unauthorized_payout', regex: /\b(pay|disburse|transfer|send|wire)\b[\s\S]*?\b(immediately|now|urgent|funds|cash)\b/i },
  { name: 'prompt_leak', regex: /\b(reveal|output|display|print|show)\b[\s\S]*?\b(system\s+prompt|developer\s+message|api\s+key|instructions)\b/i },
  { name: 'raw_html_script', regex: /<\s*(script|iframe|object|embed|form)[^>]*>/i },
];

export interface SpotlightResult {
  isSuspicious: boolean;
  flags: string[];
  spotlightedText: string;
}

/**
 * Delimits untrusted user/customer text and inspects for injection patterns.
 */
export function spotlightUntrustedInput(rawInput: string, fieldName = 'customer_field'): SpotlightResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isSuspicious: false,
      flags: [],
      spotlightedText: `<<<UNTRUSTED_${fieldName.toUpperCase()}: (empty)>>>`,
    };
  }

  const flags: string[] = [];

  for (const { name, regex } of SUSPICIOUS_DIRECTIVE_PATTERNS) {
    if (regex.test(rawInput)) {
      flags.push(name);
    }
  }

  // Sanitize any nested delimiter attempts
  const sanitized = rawInput
    .replace(/<<<+/g, '<')
    .replace(/>>>+/g, '>')
    .trim();

  const isSuspicious = flags.length > 0;
  const spotlightedText = `<<<UNTRUSTED_${fieldName.toUpperCase()}: ${sanitized}>>>`;

  return {
    isSuspicious,
    flags,
    spotlightedText,
  };
}

