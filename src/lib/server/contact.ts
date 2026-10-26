/**
 * The public contact address, from the CONTACT_EMAIL setting (.env.local / hosting settings).
 * Returns null when it is missing or not a plausible email address, so the site never shows a made-up address.
 */
export function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.CONTACT_EMAIL ?? "").trim();
  return /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/.test(v) ? v : null;
}
