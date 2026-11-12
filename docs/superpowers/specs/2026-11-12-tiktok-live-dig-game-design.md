# TikTok Live Dig Game — Design

ชื่อชั่วคราว: **Dig Party** (ชื่อจริงตั้งทีหลังได้)

## 1. Intent / ทำไม

เกมสำหรับเปิดบนไลฟ์ TikTok ให้คนดูมีส่วนร่วม: กดหัวใจ/ส่งของขวัญ = ขุดดินในเกม
เป้าหมายคือทำให้คนดูรู้สึก "ฉันเป็นคนขุด" — เห็นตัวละครตัวเอง, เห็นดินกระเด็นจากการกดของตัวเอง,
ได้สมบัติที่เป็นของตัวเองเก็บข้ามไลฟ์ — เพื่อกระตุ้น like, gift, และการกลับมาดูไลฟ์ครั้งต่อไป

แรงบันดาลใจด้าน **แนวเกม** คือ idle/clicker ขุดดินมุม isometric pixel art (ภาพอ้างอิง `image.png`, `image copy.png`)
**ต้องเป็นงานต้นฉบับ** — ห้ามใช้ชื่อ ตัวละคร ภาพ UI หรือหน้าตาของเกมอ้างอิง ใช้ได้แค่ "แนว" (isometric, pixel art, ขุดชั้นหิน)

## 2. Goals

- คนดูกด ❤ → ขุด 1 ครั้ง, ส่งของขวัญ → ขุดหลายครั้งตามมูลค่า
- บล็อกดิน isometric ตรงกลางจอ ลึกลงเป็นชั้นหิน (biome) ต่างกัน, ดินกระเด็นทุกครั้งที่ขุด
- คนดูมีตัวละคร pixel แทนตัว (layout B ด้านล่าง)
- ขุดแต่ละครั้งมีโอกาสได้ artifact → เป็นของคนที่ขุดครั้งนั้น, เก็บสะสมข้ามไลฟ์, ให้โบนัสขุดแรงขึ้น
- ความลึกเริ่มใหม่ทุกไลฟ์
- โหมดทดสอบ (ปุ่มจำลอง like/gift/join) ใช้โดยไม่ต้องเปิดไลฟ์

## 3. Non-goals (รอบแรก)

- ไม่มีร้านค้า/อัปเกรดแบบ helper DPS, prestige, quest, challenge แบบเกมอ้างอิง
- ไม่มีระบบบัญชี/login หรือเว็บให้คนดูเข้ามาดูคอลเลกชันนอกไลฟ์
- ไม่ deploy ขึ้น cloud — รันบนเครื่องสตรีมเมอร์
- ไม่รองรับหลายช่อง/หลายสตรีมเมอร์พร้อมกัน

## 4. Anti-goals (ถือว่าล้มเหลวแม้จะ "ทำงานได้")

ข้อเหล่านี้เป็น **คำแนะนำของผู้ออกแบบ** (ผู้ใช้ให้แนะนำเอง):

1. **จอหน่วง/กระตุก** ใน OBS ตอนของขวัญใหญ่หรือคนเข้าเยอะ → ต้องคง ~60fps; จำกัด sprite/particle
2. **คนดูไม่รู้ว่าเล่นยังไง** → ต้องมีข้อความวิธีเล่นถาวรบนจอ ("❤ = ขุด 1 | 🎁 = ขุดคูณ") 
3. **กดแล้วไม่เห็นผลของตัวเอง** → ทุก like/gift ต้องมี feedback ที่ผูกกับชื่อคนนั้นภายใน ~1 วินาที
4. **ของขวัญใหญ่ไม่ "ว้าว"** → gift ใหญ่ต้องมี combo/effect ใหญ่กว่า like ชัดเจน
5. **ขุดเร็วจนจบ/ช้าจนน่าเบื่อ** → ไม่มีจุดจบ (ชั้นวนลึกไม่สิ้นสุด, HP โตขึ้นเรื่อยๆ); เปลี่ยนชั้นทุก ~1–3 นาทีในไลฟ์ที่คนดูปานกลาง
6. **คนดูเก่าเก่งเกินจนคนใหม่รู้สึกไร้ค่า** → โบนัส artifact มีเพดาน
7. **ขาดการเชื่อมต่อแล้วเกมตาย** → reconnect อัตโนมัติ, เกมเดินต่อไม่ crash

## 5. Constraints

- **Next.js** (ผู้ใช้กำหนด)
- เปิดเป็น Browser Source ใน OBS / TikTok Live Studio ที่ `http://localhost:3000/game`
- จอแนวตั้ง **1080×1920 (9:16)**
- ห้ามลอกทรัพย์สินทางปัญญาของเกมอ้างอิง

## 6. How — ส่วนที่ตัดสินแล้ว

### 6.1 Stack (ผู้ออกแบบเลือก, ผู้ใช้รับ)

