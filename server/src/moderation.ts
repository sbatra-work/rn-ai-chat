/**
 * A deliberately simple refusal path.
 *
 * It runs before any model call, so a refused request costs nothing and
 * gives the same answer in fake and real mode. A pattern list is easy to
 * read and test, and easy to fool. See "What I'd improve next" in the
 * README for what a production version would use.
 */

export type ModerationResult =
  { allowed: true } | { allowed: false; category: string; message: string };

interface Rule {
  category: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    category: 'weapons',
    pattern: /\b(make|build|assemble)\b.{0,40}\b(bomb|explosive|firearm|ghost gun)s?\b/i,
  },
  {
    category: 'malware',
    pattern: /\b(write|create|build)\b.{0,40}\b(ransomware|keylogger|malware)\b/i,
  },
  {
    category: 'account_theft',
    pattern: /\b(hack|break|get)\b.{0,20}\binto\b.{0,40}\b(account|email|phone)\b/i,
  },
];

export const REFUSAL_MESSAGE =
  "I can't help with that request. If you think this is a mistake, try rephrasing it.";

export function moderate(text: string): ModerationResult {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { allowed: false, category: rule.category, message: REFUSAL_MESSAGE };
    }
  }
  return { allowed: true };
}
