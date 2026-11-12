import Phaser from 'phaser';
import { BIOMES, BIOME_NAMES_TH, GAME } from '@/config/game';
import { biomeForLayer } from '@/engine/digMath';
import type { AvatarView, BagItem, Biome, GameEvent, GameSnapshot, LeaderRow, ArtifactDef } from '@/shared/types';
import { fnv1a } from '@/shared/avatar';
import { generateTextures, PX, RARITY_COLOR } from './art';
import { compact } from './format';
import { biomePalette, isoToScreen, type Palette } from './iso';

export const W = 1080;
export const H = 1920;

const FONT = '"Trebuchet MS", "Tahoma", sans-serif';
const BLOCK = { cx: 540, cy: 640, tiles: 6, tileW: 128, tileH: 64, depth: 320 };
const HP_Y = 1250;
const CROWD_Y = 1400;
const FEED_Y = 1540;
const MAX_PARTICLES = 300;
const CARD_Y = 1070; // over the block's side faces, never over the diggers on top
const RARITY_TH: Record<string, string> = { common: 'ธรรมดา', rare: 'หายาก', epic: 'มหากาพย์', legendary: 'ตำนาน' };

type Avatar = {
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  pick: Phaser.GameObjects.Image;
  crown: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  where: 'block' | 'crowd';
  tx: number;
  ty: number;
  ts: number;
};

const text = (s: Phaser.Scene, x: number, y: number, str: string, size: number, color = '#fff8e7') =>
  s.add.text(x, y, str, {
    fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#2b1a10', strokeThickness: Math.max(4, size / 6),
    fontStyle: 'bold',
  });

/** Renders server snapshots + events. Holds no game rules; everything here is presentation. */
export class DigScene extends Phaser.Scene {
  private snap: GameSnapshot | null = null;
  private palette: Palette = biomePalette('grass', 0);
  private blockGfx!: Phaser.GameObjects.Graphics;
  private block!: Phaser.GameObjects.Container;
  private hpFill!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private layerName!: Phaser.GameObjects.Text;
  private topText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private layerList: Phaser.GameObjects.Text[] = [];
  private feedTexts: Phaser.GameObjects.Text[] = [];
  private overflowText!: Phaser.GameObjects.Text;
  private avatars = new Map<string, Avatar>();
  private dirt!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private overlay: Phaser.GameObjects.Container | null = null;
  private popupQueue: (() => Phaser.GameObjects.Container)[] = [];
  private fpsText: Phaser.GameObjects.Text | null = null;
  private combo!: Phaser.GameObjects.Text;
  private drawnKey = '';

  constructor() {
    super('dig');
  }

  create(): void {
    generateTextures(this);
    this.drawBackdrop();

    this.block = this.add.container(0, 0);
    this.blockGfx = this.add.graphics();
    this.block.add(this.blockGfx);

    this.dirt = this.add.particles(0, 0, 'chunk', {
      emitting: false, lifespan: { min: 450, max: 900 }, speed: { min: 180, max: 420 },
      angle: { min: 200, max: 340 }, gravityY: 1100, scale: { start: 1.2, end: 0.6 }, rotate: { min: 0, max: 360 },
      maxParticles: MAX_PARTICLES,
    });
    this.dirt.setDepth(50);
    this.sparks = this.add.particles(0, 0, 'spark', {
      emitting: false, lifespan: { min: 700, max: 1400 }, speed: { min: 200, max: 700 },
      angle: { min: 0, max: 360 }, gravityY: 400, scale: { start: 2, end: 0 }, maxParticles: MAX_PARTICLES,
    });
    this.sparks.setDepth(200);

    this.drawHud();
    this.combo = text(this, BLOCK.cx, BLOCK.cy - 170, '', 84, '#ffeb3b').setOrigin(0.5).setDepth(150).setAlpha(0);
    if (new URLSearchParams(location.search).has('debug')) {
      this.fpsText = text(this, W - 20, H - 60, '', 28, '#9cff9c').setOrigin(1, 0).setDepth(999);
    }
    if (this.snap) this.applySnapshot(this.snap);
  }