| ส่วน | เลือก |
|---|---|
| Web app | Next.js (App Router) + TypeScript |
| Game render | **Phaser 3** ใน client component, โหลดด้วย `dynamic(..., { ssr: false })`, `pixelArt: true` |
| TikTok events | **`tiktok-live-connector`** (Node) — เชื่อมด้วย username ไลฟ์, ไม่ต้อง login |
| Server ↔ เกม | WebSocket (custom Node server รัน Next.js + connector + ws ในโปรเซสเดียว) |
| เก็บข้อมูลถาวร | **SQLite** ไฟล์บนเครื่อง (`data/game.db`) |

ชั้นรับ event ต้องแยกเป็น adapter ที่ปล่อย event รูปแบบกลางเดียวกัน — **v1 มี 3 adapter** (ผู้ใช้เลือกทั้ง ก และ ข):

| Adapter | ใช้เมื่อ | หมายเหตุ |
|---|---|---|
| `ConnectorSource` (ก) | ค่าเริ่มต้น | `tiktok-live-connector` + signing server **Euler Stream** (ภายนอก, มี rate limit, ใส่ API key ได้ใน `/control` หรือ `.env`) |
| `TikFinitySource` (ข) | ทางสำรอง / เมื่อ Euler ล่มหรือติด limit | รับ event จากแอป TikFinity ที่รันบนเครื่อง (ผ่าน WebSocket/webhook ของ TikFinity) — ไม่ผ่านบริการที่สาม |
| `MockSource` | ทดสอบ | ปุ่มจำลองใน `/control` |

- `/control` เลือกแหล่ง event ได้ (ก / ข) — ใช้ทีละแหล่ง ไม่รวมพร้อมกัน (กันนับซ้ำ)
- `MockSource` ใช้ร่วมกับแหล่งจริงได้เสมอ
- แต่ละ adapter รับผิดชอบ reconnect ของตัวเองและรายงานสถานะ (connected / reconnecting / error) ไปที่ `/control`
- หมายเหตุ: payload ของ TikFinity ต่างจาก connector (เช่นชื่อ field, การส่ง streak ของขวัญ) — adapter ต้อง normalize ให้ตรง `LiveEvent` รวมถึง `userId`

Event กลาง:
```ts
type LiveEvent =
  | { type: 'like';   user: Viewer; count: number }
  | { type: 'gift';   user: Viewer; giftName: string; diamonds: number; repeat: number }
  | { type: 'join';   user: Viewer }
  | { type: 'chat';   user: Viewer; text: string }
type Viewer = { id: string; username: string; nickname: string; avatarUrl?: string }
```

### 6.2 กติกาการขุด

- ❤ 1 = **1 dig** (TikTok ส่ง like เป็นก้อน `likeCount` → แตกเป็น N digs)
- ของขวัญ = `diamonds × repeat × GIFT_MULTIPLIER` digs (ค่าเริ่ม `GIFT_MULTIPLIER = 10`, เช่น Rose 1💎 = 10 digs)
- ของขวัญ streak (repeatEnd) — นับตอนจบ streak เท่านั้น ไม่นับซ้ำ
- damage ต่อ dig = `BASE_DAMAGE × playerBonus(user)`
- ทุก dig เข้า **คิว** พร้อม `userId`; เกมดึงจากคิวแบบทยอย (เช่น สูงสุด ~30 dig animation/วินาที, ส่วนเกินรวมเป็น damage ก้อนเดียวต่อเฟรม) เพื่อไม่ให้จอระเบิด
- ค่าตัวคูณทั้งหมดอยู่ในไฟล์ config เดียว (`config/game.ts`)

### 6.3 ชั้นหิน (Layers)

- บล็อกมี HP; HP หมด → ชั้นแตก → ลงชั้นถัดไป, ความลึก +N เมตร
- Biome เปลี่ยนทุก ~10 ชั้น วนไปเรื่อยๆ ไม่สิ้นสุด ตัวอย่าง: หญ้า → ดิน → หิน → ถ่านหิน → คริสตัล → หินอ่อน → แมกมา → (วนด้วยสีเข้มขึ้น)
- `layerHP(n) = BASE_HP × GROWTH^n` (ค่าเริ่มตั้งให้ชั้นแรกๆ แตกใน ~30–60 วิ ที่คนดูปานกลาง)
- เริ่มที่ชั้น 0 ทุกครั้งที่เริ่มไลฟ์ (ผู้ใช้กำหนด)

### 6.3.1 Session / state ownership (การตัดสินใจของผู้ออกแบบ)

- **Server เป็นเจ้าของ game state** (depth, HP, คิว, active viewers); หน้า `/game` เป็นแค่ตัวแสดงผล — refresh OBS แล้วดึง snapshot จาก server ต่อได้ทันที
- **"ไลฟ์ใหม่" = connect ไปยัง roomId ที่ต่างจากครั้งก่อน หรือกดปุ่ม "เริ่มไลฟ์ใหม่" ใน `/control`** → รีเซ็ต depth
- reconnect เข้า roomId เดิม (เน็ตหลุด) → ไม่รีเซ็ต
- session state (roomId, depth, HP) บันทึกลง SQLite ทุก ~5 วิ → Node crash แล้วเปิดใหม่ก็กลับมาต่อได้

