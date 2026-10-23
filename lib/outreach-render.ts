/*
 * Template personalization, shared by the browser preview and the server.
 * Placeholders: {{first_name}}, {{last_name}}, {{full_name}}.
 */

export const TEMPLATE_PLACEHOLDERS = [
  "first_name",
  "last_name",
  "full_name",
] as const;

export type TemplateVoterFields = {
  first?: string | null;
  last?: string | null;
  full?: string | null;
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

export function renderTemplate(body: string, voter: TemplateVoterFields) {
  const first = titleCase((voter.first || "").trim());
  const last = titleCase((voter.last || "").trim());
  const full =
    titleCase((voter.full || "").trim()) || [first, last].filter(Boolean).join(" ");

  const values: Record<string, string> = {
    first_name: first || "there",
    last_name: last,
    full_name: full || "there",
  };

  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

/* Placeholders left in the text that we don't know how to fill. */
export function findUnknownPlaceholders(text: string) {
  const unknown = new Set<string>();

  for (const [, key] of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    if (!TEMPLATE_PLACEHOLDERS.includes(key.toLowerCase() as never)) {
      unknown.add(key);
    }
  }

  return [...unknown];
}

export function getSmsSegments(text: string) {
  if (!text) return 0;
  // GSM-7 vs UCS-2 (emoji, smart quotes, etc.)
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const single = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/*
 * "sms:<number>?&body=" works on both iOS and Android Messages.
 */
export function buildSmsLink(phone: string, body: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}

export function formatPhone(phone?: string | null) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length !== 10) return phone || "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
