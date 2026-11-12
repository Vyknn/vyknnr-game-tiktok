import { describe, it, expect } from 'vitest';
import {
  normalizeUser, normalizeLike, normalizeGift, normalizeJoin, normalizeChat, normalizeTikFinity,
} from '@/sources/normalize';
import * as f from './fixtures';

const nong = { userId: '42', uniqueId: 'nong', nickname: 'Nong', avatarUrl: 'https://p/1.jpg' };

describe('normalizeUser', () => {
  it('reads v1, v2 and v3 user shapes identically', () => {
    expect(normalizeUser(f.v1Like)).toEqual(nong);
    expect(normalizeUser(f.v2Like)).toEqual(nong);
    expect(normalizeUser(f.v3Like)).toEqual(nong);
  });
  it('falls back to u:<uniqueId> when userId is missing', () => {
    expect(normalizeUser(f.noUserId)?.userId).toBe('u:ghost');
  });
  it('returns null with no identity at all', () => {
    expect(normalizeUser(f.noUser)).toBeNull();
    expect(normalizeUser(null)).toBeNull();
  });
  it('uses uniqueId when nickname is empty', () => {
    expect(normalizeUser(f.v2Member)?.nickname).toBe('joe');
  });
});

describe('normalizeLike', () => {
  it('gives equal events for every payload version', () => {
    const e = { type: 'like', user: nong, count: 15 };
    expect(normalizeLike(f.v1Like)).toEqual(e);
    expect(normalizeLike(f.v2Like)).toEqual(e);
    expect(normalizeLike(f.v3Like)).toEqual(e);
  });
  it('drops zero likes and missing users', () => {
    expect(normalizeLike({ ...f.v2Like, likeCount: 0 })).toBeNull();
    expect(normalizeLike(f.noUser)).toBeNull();
  });
});

describe('normalizeGift', () => {
  it('ignores a streak in progress and counts it once at the end', () => {
    expect(normalizeGift(f.v2GiftStreakMid)).toBeNull();
    expect(normalizeGift(f.v2GiftStreakEnd)).toMatchObject({ type: 'gift', giftName: 'Rose', diamonds: 1, repeat: 10 });
    expect(normalizeGift(f.v3GiftStreakMid)).toBeNull();
    expect(normalizeGift(f.v3GiftStreakEnd)).toMatchObject({ diamonds: 1, repeat: 10, user: { userId: '42' } });
  });
  it('counts non-streak gifts immediately', () => {
    expect(normalizeGift(f.v2GiftNonStreak)).toMatchObject({ giftName: 'Galaxy', diamonds: 1000, repeat: 1 });
  });
  it('reads flat v1 gifts', () => {
    expect(normalizeGift(f.v1GiftFlat)).toMatchObject({ diamonds: 1, repeat: 5 });
  });
});

describe('join / chat', () => {
  it('normalizes member and chat', () => {
    expect(normalizeJoin(f.v2Member)?.type).toBe('join');
    expect(normalizeChat(f.v2Chat)).toMatchObject({ type: 'chat', text: '!bag' });
  });
});

describe('normalizeTikFinity', () => {
  it('maps envelopes to LiveEvents', () => {
    expect(normalizeTikFinity(f.tikfinityGift)).toMatchObject({ type: 'gift', repeat: 3 });
    expect(normalizeTikFinity(f.tikfinityMember)?.type).toBe('join');
  });
  it('returns null for unknown or malformed envelopes', () => {
    expect(normalizeTikFinity(f.tikfinityUnknown)).toBeNull();
    expect(normalizeTikFinity({} as never)).toBeNull();
    expect(normalizeTikFinity(null as never)).toBeNull();
  });
});