### 6.4 ตัวละครคนดู (Layout B — ผู้ใช้เลือก)

- คนดูที่ join/like/gift ได้ avatar pixel
- **คนที่ active** (like/gift ใน ~15 วิล่าสุด) กระโดดขึ้นไปขุดบนบล็อก, **เงียบ** → กลับลงแถวคนดูด้านล่าง
- เพดาน: บนบล็อก ≤ 12 ตัว, แถวคนดู ≤ ~20 ตัว + ป้าย "+N"
- ตัวละครเลือกจากชุด sprite ต้นฉบับ โดย hash username (คนเดิมได้ตัวเดิมทุกไลฟ์)
- ป้าย `@username` บนหัว + ตัวคูณโบนัส (เช่น `×1.4`) ถ้ามี
- ส่งของขวัญใหญ่ → ตัวขยาย + มงกุฎชั่วคราว
- ดินกระเด็น (particle สีตาม biome) ทุกครั้งที่ขุด

### 6.5 Artifact

- **จำนวนครั้งที่สุ่ม** (การตัดสินใจของผู้ออกแบบ): like 1 ครั้ง = สุ่ม 1 ครั้ง; ของขวัญ = สุ่ม `ceil(sqrt(digs))` ครั้ง สูงสุด 20 ครั้งต่อของขวัญ — ของขวัญใหญ่ลุ้นได้มากกว่าชัดเจน แต่ไม่ได้ของหลายร้อยชิ้นจนโบนัสเต็มในครั้งเดียว (กัน anti-goal 6)
- **เป็นของคนที่ dig ครั้งนั้น** (ผู้ใช้กำหนด), เก็บใน SQLite ข้ามไลฟ์
- **คีย์เจ้าของ** (การตัดสินใจของผู้ออกแบบ): ใช้ TikTok numeric `userId` เป็น primary key (เปลี่ยนชื่อ @ แล้วของไม่หาย), เก็บ `uniqueId`/nickname ล่าสุดไว้แสดงผล; hash ตัวละครก็ใช้ `userId`
- แต่ละ biome มีชุด artifact ของตัวเอง; ระดับ: common / rare / epic / legendary
- Effect ตอนได้: ไอเทมเด้งกลางจอ + glow สีตาม rarity + ประกาศ "@user ได้ X!"; legendary → จอสั่น + พลุ
- **โบนัส** (ผู้ใช้กำหนดว่าขุดแรงขึ้น; ตัวเลขเป็นคำแนะนำ):
  - common +1%, rare +3%, epic +8%, legendary +25%
  - **รวมแบบบวก** และ **เพดาน ×5** → `playerBonus = min(5, 1 + Σbonus)`
  - มีผลกับ dig ของคนนั้นเท่านั้น
- พิมพ์ `!bag` ในแชท → จอโชว์คอลเลกชันคนนั้นสั้นๆ
- Leaderboard นักสะสม สลับขึ้นจอเป็นระยะ

### 6.6 หน้าจอ (1080×1920)

บนลงล่าง:
1. Top bar: จำนวน dig รวม / คนดู active / ความลึก (m)
2. รายการชั้นหิน (ซ้าย) + ชั้นปัจจุบันไฮไลต์
3. บล็อก isometric + คนขุด + ดินกระเด็น + combo text
4. HP bar ชั้นปัจจุบัน + ชื่อชั้น
5. แถวคนดู
6. Feed (gift / like / join / artifact) + บรรทัดวิธีเล่นถาวร

### 6.7 หน้าอื่น

- `/game` — หน้าเกมสำหรับ OBS (โปร่งใสไม่จำเป็น, พื้นหลังทึบ)
- `/control` — หน้าควบคุมของสตรีมเมอร์: เลือกแหล่ง event (Connector / TikFinity), ใส่ username ไลฟ์ (+ Euler API key ถ้ามี) หรือ TikFinity endpoint → connect/disconnect, สถานะ, ปุ่มจำลอง like/gift/join, ปุ่มเริ่มไลฟ์ใหม่ (รีเซ็ตความลึก)

## 7. Art direction

- Pixel art ต้นฉบับ, isometric, โทนอุ่น ไม้/หิน แบบภาพอ้างอิง **แต่ไม่ลอก**
- รอบแรกอนุญาต placeholder art (สร้างด้วยโค้ด/รูปทรงเรียบ) เพื่อให้ระบบเดินได้ก่อน แล้วค่อยใส่ sprite จริง
- ชุดตัวละครเริ่ม ~8 ตัว, artifact ~5 ชิ้นต่อ biome

## 8. ปล่อยให้ผู้สร้างตัดสินใจ

- โครงสร้างโฟลเดอร์, ชื่อไฟล์, library ย่อย (ws, better-sqlite3 ฯลฯ)
- ตัวเลขสมดุลที่แน่นอน (HP, GROWTH, drop rate) — ให้อยู่ใน config ปรับง่าย
- วิธีทำ sprite/asset (วาดมือ, generate, หรือ placeholder ก่อน)
- รายชื่อ biome / artifact จริง
- รายละเอียด animation/particle
