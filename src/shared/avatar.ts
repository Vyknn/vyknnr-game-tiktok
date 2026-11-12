/** FNV-1a 32-bit hash. Same id → same avatar every live. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function avatarIndex(userId: string, count: number): number {
  return fnv1a(userId) % count;
}
