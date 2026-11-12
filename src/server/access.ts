import { timingSafeEqual } from 'node:crypto';

export type UpgradeInfo = { url: string; origin?: string; host?: string };
export type Access = { ok: boolean; canControl: boolean };

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Browsers don't apply CORS to WebSockets, so any open tab could talk to localhost.
 * Rule: reject foreign Origins; only clients holding the per-boot token may send commands.
 */
export function wsAccess(req: UpgradeInfo, token: string): Access {
  if (req.origin) {
    let originHost = '';
    try { originHost = new URL(req.origin).host; } catch { return { ok: false, canControl: false }; }
    if (originHost !== req.host) return { ok: false, canControl: false };
  }
  const given = new URL(req.url, 'http://x').searchParams.get('token') ?? '';
  return { ok: true, canControl: given !== '' && sameToken(given, token) };
}
