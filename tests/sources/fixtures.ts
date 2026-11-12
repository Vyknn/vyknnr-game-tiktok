/** Realistic payloads. v1 = legacy flat, v2 = README nested, v3 = protobuf shape emitted by tiktok-live-connector 2.5. */
export const v1Like = { userId: '42', uniqueId: 'nong', nickname: 'Nong', profilePictureUrl: 'https://p/1.jpg', likeCount: 15 };
export const v2Like = {
  user: { userId: '42', uniqueId: 'nong', nickname: 'Nong', profilePicture: { urls: ['https://p/1.jpg'] } },
  likeCount: 15,
};
export const v3Like = {
  user: { id: '42', displayId: 'nong', nickname: 'Nong', avatarThumb: { urlList: ['https://p/1.jpg'] } },
  count: 15, total: '1200',
};
export const v3Chat = { user: { id: '7', displayId: 'joe', nickname: 'Joe' }, content: '!bag' };
export const v2GiftStreakMid = {
  user: { userId: '42', uniqueId: 'nong', nickname: 'Nong' },
  repeatCount: 4, repeatEnd: false, giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1 },
};
export const v2GiftStreakEnd = { ...v2GiftStreakMid, repeatCount: 10, repeatEnd: true };
export const v2GiftNonStreak = {
  user: { userId: '42', uniqueId: 'nong', nickname: 'Nong' },
  repeatCount: 1, repeatEnd: false, giftDetails: { giftType: 2, giftName: 'Galaxy', diamondCount: 1000 },
};
export const v3GiftStreakMid = {
  user: { id: '42', displayId: 'nong', nickname: 'Nong' },
  repeatCount: 3, repeatEnd: 0, gift: { id: '5655', name: 'Rose', type: 1, diamondCount: 1 },
};
export const v3GiftStreakEnd = { ...v3GiftStreakMid, repeatCount: 10, repeatEnd: 1 };
export const v1GiftFlat = {
  userId: '42', uniqueId: 'nong', nickname: 'Nong',
  giftType: 1, repeatEnd: true, repeatCount: 5, giftName: 'Rose', diamondCount: 1,
};
export const v2Member = { user: { userId: '7', uniqueId: 'joe', nickname: '' } };
export const v2Chat = { user: { userId: '7', uniqueId: 'joe', nickname: 'Joe' }, comment: '!bag' };
export const noUserId = { user: { uniqueId: 'ghost', nickname: 'Ghost' }, likeCount: 2 };
export const noUser = { likeCount: 2 };
export const tikfinityGift = {
  event: 'gift',
  data: { userId: '42', uniqueId: 'nong', nickname: 'Nong', giftType: 1, repeatEnd: true, repeatCount: 3, giftName: 'Rose', diamondCount: 1 },
};
export const tikfinityMember = { event: 'member', data: { userId: '7', uniqueId: 'joe', nickname: 'Joe' } };
export const tikfinityUnknown = { event: 'roomUser', data: { viewerCount: 10 } };
