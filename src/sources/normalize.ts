import type { LiveEvent, Viewer } from '@/shared/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * TikTok payloads come in three shapes depending on library/proto version:
 * v1 flat ({userId, uniqueId}), v2 nested ({user:{userId, uniqueId}}), v3 proto ({user:{id, displayId}}).
 */
export function normalizeUser(raw: Raw): Viewer | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw.user && typeof raw.user === 'object' ? raw.user : raw;
  const uniqueId = str(u.uniqueId || u.displayId).trim();
  const rawId = str(u.userId || u.id).trim();
  if (!uniqueId && !rawId) return null;
  const userId = rawId || `u:${uniqueId}`;
  const avatarUrl =
    u.profilePictureUrl || u.profilePicture?.urls?.[0] || u.avatarThumb?.urlList?.[0] || undefined;
  const viewer: Viewer = { userId, uniqueId: uniqueId || userId, nickname: str(u.nickname) || uniqueId || userId };
  if (avatarUrl) viewer.avatarUrl = String(avatarUrl);
  return viewer;
}

export function normalizeLike(raw: Raw): LiveEvent | null {
  const user = normalizeUser(raw);
  const count = Math.floor(num(raw?.likeCount));
  return user && count > 0 ? { type: 'like', user, count } : null;
}

export function normalizeGift(raw: Raw): LiveEvent | null {
  const user = normalizeUser(raw);
  if (!user) return null;
  const details = raw.giftDetails ?? raw.gift ?? {};
  const giftType = num(details.giftType ?? details.type ?? raw.giftType);
  // Streakable gifts fire repeatedly while the streak runs; only the final event (repeatEnd) counts.
  if (giftType === 1 && !raw.repeatEnd) return null;
  const diamonds = num(raw.diamondCount ?? details.diamondCount);
  const repeat = Math.max(1, Math.floor(num(raw.repeatCount) || 1));
  const giftName = str(raw.giftName ?? details.giftName ?? details.name) || 'Gift';
  if (diamonds <= 0) return null;
  return { type: 'gift', user, giftName, diamonds, repeat };
}

export function normalizeJoin(raw: Raw): LiveEvent | null {
  const user = normalizeUser(raw);
  return user && { type: 'join', user };
}

export function normalizeChat(raw: Raw): LiveEvent | null {
  const user = normalizeUser(raw);
  return user && { type: 'chat', user, text: str(raw.comment) };
}

const TIKFINITY: Record<string, (d: Raw) => LiveEvent | null> = {
  like: normalizeLike,
  gift: normalizeGift,
  member: normalizeJoin,
  chat: normalizeChat,
};

export function normalizeTikFinity(msg: { event: string; data: Raw }): LiveEvent | null {
  if (!msg || typeof msg !== 'object') return null;
  const fn = TIKFINITY[msg.event];
  return fn ? fn(msg.data) : null;
}
