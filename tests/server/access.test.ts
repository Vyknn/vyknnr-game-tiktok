import { describe, it, expect } from 'vitest';
import { wsAccess } from '@/server/access';

const T = 'secret-token';
describe('wsAccess', () => {
  it('lets same-origin pages read', () => {
    expect(wsAccess({ url: '/ws', origin: 'http://localhost:3000', host: 'localhost:3000' }, T)).toEqual({ ok: true, canControl: false });
  });
  it('grants control only with the boot token', () => {
    expect(wsAccess({ url: `/ws?token=${T}`, origin: 'http://localhost:3000', host: 'localhost:3000' }, T)).toEqual({ ok: true, canControl: true });
    expect(wsAccess({ url: '/ws?token=wrong', origin: 'http://localhost:3000', host: 'localhost:3000' }, T).canControl).toBe(false);
  });
  it('rejects cross-origin pages (a random website the streamer has open)', () => {
    expect(wsAccess({ url: `/ws?token=${T}`, origin: 'https://evil.example', host: 'localhost:3000' }, T).ok).toBe(false);
  });
  it('allows non-browser clients without Origin (OBS/CLI) as read-only unless token', () => {
    expect(wsAccess({ url: '/ws', host: 'localhost:3000' }, T)).toEqual({ ok: true, canControl: false });
  });
});
