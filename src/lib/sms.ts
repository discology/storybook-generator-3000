// SMS length rules: plain GSM-7 text fits 160 characters in one message (153 per
// part once split). Any other character (emoji, curly quotes) switches the whole
// message to UCS-2, which fits only 70 (67 per part).
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export function smsLength(text: string) {
  const chars = [...text];
  const isGsm = chars.every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
  const units = isGsm ? chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0) : chars.length;
  const [single, multi] = isGsm ? [160, 153] : [70, 67];
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { units, segments, isGsm, single };
}

export const fillTemplate = (body: string, values: Record<string, string>) =>
  body.replace(/<([a-z][a-z0-9_]*)>/g, (match, name) => values[name] ?? match);

export const templateVariables = (body: string) => [...new Set([...body.matchAll(/<([a-z][a-z0-9_]*)>/g)].map((m) => m[1]))];