  update(): void {
    if (this.fpsText) this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps · ${this.dirt.getAliveParticleCount()} p`);
  }

  // ───────────────────────────── static layout

  private drawBackdrop(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x3b2416, 0x3b2416, 0x170d07, 0x170d07, 1);
    g.fillRect(0, 0, W, H);
    // mine shaft wood beams
    g.fillStyle(0x5a3a22, 1);
    g.fillRect(0, 0, 36, H);
    g.fillRect(W - 36, 0, 36, H);
    g.fillStyle(0x3a2414, 1);
    for (let y = 60; y < H; y += 180) {
      g.fillRect(0, y, 36, 12);
      g.fillRect(W - 36, y, 36, 12);
    }
  }

  private drawHud(): void {
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x5a3a22, 1).fillRect(0, 0, W, 110);
    g.fillStyle(0x3a2414, 1).fillRect(0, 104, W, 8);
    this.topText = text(this, W / 2, 55, '', 40).setOrigin(0.5).setDepth(101);

    // depth badge
    g.fillStyle(0x2b5d7a, 1).fillRoundedRect(W - 300, 136, 260, 92, 14);
    g.lineStyle(6, 0x173a4f, 1).strokeRoundedRect(W - 300, 136, 260, 92, 14);
    text(this, W - 170, 156, 'ความลึก', 24).setOrigin(0.5, 0).setDepth(101);
    this.depthText = text(this, W - 170, 184, '0 m', 38, '#ffe082').setOrigin(0.5, 0).setDepth(101);

    // layer list
    BIOMES.forEach((b, i) => {
      this.layerList.push(text(this, 60, 140 + i * 40, BIOME_NAMES_TH[b], 28).setDepth(101));
    });

    // HP bar
    this.layerName = text(this, W / 2, HP_Y - 46, '', 34).setOrigin(0.5).setDepth(101);
    g.fillStyle(0x2b1a10, 1).fillRoundedRect(110, HP_Y, W - 220, 44, 10);
    this.hpFill = this.add.graphics().setDepth(101);
    this.hpText = text(this, W / 2, HP_Y + 22, '', 28).setOrigin(0.5).setDepth(102);

    // crowd strip
    g.fillStyle(0x2b1a10, 0.6).fillRoundedRect(40, CROWD_Y - 70, W - 80, 140, 18);
    this.overflowText = text(this, W - 70, CROWD_Y, '', 34, '#ffe082').setOrigin(1, 0.5).setDepth(101);

    // feed
    g.fillStyle(0x000000, 0.45).fillRoundedRect(40, FEED_Y, W - 80, 290, 18);
    g.lineStyle(5, 0x5a3a22, 1).strokeRoundedRect(40, FEED_Y, W - 80, 290, 18);
    for (let i = 0; i < GAME.FEED_MAX; i++) {
      this.feedTexts.push(text(this, 70, FEED_Y + 18 + i * 44, '', 30).setDepth(101).setAlpha(1 - i * 0.12));
    }

    // permanent how-to
    g.fillStyle(0xffca28, 1).fillRoundedRect(40, H - 84, W - 80, 64, 16);
    this.add.text(W / 2, H - 52, '❤ = ขุด 1   |   🎁 = ขุดคูณ   |   พิมพ์ !bag ดูของสะสม', {
      fontFamily: FONT, fontSize: '32px', color: '#2b1a10', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(101);
  }

  private drawBlock(biome: Biome, cycle: number): void {
    this.palette = biomePalette(biome, cycle);
    const p = this.palette;
    const g = this.blockGfx;
    const { cx, cy, tiles, tileW, tileH, depth } = BLOCK;
    const pt = (x: number, y: number, z = 0) => {
      const { sx, sy } = isoToScreen(x, y, z, tileW, tileH);
      return new Phaser.Math.Vector2(cx + sx, cy + sy);
    };
    g.clear();
    const n = tiles;
    // left face
    g.fillStyle(p.left, 1);
    g.fillPoints([pt(0, n), pt(n, n), pt(n, n, -depth), pt(0, n, -depth)], true);
    // right face
    g.fillStyle(p.right, 1);
    g.fillPoints([pt(n, 0), pt(n, n), pt(n, n, -depth), pt(n, 0, -depth)], true);
    // strata lines on side faces (deterministic speckles)
    for (let i = 0; i < 60; i++) {
      const h = fnv1a(`${biome}${i}`);
      const t = (h % 1000) / 1000;
      const z = -((h >> 10) % depth);
      const left = i % 2 === 0;
      const a = left ? pt(t * n, n, z) : pt(n, t * n, z);
      g.fillStyle(p.accent, 0.8);
      g.fillRect(a.x - PX * 2, a.y, PX * 4, PX * 2);
    }
    // top: checker tiles
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        g.fillStyle((x + y) % 2 ? p.top : Phaser.Display.Color.IntegerToColor(p.top).darken(6).color, 1);
        g.fillPoints([pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)], true);
      }
    }
    g.lineStyle(4, 0x2b1a10, 0.5);
    g.strokePoints([pt(0, 0), pt(n, 0), pt(n, n), pt(0, n)], true);
  }

  // ───────────────────────────── snapshot

  applySnapshot(s: GameSnapshot): void {
    this.snap = s;
    if (!this.blockGfx) return; // scene not created yet; replayed in create()
    const { biome, cycle } = biomeForLayer(s.layer);
    const key = `${biome}:${cycle}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.drawBlock(biome, cycle);
    }
    this.topText.setText(`⛏ ${compact(s.totalDigs)} ครั้ง    👥 ${s.activeCount} คนกำลังขุด`);
    this.depthText.setText(`${s.depthM.toLocaleString()} m`);
    this.layerList.forEach((t, i) => {
      const on = BIOMES[i] === biome;
      t.setColor(on ? '#ffca28' : '#c8b8a6').setText(`${on ? '▶ ' : '   '}${BIOME_NAMES_TH[BIOMES[i]]}`);
    });
    this.layerName.setText(`ชั้น ${s.layer + 1} · ${BIOME_NAMES_TH[biome]}`);
    const ratio = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1);
    this.hpFill.clear().fillStyle(0xe53935, 1).fillRoundedRect(116, HP_Y + 6, (W - 232) * ratio, 32, 8);
    this.hpText.setText(`${compact(s.hp)} / ${compact(s.maxHp)}`);
    this.feedTexts.forEach((t, i) => t.setText(s.feed[i] ?? ''));
    this.overflowText.setText(s.crowdOverflow > 0 ? `+${s.crowdOverflow}` : '');
    this.syncAvatars(s);
  }

  private blockSlot(userId: string, idx: number) {
    // deterministic spot on the top face; idx spreads collisions
    const h = fnv1a(userId) + idx * 7919;
    const tx = 0.8 + (h % 440) / 100;
    const ty = 0.8 + ((h >> 9) % 440) / 100;
    const { sx, sy } = isoToScreen(tx, ty, 0, BLOCK.tileW, BLOCK.tileH);
    return { x: BLOCK.cx + sx, y: BLOCK.cy + sy };
  }

  private crowdSlot(i: number) {
    const per = 20;
    const span = W - 260;
    return { x: 90 + (span / (per - 1)) * i, y: CROWD_Y + 40 };
  }

  private syncAvatars(s: GameSnapshot): void {
    const keep = new Set<string>();
    const place = (a: AvatarView, where: 'block' | 'crowd', i: number) => {
      keep.add(a.userId);
      const pos = where === 'block' ? this.blockSlot(a.userId, i) : this.crowdSlot(i);
      let av = this.avatars.get(a.userId);
      if (!av) {
        av = this.makeAvatar(a);
        av.root.setPosition(pos.x, pos.y - 400);
        this.avatars.set(a.userId, av);
      }
      const scale = where === 'block' ? (a.crowned ? 1.5 : 1) : 0.55;
      av.label.setText(a.bonus > 1.001 ? `@${a.uniqueId} ×${a.bonus.toFixed(2)}` : `@${a.uniqueId}`);
      av.label.setVisible(where === 'block');
      av.crown.setVisible(a.crowned);
      av.pick.setVisible(where === 'block');
      av.root.setDepth(where === 'block' ? 40 + pos.y / 100 : 110);
      if (av.tx !== pos.x || av.ty !== pos.y || av.ts !== scale) {
        av.tx = pos.x; av.ty = pos.y; av.ts = scale;
        this.tweens.killTweensOf(av.root);
        this.tweens.add({
          targets: av.root, x: pos.x, y: pos.y, scale, duration: 450, ease: where === 'block' ? 'Back.Out' : 'Quad.Out',
        });
      }
      av.where = where;
    };
    s.onBlock.forEach((a, i) => place(a, 'block', i));
    s.crowd.forEach((a, i) => place(a, 'crowd', i));
    for (const [id, av] of this.avatars) {
      if (!keep.has(id)) {
        this.tweens.killTweensOf([av.root, av.sprite, av.pick]);
        av.root.destroy();
        this.avatars.delete(id);
      }
    }
  }

  private makeAvatar(a: AvatarView): Avatar {
    const sprite = this.add.image(0, 0, `avatar${a.avatarIndex}`).setOrigin(0.5, 1);
    const pick = this.add.image(26, -40, 'pick').setOrigin(0.5, 1).setAngle(30);
    const crown = this.add.image(0, -84, 'crown').setOrigin(0.5, 1).setVisible(false);
    const label = text(this, 0, -96, '', 24).setOrigin(0.5, 1);
    const root = this.add.container(0, 0, [sprite, pick, crown, label]);
    return { root, sprite, pick, crown, label, where: 'crowd', tx: NaN, ty: NaN, ts: NaN };
  }

  // ───────────────────────────── events

  applyEvents(events: GameEvent[]): void {
    if (!this.blockGfx) return;
    for (const e of events) {
      switch (e.k) {
        case 'dig': this.onDig(e.userId, e.digs, e.big); break;
        case 'layerBroken': this.onLayerBroken(); break;
        case 'artifact':
          if (e.artifact.rarity === 'common') this.toast(e.userId, e.artifact);
          else this.queuePopup(() => this.artifactCard(e.uniqueId, e.artifact));
          break;
        case 'bag': this.queuePopup(() => this.bagCard(e.uniqueId, e.items, e.bonus)); break;
        case 'leaderboard': this.queuePopup(() => this.leaderCard(e.rows)); break;
      }
    }
  }

  private onDig(userId: string, digs: number, big: boolean): void {
    const av = this.avatars.get(userId);
    const x = av?.where === 'block' ? av.root.x : BLOCK.cx;
    const y = av?.where === 'block' ? av.root.y : BLOCK.cy + BLOCK.tileH * 3;
    if (av?.where === 'block') {
      this.tweens.add({ targets: av.pick, angle: { from: 30, to: -60 }, duration: 110, yoyo: true });
      this.tweens.add({ targets: av.sprite, scaleY: { from: 1, to: 0.88 }, duration: 110, yoyo: true });
    }
    const room = MAX_PARTICLES - this.dirt.getAliveParticleCount();
    const count = Math.min(room, big ? 40 : 8);
    if (count > 0) {
      this.dirt.setParticleTint(this.palette.dirt);
      this.dirt.explode(count, x, y);
    }
    if (big) {
      const t = this.combo;
      this.tweens.killTweensOf(t);
      t.setText(`+${compact(digs)} ⛏`).setPosition(BLOCK.cx, BLOCK.cy - 170).setScale(0.3).setAlpha(1);
      this.tweens.add({ targets: t, scale: 1.1, duration: 240, ease: 'Back.Out' });
      this.tweens.add({ targets: t, y: t.y - 120, alpha: 0, delay: 700, duration: 600 });
      this.cameras.main.shake(180, 0.004);
    }
  }

  private onLayerBroken(): void {
    this.tweens.killTweensOf(this.block);
    this.block.y = 0;
    this.tweens.add({ targets: this.block, y: 24, duration: 90, yoyo: true, ease: 'Quad.Out' });
    this.cameras.main.flash(120, 255, 255, 255, false);
    const room = MAX_PARTICLES - this.dirt.getAliveParticleCount();
    if (room > 0) {
      this.dirt.setParticleTint(this.palette.dirt);
      this.dirt.explode(Math.min(room, 30), BLOCK.cx, BLOCK.cy + BLOCK.tileH * 3);
    }
  }

  // ───────────────────────────── popups (one at a time)

  private queuePopup(make: () => Phaser.GameObjects.Container): void {
    if (this.popupQueue.length > 8) this.popupQueue.shift(); // never let a backlog build up on stream
    this.popupQueue.push(make);
    if (!this.overlay) this.nextPopup();
  }

  private nextPopup(): void {
    const make = this.popupQueue.shift();
    if (!make) { this.overlay = null; return; }
    this.overlay = make();
  }

  private card(height: number, color: number, holdMs: number, fill: (c: Phaser.GameObjects.Container) => void) {
    const c = this.add.container(W / 2, CARD_Y).setDepth(300);
    const bg = this.add.graphics();
    bg.fillStyle(0x1b120c, 0.92).fillRoundedRect(-420, -height / 2, 840, height, 28);
    bg.lineStyle(10, color, 1).strokeRoundedRect(-420, -height / 2, 840, height, 28);
    c.add(bg);
    fill(c);
    c.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 280, ease: 'Back.Out' });
    this.tweens.add({
      targets: c, alpha: 0, scale: 0.9, delay: holdMs, duration: 300,
      onComplete: () => { c.destroy(); this.nextPopup(); },
    });
    return c;
  }

  /** Small icon floating up from the digger — commons are frequent, so they never block the screen. */
  private toast(userId: string, a: ArtifactDef): void {
    const av = this.avatars.get(userId);
    const x = av?.where === 'block' ? av.root.x : BLOCK.cx;
    const y = (av?.where === 'block' ? av.root.y : BLOCK.cy) - 110;
    const icon = this.add.image(x, y, `icon-${a.rarity}`).setTint(RARITY_COLOR[a.rarity]).setScale(1.4).setDepth(160);
    this.tweens.add({ targets: icon, y: y - 120, alpha: 0, duration: 1200, ease: 'Quad.Out', onComplete: () => icon.destroy() });
  }

  private artifactCard(uniqueId: string, a: ArtifactDef) {
    const color = RARITY_COLOR[a.rarity];
    if (a.rarity === 'legendary') {
      this.cameras.main.shake(400, 0.01);
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(i * 180, () => {
          this.sparks.setParticleTint([0xffca28, 0xff7043, 0xffffff, 0x4fc3f7][i]);
          this.sparks.explode(60, Phaser.Math.Between(200, 880), Phaser.Math.Between(300, 900));
        });
      }
    }
    return this.card(200, color, a.rarity === 'legendary' ? 3000 : 1800, (c) => {
      const glow = this.add.circle(-300, 0, 80, color, 0.25);
      this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.05, duration: 700, yoyo: true, repeat: -1 });
      // Phaser doesn't kill tweens when their target is destroyed; an infinite one would live forever.
      c.once(Phaser.GameObjects.Events.DESTROY, () => this.tweens.killTweensOf(glow));
      const icon = this.add.image(-300, 0, `icon-${a.rarity}`).setTint(color).setScale(2.4);
      c.add([glow, icon,
        text(this, -190, -30, `@${uniqueId} ได้ ${a.name}!`, 38).setOrigin(0, 0.5),
        text(this, -190, 34, RARITY_TH[a.rarity], 32, `#${color.toString(16).padStart(6, '0')}`).setOrigin(0, 0.5)]);
    });
  }

  private bagCard(uniqueId: string, items: BagItem[], bonus: number) {
    const shown = items.slice(0, 12);
    const rows = Math.max(1, Math.ceil(shown.length / 4));
    return this.card(260 + rows * 130, 0xffca28, GAME.BAG_SHOW_MS, (c) => {
      const top = -(130 + rows * 130) / 2;
      c.add(text(this, 0, top + 30, `🎒 ของสะสมของ @${uniqueId}`, 38).setOrigin(0.5));
      c.add(text(this, 0, top + 80, `พลังขุด ×${bonus.toFixed(2)}`, 30, '#ffe082').setOrigin(0.5));
      if (!shown.length) c.add(text(this, 0, top + 170, 'ยังไม่มีของ — ขุดต่อเลย!', 32).setOrigin(0.5));
      shown.forEach((it, i) => {
        const x = -300 + (i % 4) * 200;
        const y = top + 180 + Math.floor(i / 4) * 130;
        c.add(this.add.image(x, y, `icon-${it.artifact.rarity}`).setTint(RARITY_COLOR[it.artifact.rarity]).setScale(1.6));
        c.add(text(this, x + 40, y + 10, `×${it.count}`, 26).setOrigin(0, 0.5));
        c.add(text(this, x, y + 48, it.artifact.name, 20, '#c8b8a6').setOrigin(0.5));
      });
    });
  }

  private leaderCard(rows: LeaderRow[]) {
    return this.card(140 + rows.length * 70, 0x42a5f5, 6000, (c) => {
      const top = -(140 + rows.length * 70) / 2;
      c.add(text(this, 0, top + 50, '🏆 นักสะสมสมบัติ', 42).setOrigin(0.5));
      rows.forEach((r, i) => {
        const y = top + 120 + i * 70;
        c.add(text(this, -340, y, `${i + 1}. @${r.uniqueId}`, 32).setOrigin(0, 0.5));
        c.add(text(this, 340, y, `${r.score} แต้ม${r.legendaries ? ` · 👑${r.legendaries}` : ''}`, 30, '#ffe082')
          .setOrigin(1, 0.5));
      });
    });
  }
}
