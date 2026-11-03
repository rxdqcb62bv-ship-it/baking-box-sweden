/* 旅行烘焙箱 · 瑞典篇（可玩首版 v0.2）
 * 逻辑分辨率 480x270，整数倍放大；所有素材来自 assets/（见 assets/manifest.js）。
 * 场景：title → map → travel → day → summary
 * v0.2：垃圾桶、暂存架、火力实时生效、市场补货、营业菜单（重开/回地图/回首页）、星露谷风格界面
 */
(() => {
'use strict';

// ============================================================ 基础
const W = 480, H = 270, KX = 480;            // KX：后厨在世界坐标中的起点
const MAN = window.ASSET_MANIFEST || { images: {}, sfx: {}, bgm: {} };
const QS = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let SC = 2;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  let k = Math.min(innerWidth / W, innerHeight / H) * 0.96;
  if (k >= 2) k = Math.floor(k);
  k = Math.max(k, 1);
  canvas.style.width = Math.round(W * k) + 'px';
  canvas.style.height = Math.round(H * k) + 'px';
  canvas.width = Math.round(W * k * dpr);
  canvas.height = Math.round(H * k * dpr);
  SC = canvas.width / W;
}
addEventListener('resize', resize);
resize();

const C = {
  ink: '#4a3028', inkSoft: '#785442', cream: '#fff6e4', paper: '#fffaf0', red: '#d65c4c',
  blue: '#346eb2', yel: '#fcce40', green: '#5aa05a', greenL: '#a8dc8c', gray: '#a89a8c',
  P: '#f2a516', G: '#5a9fd6', M: '#b0a49a', shadow: 'rgba(74,48,40,.28)',
};
// 星露谷风格的木框与羊皮纸配色
const WOOD = { dark: '#5a3418', base: '#b86f34', hi: '#dc9452', lo: '#8c4f24', paper: '#fbe9c4',
  paper2: '#f3d6a0', line: '#f5e0b6', text: '#5b2f17', shadow: '#e2b57a', stud: '#f2c26b' };
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inRect = (x, y, rx, ry, rw, rh) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ============================================================ 素材
const IMG = {};
function loadImages() {
  return Promise.all(Object.entries(MAN.images).map(([k, src]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => { console.warn('素材缺失', src); res(); };
    im.src = src;
  })));
}

const audio = { muted: false, unlocked: false, pool: {}, bgm: null, bgmName: null };
function sfx(name, vol = 0.55) {
  if (audio.muted || !audio.unlocked) return;
  const src = MAN.sfx['sfx_' + name];
  if (!src) return;
  const pool = audio.pool[name] || (audio.pool[name] = []);
  let a = pool.find(x => x.paused || x.ended);
  if (!a) {
    if (pool.length >= 4) a = pool[0];
    else { a = new Audio(src); pool.push(a); }
  }
  a.volume = vol;
  try { a.currentTime = 0; } catch (e) { /* ignore */ }
  a.play().catch(() => {});
}
function playBgm(name, loop = true, vol = 0.32) {
  audio.bgmName = name;
  if (audio.bgm) { audio.bgm.pause(); audio.bgm = null; }
  if (!audio.unlocked || audio.muted) return;
  const src = MAN.bgm['bgm_' + name];
  if (!src) return;
  const a = new Audio(src);
  a.loop = loop; a.volume = vol;
  a.play().catch(() => {});
  audio.bgm = a;
}
function unlockAudio() {
  if (audio.unlocked) return;
  audio.unlocked = true;
  if (audio.bgmName) playBgm(audio.bgmName);
}
function toggleMute() {
  audio.muted = !audio.muted;
  if (audio.muted) { if (audio.bgm) audio.bgm.pause(); }
  else if (audio.bgmName) playBgm(audio.bgmName);
}

// ============================================================ 绘制工具
function spr(k, x, y, s = 1, o = {}) {
  const im = IMG[k];
  if (!im) return;
  const w = im.width * (o.sx || s), h = im.height * (o.sy || s);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.flip) {
    ctx.save(); ctx.translate(Math.round(x + w), Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(im, 0, 0, w, h); ctx.restore();
  } else ctx.drawImage(im, Math.round(x), Math.round(y), w, h);
  ctx.globalAlpha = 1;
}
function sprFrame(k, fi, fw, fh, x, y, s = 1, flip = false, alpha = 1) {
  const im = IMG[k];
  if (!im) return;
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x + fw * s), Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(im, fi * fw, 0, fw, fh, 0, 0, fw * s, fh * s); ctx.restore();
  } else ctx.drawImage(im, fi * fw, 0, fw, fh, Math.round(x), Math.round(y), fw * s, fh * s);
  ctx.globalAlpha = 1;
}
// 以底边中点为锚点、可拉伸地绘制（面团的挤压动画用）
function sprAnchor(k, cx, by, sx = 1, sy = 1, alpha = 1) {
  const im = IMG[k];
  if (!im) return;
  const w = im.width * sx, h = im.height * sy;
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, Math.round(cx - w / 2), Math.round(by - h), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}
function rrPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function fillRR(x, y, w, h, r, fill, stroke, lw = 1) {
  rrPath(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function panel(x, y, w, h, fill = C.cream, r = 4) {
  fillRR(x, y + 2, w, h, r, C.shadow);
  fillRR(x, y, w, h, r, fill, C.ink, 1);
}
function txt(s, x, y, o = {}) {
  const size = o.size || 8;
  ctx.font = `${o.bold ? '600' : '400'} ${size}px ${FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'middle';
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(s, x + (o.sd || 1), y + (o.sd || 1)); }
  if (o.outline) {
    ctx.lineJoin = 'round'; ctx.lineWidth = o.ow || 2.4; ctx.strokeStyle = o.outline;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color || C.ink;
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}
// 星露谷式文字：深棕字 + 浅色投影
function stxt(s, x, y, o = {}) {
  txt(s, x, y, Object.assign({ color: WOOD.text, shadow: WOOD.shadow }, o));
}
function textW(s, size = 8, bold = false) {
  ctx.font = `${bold ? '600' : '400'} ${size}px ${FONT}`;
  return ctx.measureText(s).width;
}
function bar(x, y, w, h, frac, color, back = '#e8dcc8', zone) {
  fillRR(x - 1, y - 1, w + 2, h + 2, 2, C.ink);
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  if (zone) {
    ctx.fillStyle = zone.goodColor || '#cfe8b0';
    ctx.fillRect(x + w * zone.g0, y, w * (zone.g1 - zone.g0), h);
    ctx.fillStyle = zone.color || '#7cc45a';
    ctx.fillRect(x + w * zone.p0, y, w * (zone.p1 - zone.p0), h);
    if (zone.bad !== undefined) { ctx.fillStyle = '#c86a5a'; ctx.fillRect(x + w * zone.bad, y, w * (1 - zone.bad), h); }
  }
  if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h); }
}
function marker(x, y, h) {
  ctx.fillStyle = C.ink; ctx.fillRect(Math.round(x) - 1, y - 2, 3, h + 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x), y - 1, 1, h + 2);
}
function ring(cx, cy, r, frac, color, lw = 2.2) {
  ctx.lineWidth = lw + 1.6; ctx.strokeStyle = C.ink;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = lw; ctx.strokeStyle = '#e8dcc8';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0, 1)); ctx.stroke();
}
// 木框 + 羊皮纸面板（星露谷风格）
function woodFrame(x, y, w, h) {
  ctx.fillStyle = 'rgba(40,20,10,.35)'; ctx.fillRect(x + 3, y + 4, w, h);
  ctx.fillStyle = WOOD.dark; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = WOOD.base; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = WOOD.hi; ctx.fillRect(x + 1, y + 1, w - 2, 1.5); ctx.fillRect(x + 1, y + 1, 1.5, h - 2);
  ctx.fillStyle = WOOD.lo; ctx.fillRect(x + 1, y + h - 2.5, w - 2, 1.5); ctx.fillRect(x + w - 2.5, y + 1, 1.5, h - 2);
  ctx.fillStyle = 'rgba(90,52,24,.3)';
  for (let i = 10; i < w - 12; i += 26) { ctx.fillRect(x + i, y + 2.5, 10, 1); ctx.fillRect(x + i + 9, y + h - 3.5, 8, 1); }
  for (let i = 12; i < h - 12; i += 28) { ctx.fillRect(x + 2.5, y + i, 1, 9); ctx.fillRect(x + w - 3.5, y + i + 8, 1, 8); }
  ctx.fillStyle = WOOD.dark; ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = WOOD.paper; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  ctx.fillStyle = WOOD.line;
  for (let yy = y + 16; yy < y + h - 8; yy += 10) ctx.fillRect(x + 9, yy, w - 18, 0.6);
  [[x + 1, y + 1], [x + w - 5, y + 1], [x + 1, y + h - 5], [x + w - 5, y + h - 5]].forEach(([sx, sy]) => {
    ctx.fillStyle = WOOD.dark; ctx.fillRect(sx, sy, 4, 4);
    ctx.fillStyle = WOOD.stud; ctx.fillRect(sx + 1, sy + 1, 2, 2);
  });
}
// 实木招牌（没有纸面）
function woodPlank(x, y, w, h) {
  ctx.fillStyle = 'rgba(40,20,10,.35)'; ctx.fillRect(x + 3, y + 4, w, h);
  fillRR(x, y, w, h, 3, WOOD.base, WOOD.dark, 1.2);
  ctx.fillStyle = WOOD.hi; ctx.fillRect(x + 3, y + 2, w - 6, 2);
  ctx.fillStyle = WOOD.lo; ctx.fillRect(x + 3, y + h - 4, w - 6, 2);
  ctx.fillStyle = 'rgba(90,52,24,.28)';
  for (let yy = y + 8; yy < y + h - 6; yy += 7) {
    for (let xx = x + 6 + (yy % 14); xx < x + w - 14; xx += 34) ctx.fillRect(xx, yy, 18, 1);
  }
  [[x + 4, y + 4], [x + w - 7, y + 4], [x + 4, y + h - 7], [x + w - 7, y + h - 7]].forEach(([sx, sy]) => {
    ctx.fillStyle = WOOD.dark; ctx.fillRect(sx, sy, 3, 3);
    ctx.fillStyle = WOOD.stud; ctx.fillRect(sx + 0.8, sy + 0.8, 1.4, 1.4);
  });
}
function ribbon(cx, y, w, label, col = '#c8483a') {
  const x = cx - w / 2;
  ctx.fillStyle = '#8e2c22';
  ctx.beginPath(); ctx.moveTo(x - 12, y + 4); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x + 6, y + 19); ctx.lineTo(x - 12, y + 19); ctx.lineTo(x - 6, y + 11.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + w + 12, y + 4); ctx.lineTo(x + w - 6, y + 4); ctx.lineTo(x + w - 6, y + 19); ctx.lineTo(x + w + 12, y + 19); ctx.lineTo(x + w + 6, y + 11.5); ctx.closePath(); ctx.fill();
  fillRR(x, y, w, 17, 2, col, '#5e1d16', 1);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 2, y + 2, w - 4, 2);
  txt(label, cx, y + 9, { size: 9.5, bold: true, align: 'center', color: '#fff6e4', outline: '#6e221a', ow: 2.6 });
}
function sweFlag(x, y, w = 14, h = 9) {
  ctx.fillStyle = C.ink; ctx.fillRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2);
  ctx.fillStyle = '#2f68b0'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.yel; ctx.fillRect(x + w * 0.3, y, w * 0.16, h); ctx.fillRect(x, y + h * 0.4, w, h * 0.2);
}

// ============================================================ 输入与按钮
const ptr = { x: -99, y: -99, px: 0, py: 0, down: false, inside: false, moved: 0 };
let buttons = [], pressedBtn = null;
function hitButton(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (inRect(x, y, b.x, b.y, b.w, b.h)) return b;
  }
  return null;
}
function button(id, x, y, w, h, label, onClick, o = {}) {
  const hover = ptr.inside && inRect(ptr.x, ptr.y, x, y, w, h) && !o.disabled;
  const pressed = pressedBtn === id && hover && ptr.down;
  const yy = y + (pressed ? 1 : hover ? -1 : 0);
  if (o.wood) {
    const base = o.disabled ? '#b9a48e' : hover ? (o.hoverColor || '#d68c4c') : (o.color || '#c47a3c');
    ctx.fillStyle = 'rgba(40,20,10,.35)'; ctx.fillRect(x + 1, y + 3, w, h);
    fillRR(x, yy, w, h, 3, base, WOOD.dark, 1.2);
    ctx.fillStyle = 'rgba(255,230,190,.5)'; ctx.fillRect(x + 3, yy + 2, w - 6, 1.5);
    ctx.fillStyle = 'rgba(90,52,24,.35)'; ctx.fillRect(x + 3, yy + h - 3, w - 6, 1.5);
  } else if (!o.bare) {
    const fill = o.disabled ? '#ddd2c4' : (o.color || C.yel);
    fillRR(x, y + 2, w, h, 4, C.shadow);
    fillRR(x, yy, w, h, 4, fill, C.ink, 1);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 3, yy + 2, w - 6, 2);
  }
  if (o.draw) o.draw(x, yy, hover);
  if (label) {
    if (o.wood) txt(label, x + w / 2 + (o.labelDx || 0), yy + h / 2 + 0.5, { size: o.size || 8.5, bold: true, align: 'center',
      color: o.disabled ? '#ece0d0' : '#fff3dc', outline: WOOD.dark, ow: 2.6 });
    else txt(label, x + w / 2 + (o.labelDx || 0), yy + h / 2 + 0.5,
      { size: o.size || 8, bold: true, align: 'center', color: o.disabled ? '#8c8076' : (o.textColor || C.ink) });
  }
  buttons.push({ id, x, y, w, h, onClick, disabled: o.disabled });
}
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  unlockAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  [ptr.x, ptr.y] = toLogical(e);
  ptr.px = ptr.x; ptr.py = ptr.y; ptr.down = true; ptr.moved = 0; ptr.inside = true;
  const b = hitButton(ptr.x, ptr.y);
  if (b && !b.disabled) { pressedBtn = b.id; return; }
  pressedBtn = null;
  const sc = SCENES[G.scene];
  if (sc && sc.down) sc.down(ptr.x, ptr.y);
});
canvas.addEventListener('pointermove', e => {
  const [x, y] = toLogical(e);
  const dx = x - ptr.x, dy = y - ptr.y;
  ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = x; ptr.y = y; ptr.inside = true;
  ptr.moved += Math.abs(dx) + Math.abs(dy);
  if (ptr.down && !pressedBtn) {
    const sc = SCENES[G.scene];
    if (sc && sc.move) sc.move(x, y, dx, dy);
  }
});
canvas.addEventListener('pointerup', e => {
  [ptr.x, ptr.y] = toLogical(e);
  ptr.down = false;
  if (pressedBtn) {
    const b = hitButton(ptr.x, ptr.y);
    const id = pressedBtn; pressedBtn = null;
    if (b && b.id === id && !b.disabled) { sfx('click', 0.35); b.onClick(); }
    return;
  }
  const sc = SCENES[G.scene];
  if (sc && sc.up) sc.up(ptr.x, ptr.y);
});
canvas.addEventListener('pointerleave', () => { ptr.inside = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  const sc = SCENES[G.scene];
  if (sc && sc.key) sc.key(e);
});

// ============================================================ 存档
const SAVE_KEY = 'bakingbox.sweden.v1';
function loadSave() {
  try { return Object.assign({ stamps: 0, best: 0, days: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
  catch (e) { return { stamps: 0, best: 0, days: 0 }; }
}
function writeSave() {
  if (G.noSave) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignore */ }
}
const SAVE = loadSave();

// ============================================================ 全局状态
const G = {
  scene: 'loading', t: 0, relaxed: false, dayNo: 1, day: null, paused: false,
  fade: 0, fadeTo: null, toast: null, fx: [], floats: [], tutorial: true, noSave: false,
};
function goto(scene, init) {
  G.fadeTo = { scene, init };
}
function toast(msg, dur = 1.6) { G.toast = { msg, t: 0, dur }; }
function fx(key, x, y, o = {}) {
  const defs = { fx_flour: [12, 12, 4], fx_steam: [12, 16, 4], fx_sparkle: [11, 11, 4], fx_smoke: [16, 16, 4] };
  const d = defs[key];
  G.fx.push({ key, fw: d[0], fh: d[1], n: d[2], x, y, t: 0, dur: o.dur || 0.5, vy: o.vy || 0, vx: o.vx || 0 });
}
function floatText(text, x, y, color = C.ink, size = 9) {
  G.floats.push({ text, x, y, t: 0, dur: 1.2, color, size });
}

// ============================================================ 游戏数据（数值为设计初稿，待试玩调整）
const TAGS = {
  spice: { name: '香料', icon: 'ui_tag_spice' },
  citrus: { name: '柑橘', icon: 'ui_tag_citrus' },
  crunch: { name: '脆口', icon: 'ui_tag_crunch' },
  sweet: { name: '甜蜜', icon: 'ui_tag_sweet' },
};
const EXTRAS = {
  cardamom: { name: '豆蔻', tag: 'spice', pts: 8, where: 'dough', authentic: true, jar: 'ing_jar_cardamom', price: 3 },
  orange: { name: '橙皮', tag: 'citrus', pts: 8, where: 'dough', jar: 'ing_jar_orange', price: 3 },
  pearl: { name: '珍珠糖', tag: 'crunch', pts: 6, where: 'tray', authentic: true, jar: 'ing_jar_pearl', price: 2 },
  honey: { name: '蜂蜜', tag: 'sweet', pts: 5, where: 'plate', jar: 'ing_jar_honey', price: 2 },
};
const EXTRA_KEYS = ['cardamom', 'orange', 'pearl', 'honey'];
const MAX_EXTRAS = 3;
const COMBOS = [{ a: 'cardamom', b: 'orange', pts: 6, name: '豆蔻+橙皮' }];
const STEPS = [['knead', '揉面', '揉'], ['proof', '发酵', '发'], ['roll', '擀面', '擀'], ['spread', '抹馅', '抹'],
  ['cut', '切条', '切'], ['bake', '烘烤', '烤']];
// 配料加在哪一步（珍珠糖按瑞典食谱在烤前撒）
const WHERE_TXT = { dough: '揉进面团', tray: '烤前撒', plate: '出炉后淋' };
const WHERE_SHORT = { dough: '进面团', tray: '烤前撒', plate: '出炉淋' };
const WHERE_TIP = { dough: '要揉进面团里', tray: '要在进烤箱前，撒在烤盘上的面包上', plate: '要在出炉后淋在盘里的面包上' };
const GRADE_PTS = { P: 6, G: 3, M: 0 };
const GRADE_TXT = { P: '完美！', G: '不错', M: '失误' };
const GRADE_COL = { P: C.P, G: C.G, M: C.M };
const BASE_PTS = 20;
const DAY_CFG = {
  arrivals: [2, 30, 56, 84, 112, 140],
  patience: 150,
  stock: { cardamom: 4, orange: 4, pearl: 4, honey: 4 },
  targets: [300, 450, 600],
  kinds: ['astrid', 'lars', 'elena', 'yuki', 'oskar', 'lars'],
};
const KNEAD_RATE = 58;           // 揉面进度 / 秒
const KNEAD_ZONE = { p0: 68, p1: 84, g0: 55, g1: 92 };
const PROOF_ZONE = { p0: 9, p1: 12, g0: 7, g1: 15, max: 18 };
// 火力：旋钮实时生效，三档在速度、完美窗口长度、加分和口感上不同
const HEATS = {
  low: { name: '低', rate: 1.0, bonus: 0, glow: 0.07, flames: 3, desc: '慢 · 完美窗口长' },
  mid: { name: '中', rate: 1.6, bonus: 2, glow: 0.15, flames: 5, desc: '适中 · +2 分' },
  high: { name: '高', rate: 2.6, bonus: 5, glow: 0.27, flames: 7, desc: '快 · 窗口短 · +5 · 脆口' },
};
const HEAT_KEYS = ['low', 'mid', 'high'];
// 烘烤“热量”刻度：<8 没熟，8–14 偏浅，14–18 金黄（完美），18–21 偏深，>21 烤焦
const BAKE_U = { pale: 8, gold: 14, goldEnd: 18, burn: 21, max: 24 };

// ============================================================ 布局
// 后厨局部坐标（世界坐标 = KX + x）
const KL = {
  jars: { cardamom: { x: 14, y: 95 }, orange: { x: 40, y: 95 }, pearl: { x: 66, y: 95 }, honey: { x: 92, y: 95 } },
  market: { x: 28, y: 62, w: 86, h: 20 },
  flour: { x: 14, y: 150, w: 22, h: 26 },
  dough: { cx: 74, by: 178 },
  proofer: { x: 126, y: 90 },
  proofSlots: [{ cx: 157, by: 148, top: 104 }, { cx: 157, by: 208, top: 164 }],
  hold: { shelfX: 194, y: 104, slots: [224, 276] },
  grab: { x: 200, y: 114, w: 38, h: 12 },
  board: { x: 200, y: 128, w: 100, h: 44, cx: 250, cy: 150 },
  bin: { x: 280, y: 204 },
  oven: { x: 312, y: 86 },
  ovenSlots: [{ cx: 350, rack: 150, top: 112 }, { cx: 350, rack: 208, top: 170 }],
  knobs: [{ k: 'low', x: 326, y: 96 }, { k: 'mid', x: 350, y: 96 }, { k: 'high', x: 374, y: 96 }],
  plate: { cx: 420, by: 178 },
  bunsX: [408, 420, 432],
  pass: { x: 405, y: 92, w: 62, h: 58 },
};
const FL = { door: { x: 56, y: 198 }, spots: [300, 362, 424], feetY: 213, counterY: 190, plateSlots: [150, 197, 244],
  bin: { x: 92, y: 212 } };
const SHEET = { w: 84, h: 30 };
const LOG = { x0: 214, x1: 286, y: 150, h: 10 };

// ============================================================ 营业日
const cam = { x: 0, target: 0 };
function view() { return cam.target === 0 ? 'front' : 'kitchen'; }
function camSettled() { return Math.abs(cam.x - cam.target) < 2; }
function setView(v) {
  const t = v === 'front' ? 0 : KX;
  if (cam.target !== t) { cam.target = t; sfx('whoosh', 0.3); }
  if (G.day) { if (v === 'kitchen') G.day.alertK = 0; else G.day.alertF = 0; }
}

function newDay() {
  const rng = mulberry32(4000 + G.dayNo * 131);
  const tagKeys = Object.keys(TAGS);
  const customers = DAY_CFG.arrivals.map((t, i) => {
    let prefs;
    if (i === 0) prefs = ['spice', 'citrus'];          // 第一位客人：引导用，口味与豆蔻、橙皮对应
    else {
      const a = tagKeys[Math.floor(rng() * tagKeys.length)];
      let b = a;
      while (b === a) b = tagKeys[Math.floor(rng() * tagKeys.length)];
      prefs = [a, b];
    }
    const p = DAY_CFG.patience - Math.min(40, (G.dayNo - 1) * 10);
    return { id: i, kind: DAY_CFG.kinds[i], arriveAt: t, state: 'pending', prefs, patience: p, max: p,
      x: FL.door.x, y: FL.door.y, spot: -1, walkT: 0, timer: 0, bub: 0, hop: 0, face: 'idle', dir: 1 };
  });
  G.day = {
    t: 0, customers, stock: Object.assign({}, DAY_CFG.stock),
    dough: null, proof: [null, null], board: null, oven: [null, null], plate: null, counter: [null, null, null],
    hold: [null, null], temp: 'mid', score: 0, coins: 0, spent: 0, served: 0, left: 0, discarded: 0, firstServed: false,
    alertK: 0, alertF: 0, receipt: null, ended: false, endT: 0, doorSwing: 0, drag: null, tool: null,
  };
  cam.x = 0; cam.target = 0;
  G.fx = []; G.floats = []; G.paused = false;
}
function newBatch() {
  return { extras: [], grades: {}, bake: null, heatBonus: 0, heatTag: null, heatName: '' };
}
function pipelineCount(d) {
  return (d.dough ? 1 : 0) + d.proof.filter(Boolean).length + (d.board ? 1 : 0) +
    d.oven.filter(Boolean).length + (d.plate ? 1 : 0) + d.counter.filter(Boolean).length +
    d.hold.filter(Boolean).length + (d.drag && d.drag.type !== 'jar' ? 1 : 0);
}
function freeSpot(d) {
  for (let s = 0; s < FL.spots.length; s++) {
    if (!d.customers.some(c => c.spot === s && c.state !== 'leave' && c.state !== 'gone' && c.state !== 'pending')) return s;
  }
  return -1;
}
function custFrac(c) { return clamp(c.patience / c.max, 0, 1); }
function grade(v, z) {
  if (v >= z.p0 && v <= z.p1) return 'P';
  if (v >= z.g0 && v <= z.g1) return 'G';
  return 'M';
}
function showGrade(g, wx, wy) {
  floatText(GRADE_TXT[g], wx, wy, GRADE_COL[g], g === 'P' ? 10 : 9);
  if (g === 'P') { sfx('perfect', 0.45); fx('fx_sparkle', wx - 12, wy - 6); fx('fx_sparkle', wx + 4, wy - 2); }
  else if (g === 'G') sfx('good', 0.4);
  else sfx('miss', 0.4);
}
function addExtra(b, key, wx, wy) {
  const d = G.day, e = EXTRAS[key];
  if (b.extras.includes(key)) { toast(`已经加过${e.name}了`); return false; }
  if (b.extras.length >= MAX_EXTRAS) { toast(`每份最多加 ${MAX_EXTRAS} 种配料`); return false; }
  if (d.stock[key] <= 0) { toast(`${e.name}用完了，可以去“市场”补货`); return false; }
  d.stock[key]--;
  b.extras.push(key);
  sfx('pop', 0.5);
  fx('fx_sparkle', wx - 5, wy - 8);
  floatText('+' + e.name, wx, wy - 10, C.green);
  return true;
}
function buy(key) {
  const d = G.day, e = EXTRAS[key];
  if (d.coins < e.price) { toast('小费不够'); sfx('miss', 0.3); return; }
  d.coins -= e.price; d.spent += e.price; d.stock[key]++;
  sfx('buy', 0.45);
}

// ----- 烘烤
function newOvenItem(b) { return { b, u: 0, uBy: { low: 0, mid: 0, high: 0 }, dinged: false, warned: false, burnt: false, st: 0 }; }
function bakeInfo(o) {
  const u = o.u;
  if (u < BAKE_U.pale) return { st: 'raw', g: 'M', spr: 'food_knot_raw' };
  if (u < BAKE_U.gold) return { st: 'pale', g: 'G', spr: 'food_knot_pale' };
  if (u <= BAKE_U.goldEnd) return { st: 'golden', g: 'P', spr: 'food_knot_baked' };
  if (u <= BAKE_U.burn) return { st: 'dark', g: 'G', spr: 'food_knot_baked' };
  return { st: 'burnt', g: 'M', spr: 'food_knot_burnt' };
}
function knotSprite(bake) {
  return { raw: 'food_knot_raw', pale: 'food_knot_pale', golden: 'food_knot_baked', dark: 'food_knot_baked',
    burnt: 'food_knot_burnt' }[bake] || 'food_knot_baked';
}
function ovenCountdown(o, temp) {
  const r = HEATS[temp].rate, u = o.u;
  if (u < BAKE_U.gold) return { t: `金黄还有 ${((BAKE_U.gold - u) / r).toFixed(1)}s`, c: '#fff' };
  if (u <= BAKE_U.goldEnd) return { t: `现在取出！${((BAKE_U.goldEnd - u) / r).toFixed(1)}s`, c: '#fff2a0' };
  if (u <= BAKE_U.burn) return { t: `快焦了 ${((BAKE_U.burn - u) / r).toFixed(1)}s`, c: '#ffc0a8' };
  return { t: '烤焦了！', c: '#ffb0a0' };
}

// ----- 评分
function scoreOrder(b, c) {
  const craftLines = STEPS.map(([k, name, short]) => ({ k, name, short, g: b.grades[k] || 'M' }));
  const craft = craftLines.reduce((s, l) => s + GRADE_PTS[l.g], 0);
  const ing = b.extras.map(k => ({ k, name: EXTRAS[k].name, pts: EXTRAS[k].pts, authentic: EXTRAS[k].authentic }));
  const ingPts = ing.reduce((s, x) => s + x.pts, 0);
  const combos = COMBOS.filter(cb => b.extras.includes(cb.a) && b.extras.includes(cb.b));
  const comboPts = combos.reduce((s, x) => s + x.pts, 0);
  const heat = b.heatBonus || 0;
  const sub = BASE_PTS + craft + ingPts + comboPts + heat;
  const tags = new Set(b.extras.map(k => EXTRAS[k].tag));
  if (b.heatTag) tags.add(b.heatTag);
  const ruined = b.bake === 'burnt' || b.bake === 'raw';
  const matched = ruined ? [] : c.prefs.filter(t => tags.has(t)).slice(0, 2);
  const mult = 1 + 0.25 * matched.length;
  const frac = custFrac(c);
  const tip = G.relaxed ? 5 : Math.round(10 * frac);
  const total = Math.floor(sub * mult) + tip;
  const stars = ruined ? 1 : total >= 110 ? 3 : total >= 80 ? 2 : 1;
  const coins = stars * 2 + (G.relaxed ? 2 : Math.round(4 * frac));
  return { craftLines, craft, ing, combos, heat, heatName: b.heatName, heatTag: b.heatTag, sub, matched, mult, tip, total,
    stars, coins, ruined, bake: b.bake };
}

// ----- 上菜
function serve(c, b) {
  const d = G.day;
  const r = scoreOrder(b, c);
  d.score += r.total; d.coins += r.coins; d.served++;
  d.firstServed = true;
  c.state = 'served'; c.timer = 1.8;
  c.face = r.stars >= 2 ? 'happy' : r.ruined ? 'impatient' : 'idle';
  c.hop = r.stars >= 2 ? 1 : 0;
  sfx(r.stars >= 2 ? 'happy' : 'good', 0.5);
  setTimeout(() => sfx('coin', 0.4), 350);
  const say = r.ruined ? (r.bake === 'burnt' ? '……有点焦' : '……还没烤熟') :
    r.stars === 3 ? '太好吃了！' : r.stars === 2 ? '好香！' : '嗯，还行';
  floatText('★'.repeat(r.stars) + ' ' + say, c.x, c.y - 98, r.stars >= 2 ? C.P : C.inkSoft, 9);
  floatText('+' + r.coins + ' 小费', c.x, c.y - 84, '#c98a10', 8);
  d.receipt = { r, t: 0, life: 7, open: false, openT: 0 };
}

// ----- 营业日更新
function updateDay(dt) {
  const d = G.day;
  if (!d) return;
  d.t += dt;
  d.doorSwing = Math.max(0, d.doorSwing - dt);
  if (d.alertK > 0) d.alertK += dt;
  if (d.alertF > 0) d.alertF += dt;

  // 客人
  for (const c of d.customers) {
    switch (c.state) {
      case 'pending':
        if (d.t >= c.arriveAt) {
          const s = freeSpot(d);
          if (s >= 0) {
            c.spot = s; c.state = 'walk'; c.x = FL.door.x; c.y = FL.door.y; c.dir = 1;
            d.doorSwing = 0.7; sfx('door_bell', 0.5);
            if (view() === 'kitchen') d.alertF = d.alertF || 0.01;
          }
        }
        break;
      case 'walk': {
        const tx = FL.spots[c.spot], ty = FL.feetY;
        const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy), sp = 52 * dt;
        c.walkT += dt;
        if (dist <= sp) { c.x = tx; c.y = ty; c.state = 'order'; c.timer = 0.6; }
        else { c.x += dx / dist * sp; c.y += dy / dist * sp; }
        break;
      }
      case 'order':
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'wait'; c.bub = 0; sfx('pop', 0.4); }
        break;
      case 'wait':
        c.bub = Math.min(1, c.bub + dt * 4);
        if (!G.relaxed) c.patience -= dt;
        c.face = custFrac(c) < 0.3 ? 'impatient' : 'idle';
        if (c.patience <= 0) {
          c.state = 'angry'; c.timer = 1.3; c.face = 'angry'; d.left++;
          sfx('angry', 0.45);
          floatText('等太久，走了……', c.x, c.y - 98, C.red);
          if (view() === 'kitchen') d.alertF = d.alertF || 0.01;
        }
        break;
      case 'served':
      case 'angry':
        c.timer -= dt;
        if (c.hop) c.hop += dt;
        if (c.timer <= 0) { c.state = 'leave'; c.dir = -1; c.walkT = 0; }
        break;
      case 'leave': {
        const tx = FL.door.x, ty = FL.door.y;
        const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy), sp = 58 * dt;
        c.walkT += dt;
        if (dist <= sp) { c.state = 'gone'; d.doorSwing = 0.5; }
        else { c.x += dx / dist * sp; c.y += dy / dist * sp; }
        break;
      }
      default: break;
    }
  }

  // 揉面
  const dg = d.dough;
  if (dg && dg.kneading) {
    dg.knead += KNEAD_RATE * dt;
    dg.kt = (dg.kt || 0) + dt;
    if (dg.kt > 0.22) { dg.kt = 0; sfx('knead', 0.4); fx('fx_flour', KX + KL.dough.cx - 6 + Math.random() * 10, 158, { vy: -10 }); }
    if (dg.knead >= 100) finishKnead();
  }
  // 发酵（暂存架上的面团不计时）
  d.proof.forEach((s, i) => {
    if (!s) return;
    s.t += dt;
    if (!s.ready && s.t >= PROOF_ZONE.p0) { s.ready = true; sfx('pop', 0.35); if (view() === 'front') d.alertK = d.alertK || 0.01;
      floatText('发酵好了', KX + KL.proofSlots[i].cx, KL.proofSlots[i].top + 8, C.green, 8); }
    if (!s.overWarn && s.t > PROOF_ZONE.g1) { s.overWarn = true; floatText('发过头了！', KX + KL.proofSlots[i].cx, KL.proofSlots[i].top + 8, C.red, 8); }
  });
  // 整形台动画
  const bd = d.board;
  if (bd) {
    if (bd.stage === 'rollup') { bd.anim += dt; if (bd.anim >= 0.5) { bd.stage = 'cut'; bd.cuts = []; } }
    if (bd.stage === 'twist') { bd.anim += dt; if (bd.anim >= 0.8) bd.stage = 'tray'; }
  }
  // 烤箱：当前火力实时作用于两层
  const H_ = HEATS[d.temp];
  d.oven.forEach((o, i) => {
    if (!o) return;
    const add = H_.rate * dt;
    o.u += add; o.uBy[d.temp] += add;
    const s = KL.ovenSlots[i];
    if (!o.dinged && o.u >= BAKE_U.gold) { o.dinged = true; sfx('oven_ding', 0.5); if (view() === 'front') d.alertK = d.alertK || 0.01;
      fx('fx_sparkle', KX + s.cx - 20, s.rack - 22); fx('fx_sparkle', KX + s.cx + 12, s.rack - 18); }
    if (!o.warned && o.u > BAKE_U.goldEnd) { o.warned = true; floatText('快焦了！', KX + s.cx, s.top + 18, C.red, 8); }
    if (!o.burnt && o.u > BAKE_U.burn) { o.burnt = true; sfx('burn', 0.45); if (view() === 'front') d.alertK = d.alertK || 0.01; }
    o.st += dt;
    if (o.burnt && o.st > 0.35) { o.st = 0; fx('fx_smoke', KX + s.cx - 8 + (Math.random() * 20 - 10), s.top - 12, { vy: -14, dur: 0.9 }); }
  });
  // 收据
  const rc = d.receipt;
  if (rc) {
    rc.t += dt;
    if (rc.open) { rc.openT += dt; if (rc.openT > 10) d.receipt = null; }
    else if (rc.t > rc.life) d.receipt = null;
  }
  // 结束判定
  if (!d.ended && d.customers.every(c => c.state === 'gone')) { d.ended = true; d.endT = 0; }
  if (d.ended) { d.endT += dt; if (d.endT > 1.2 && G.scene === 'day') finishDay(); }
}

function finishDay() {
  const d = G.day;
  const stamps = DAY_CFG.targets.filter(t => d.score >= t).length;
  const prev = SAVE.stamps;
  SAVE.stamps = Math.max(SAVE.stamps, stamps);
  SAVE.best = Math.max(SAVE.best, d.score);
  SAVE.days++;
  writeSave();
  G.summary = { score: d.score, served: d.served, left: d.left, coins: d.coins, spent: d.spent, discarded: d.discarded,
    stamps, newStamp: stamps > prev, t: 0, stamped: false };
  G.scene = 'summary';
  G.paused = false;
  playBgm('day_end', false, 0.45);
}

// ----- 揉面、发酵、整形、烘烤、装饰：操作
function finishKnead() {
  const dg = G.day.dough;
  dg.kneading = false;
  const g = grade(dg.knead, KNEAD_ZONE);
  dg.b.grades.knead = g;
  dg.stage = 'smooth';
  showGrade(g, KX + KL.dough.cx, 140);
  fx('fx_flour', KX + KL.dough.cx - 10, 160); fx('fx_flour', KX + KL.dough.cx + 2, 160);
}
function sheetRect(s) {
  const w = SHEET.w * s, h = SHEET.h * s;
  return { x: KL.board.cx - w / 2, y: KL.board.cy - h / 2, w, h };
}
function finishRoll() {
  const bd = G.day.board;
  const dev = Math.abs(bd.s - 1);
  const g = dev <= 0.06 ? 'P' : dev <= 0.15 ? 'G' : 'M';
  bd.b.grades.roll = g;
  bd.stage = 'spread';
  bd.cov = new Array(24).fill(false);
  showGrade(g, KX + KL.board.cx, 122);
}
function finishSpread() {
  const bd = G.day.board;
  const cov = bd.cov.filter(Boolean).length / bd.cov.length;
  const g = cov >= 0.95 ? 'P' : cov >= 0.8 ? 'G' : 'M';
  bd.b.grades.spread = g;
  bd.stage = 'rollup'; bd.anim = 0;
  showGrade(g, KX + KL.board.cx, 122);
  sfx('roll', 0.4);
}
function doCut(kx) {
  const bd = G.day.board;
  if (!bd || bd.stage !== 'cut') return;
  if (kx < LOG.x0 + 4 || kx > LOG.x1 - 4) return;
  if (bd.cuts.some(c => Math.abs(c - kx) < 6)) return;
  bd.cuts.push(kx);
  sfx('cut', 0.5);
  fx('fx_flour', KX + kx - 6, LOG.y - 10);
  if (bd.cuts.length >= 2) {
    const xs = [LOG.x0, ...bd.cuts.sort((a, b) => a - b), LOG.x1];
    const ideal = (LOG.x1 - LOG.x0) / 3;
    let dev = 0;
    for (let i = 0; i < 3; i++) dev = Math.max(dev, Math.abs((xs[i + 1] - xs[i]) - ideal));
    const g = dev <= 3 ? 'P' : dev <= 7 ? 'G' : 'M';
    bd.b.grades.cut = g;
    bd.stage = 'twist'; bd.anim = 0;
    showGrade(g, KX + KL.board.cx, 122);
  }
}
function takeFromOven(i) {
  const d = G.day, o = d.oven[i];
  if (!o) return;
  if (d.plate) { toast('装饰台上还有一盘：先送出去，或放到暂存架'); return; }
  const info = bakeInfo(o);
  const b = o.b;
  b.grades.bake = info.g;
  b.bake = info.st;
  const ruined = info.st === 'raw' || info.st === 'burnt';
  const tot = Math.max(0.001, o.u);
  if (!ruined) {
    b.heatBonus = Math.round(HEAT_KEYS.reduce((s, k) => s + o.uBy[k] * HEATS[k].bonus, 0) / tot);
    const main = HEAT_KEYS.reduce((a, k) => (o.uBy[k] > o.uBy[a] ? k : a), 'low');
    b.heatName = HEATS[main].name + '火';
    b.heatTag = o.uBy.high / tot >= 0.6 ? 'crunch' : null;
  }
  d.oven[i] = null;
  d.plate = { b, stage: 'top' };
  const s = KL.ovenSlots[i];
  showGrade(info.g, KX + s.cx, s.top - 6);
  if (info.st === 'raw') floatText('还没熟！', KX + s.cx, s.top + 6, C.red, 8);
  if (info.st === 'burnt') floatText('烤焦了', KX + s.cx, s.top + 6, C.red, 8);
  if (b.heatTag) floatText('高火：外皮酥脆（脆口）', KX + KL.plate.cx, 132, '#c66a1a', 8);
  sfx('sizzle', 0.35);
  for (let k = 0; k < 3; k++) fx('fx_steam', KX + KL.bunsX[k] - 6, 146, { vy: -16, dur: 0.8 });
}
function setTemp(k) {
  const d = G.day;
  if (d.temp === k) return;
  d.temp = k;
  sfx('dial', 0.45);
  floatText('火力：' + HEATS[k].name + '（' + HEATS[k].desc + '）', KX + 350, 78, C.red, 8);
}

// ----- 命中检测（后厨局部坐标）
function hitJar(kx, ky) {
  for (const k of EXTRA_KEYS) { const j = KL.jars[k]; if (inRect(kx, ky, j.x - 1, j.y - 1, 22, 26)) return k; }
  return null;
}
function hitDough(kx, ky) { return inRect(kx, ky, KL.dough.cx - 22, KL.dough.by - 28, 44, 32); }
function hitProofSlot(kx, ky) {
  for (let i = 0; i < 2; i++) { const s = KL.proofSlots[i]; if (inRect(kx, ky, 129, s.top - 2, 56, 58)) return i; }
  return -1;
}
function hitHold(kx, ky) {
  for (let i = 0; i < 2; i++) if (inRect(kx, ky, KL.hold.slots[i] - 26, 74, 52, 38)) return i;
  return -1;
}
function hitGrab(kx, ky) { const g = KL.grab; return inRect(kx, ky, g.x - 2, g.y - 2, g.w + 4, g.h + 4); }
function canGrab(bd) { return bd && ['roll', 'spread', 'cut', 'tray'].includes(bd.stage); }
function hitBoard(kx, ky) { const b = KL.board; return inRect(kx, ky, b.x - 4, b.y - 2, b.w + 8, b.h + 6); }
function hitBin(kx, ky) { return inRect(kx, ky, KL.bin.x - 6, KL.bin.y - 8, 38, 44); }
function hitOvenSlot(kx, ky) {
  for (let i = 0; i < 2; i++) { const s = KL.ovenSlots[i]; if (inRect(kx, ky, 316, s.top - 2, 68, 54)) return i; }
  return -1;
}
function hitKnob(kx, ky) { return KL.knobs.find(k => Math.hypot(kx - k.x, ky - k.y) <= 8) || null; }
function hitPlate(kx, ky) { return inRect(kx, ky, KL.plate.cx - 26, KL.plate.by - 30, 52, 34); }
function hitPass(kx, ky) { const p = KL.pass; return inRect(kx, ky, p.x - 6, p.y - 6, p.w + 12, p.h + 12); }
function hitFlour(kx, ky) { const f = KL.flour; return inRect(kx, ky, f.x - 2, f.y - 2, f.w + 4, f.h + 4); }
function hitCounterPlate(wx, wy) {
  const d = G.day;
  for (let i = 0; i < 3; i++) if (d.counter[i] && inRect(wx, wy, FL.plateSlots[i] - 24, 168, 48, 34)) return i;
  return -1;
}
function hitFrontBin(wx, wy) { return inRect(wx, wy, FL.bin.x - 6, FL.bin.y - 8, 38, 44); }
function hitCustomer(wx, wy) {
  const d = G.day;
  for (const c of d.customers) {
    if (c.state !== 'wait') continue;
    if (inRect(wx, wy, c.x - 30, c.y - 128, 60, 128)) return c;
  }
  return null;
}

// ----- 拖拽：拿起 / 放下 / 退回
function pick(type, data, src) { G.day.drag = { type, data, src }; sfx('pop', 0.3); }
function returnToSrc(dr) {
  const d = G.day, s = dr.src;
  if (s.k === 'table') d.dough = dr.data;
  else if (s.k === 'proof') d.proof[s.i] = dr.data;
  else if (s.k === 'board') d.board = dr.data;
  else if (s.k === 'plate') d.plate = dr.data;
  else if (s.k === 'hold') d.hold[s.i] = { type: dr.type, data: dr.data };
  else if (s.k === 'counter') d.counter[s.i] = dr.data;
}
function discard(dr, wx, wy) {
  const d = G.day;
  d.discarded++;
  sfx('trash', 0.5);
  fx('fx_flour', wx - 6, wy - 10);
  floatText('扔掉了', wx, wy - 14, C.inkSoft, 8);
}
function startBoardFromProof(s) {
  const d = G.day;
  const g = grade(s.t, PROOF_ZONE);
  s.d.b.grades.proof = g;
  showGrade(g, KX + KL.board.cx, 122);
  if (s.t > PROOF_ZONE.g1) floatText('发过头了', KX + KL.board.cx, 132, C.red, 8);
  d.board = { b: s.d.b, stage: 'roll', s: 0.42, cov: null, cuts: [], anim: 0 };
  sfx('pop', 0.4);
}
// 尝试把拖着的东西放到 (kx, ky)；成功返回 true
function dropKitchen(dr, kx, ky) {
  const d = G.day;
  if (hitBin(kx, ky)) { discard(dr, KX + KL.bin.x + 13, KL.bin.y); return true; }
  const hs = hitHold(kx, ky);
  if (hs >= 0) {
    if (d.hold[hs]) { toast('暂存架这一格有东西了'); return false; }
    d.hold[hs] = { type: dr.type, data: dr.data };
    sfx('pop', 0.4);
    floatText(dr.type === 'proof' ? '暂存：停止发酵' : '暂存', KX + KL.hold.slots[hs], 76, C.green, 8);
    return true;
  }
  if (dr.type === 'dough') {
    const ps = hitProofSlot(kx, ky);
    if (ps >= 0) {
      if (dr.data.stage !== 'smooth') { toast('先揉面，再放进发酵柜'); return false; }
      if (d.proof[ps]) { toast('这一格在发酵别的面团'); return false; }
      d.proof[ps] = { d: dr.data, t: 0, ready: false }; sfx('pop', 0.4); return true;
    }
    if (hitDough(kx, ky) && !d.dough) { d.dough = dr.data; return true; }
    if (hitBoard(kx, ky)) toast('面团要先进发酵柜发酵');
    return false;
  }
  if (dr.type === 'proof') {
    if (hitBoard(kx, ky) || hitGrab(kx, ky)) {
      if (d.board) { toast('整形台正在用：先把它“拿起”放到暂存架'); return false; }
      startBoardFromProof(dr.data); return true;
    }
    const ps = hitProofSlot(kx, ky);
    if (ps >= 0 && !d.proof[ps]) { d.proof[ps] = dr.data; sfx('pop', 0.4); return true; }
    return false;
  }
  if (dr.type === 'board') {
    if (hitBoard(kx, ky) || hitGrab(kx, ky)) {
      if (d.board) { toast('整形台上已经有东西了'); return false; }
      d.board = dr.data; sfx('pop', 0.3); return true;
    }
    const os = hitOvenSlot(kx, ky);
    if (os >= 0) {
      if (dr.data.stage !== 'tray') { toast('还没整形完，不能进烤箱'); return false; }
      if (d.oven[os]) { toast('这一层已经有烤盘了'); return false; }
      d.oven[os] = newOvenItem(dr.data.b);
      sfx('pop', 0.4);
      floatText(HEATS[d.temp].name + '火烘烤', KX + KL.ovenSlots[os].cx, KL.ovenSlots[os].top - 6, C.red, 8);
      return true;
    }
    return false;
  }
  if (dr.type === 'plate') {
    if (hitPass(kx, ky)) {
      const slot = d.counter.findIndex(x => !x);
      if (slot < 0) { toast('柜台放满了，先给客人上菜'); return false; }
      d.counter[slot] = dr.data.b;
      sfx('door_bell', 0.25);
      floatText('送到前厅了', KX + KL.pass.x + 31, KL.pass.y - 4, C.green, 8);
      return true;
    }
    if (hitPlate(kx, ky) && !d.plate) { d.plate = dr.data; return true; }
    return false;
  }
  return false;
}

// ----- 营业日输入
function dayDown(sx, sy) {
  const d = G.day;
  if (!d || G.paused || d.ended) return;
  const rc = d.receipt;
  if (rc && rc.w && view() === 'front' && inRect(sx, sy, rc.x, rc.y, rc.w, rc.h)) {
    if (rc.open) d.receipt = null; else { rc.open = true; rc.openT = 0; }
    sfx('click', 0.3); return;
  }
  const wx = sx + cam.x, wy = sy;
  if (wx < KX) {
    const i = hitCounterPlate(wx, wy);
    if (i >= 0) { const b = d.counter[i]; d.counter[i] = null; pick('counter', b, { k: 'counter', i }); }
    return;
  }
  const kx = wx - KX, ky = wy;
  // 配料罐
  const jar = hitJar(kx, ky);
  if (jar) {
    if (d.stock[jar] <= 0) { toast(`${EXTRAS[jar].name}用完了，点上方“市场”补货`); return; }
    d.drag = { type: 'jar', key: jar }; sfx('pop', 0.3); return;
  }
  // 火力旋钮
  const kn = hitKnob(kx, ky);
  if (kn) { setTemp(kn.k); return; }
  // 面粉袋
  if (hitFlour(kx, ky)) {
    if (d.dough) { toast('揉面台上已经有一团面了（不要可以拖进垃圾桶）'); return; }
    d.dough = { stage: 'raw', knead: 0, kneading: false, b: newBatch() };
    sfx('pop', 0.5);
    fx('fx_flour', KX + KL.dough.cx - 12, 160); fx('fx_flour', KX + KL.dough.cx + 2, 162);
    return;
  }
  // 暂存架
  const hs = hitHold(kx, ky);
  if (hs >= 0 && d.hold[hs]) { const it = d.hold[hs]; d.hold[hs] = null; pick(it.type, it.data, { k: 'hold', i: hs }); return; }
  // 整形台“拿起”
  if (canGrab(d.board) && hitGrab(kx, ky)) { const bd = d.board; d.board = null; pick('board', bd, { k: 'board' }); return; }
  // 面团
  if (d.dough && hitDough(kx, ky)) {
    if (d.dough.stage === 'raw') { d.dough.kneading = true; d.dough.knead = 0; d.dough.pressX = kx; d.dough.pressY = ky; return; }
    const dg = d.dough; d.dough = null; pick('dough', dg, { k: 'table' }); return;
  }
  // 发酵柜
  const ps = hitProofSlot(kx, ky);
  if (ps >= 0 && d.proof[ps]) { const s = d.proof[ps]; d.proof[ps] = null; pick('proof', s, { k: 'proof', i: ps }); return; }
  // 整形台
  if (d.board && hitBoard(kx, ky)) {
    const bd = d.board;
    if (bd.stage === 'roll') { d.tool = 'pin'; return; }
    if (bd.stage === 'spread') { d.tool = 'brush'; spreadAt(kx, ky); return; }
    if (bd.stage === 'cut') { d.tool = 'cutter'; d.cutStart = { x: kx, y: ky }; return; }
    if (bd.stage === 'tray') { d.board = null; pick('board', bd, { k: 'board' }); return; }
  }
  // 烤箱
  const os = hitOvenSlot(kx, ky);
  if (os >= 0 && d.oven[os]) { takeFromOven(os); return; }
  // 装饰台
  if (d.plate && hitPlate(kx, ky)) { const pl = d.plate; d.plate = null; pick('plate', pl, { k: 'plate' }); return; }
}

function spreadAt(kx, ky) {
  const bd = G.day.board;
  if (!bd || bd.stage !== 'spread') return;
  const r = sheetRect(bd.s);
  let hit = false;
  for (let i = 0; i < 24; i++) {
    const cx = r.x + (i % 8 + 0.5) * r.w / 8, cy = r.y + (Math.floor(i / 8) + 0.5) * r.h / 3;
    if (!bd.cov[i] && Math.abs(kx - cx) <= r.w / 16 + 4 && Math.abs(ky - cy) <= r.h / 6 + 4) { bd.cov[i] = true; hit = true; }
  }
  if (hit) {
    bd.bt = (bd.bt || 0) + 1;
    if (bd.bt % 4 === 1) sfx('brush', 0.3);
    if (bd.cov.every(Boolean)) finishSpread();
  }
}

function dayMove(sx, sy, dx, dy) {
  const d = G.day;
  if (!d || G.paused) return;
  const wx = sx + cam.x, kx = wx - KX, ky = sy;
  // 按住生面团后移动：改为拖走（用于扔掉或换位置），而不是揉面
  const dg = d.dough;
  if (dg && dg.kneading && dg.knead < 25 && Math.hypot(kx - dg.pressX, ky - dg.pressY) > 8) {
    dg.kneading = false; dg.knead = 0; d.dough = null;
    pick('dough', dg, { k: 'table' });
    return;
  }
  if (d.tool === 'pin' && d.board && d.board.stage === 'roll') {
    if (hitBoard(kx, ky)) {
      const bd = d.board;
      bd.s = Math.min(1.4, bd.s + Math.abs(dx) * 0.0028);
      bd.rt = (bd.rt || 0) + Math.abs(dx);
      if (bd.rt > 40) { bd.rt = 0; sfx('roll', 0.35); }
    }
  } else if (d.tool === 'brush') {
    spreadAt(kx, ky);
  } else if (d.tool === 'cutter' && d.board && d.board.stage === 'cut') {
    const py = ky - dy;
    if ((py < LOG.y && ky >= LOG.y) || (py > LOG.y && ky <= LOG.y)) doCut(kx);
  }
}

function dayUp(sx, sy) {
  const d = G.day;
  if (!d) return;
  const wx = sx + cam.x, kx = wx - KX, ky = sy;
  if (d.dough && d.dough.kneading) finishKnead();
  if (d.tool === 'cutter' && d.cutStart && ptr.moved < 3 && d.board && d.board.stage === 'cut' &&
      Math.abs(ky - LOG.y) <= LOG.h) doCut(kx);
  d.tool = null; d.cutStart = null;

  const dr = d.drag;
  if (!dr) return;
  d.drag = null;
  const inKitchen = wx >= KX;
  if (dr.type === 'jar') {
    const e = EXTRAS[dr.key];
    if (!inKitchen) return;
    if (e.where === 'dough' && d.dough && hitDough(kx, ky)) { addExtra(d.dough.b, dr.key, wx, KL.dough.by - 18); return; }
    if (e.where === 'plate' && d.plate && hitPlate(kx, ky)) { addExtra(d.plate.b, dr.key, wx, 150); return; }
    if (e.where === 'tray' && d.board && d.board.stage === 'tray' && hitBoard(kx, ky)) { addExtra(d.board.b, dr.key, wx, KL.board.y + 8); return; }
    const wrongSpot = (d.dough && hitDough(kx, ky)) || (d.plate && hitPlate(kx, ky)) || (d.board && hitBoard(kx, ky));
    if (wrongSpot) { toast(e.name + WHERE_TIP[e.where]); return; }
    if (e.where === 'dough' && !d.dough && hitDough(kx, ky)) { toast('先点面粉袋开一团面'); return; }
    return;
  }
  if (dr.type === 'counter') {
    if (!inKitchen) {
      const c = hitCustomer(wx, sy);
      if (c) { serve(c, dr.data); return; }
      if (hitFrontBin(wx, sy)) { discard(dr, FL.bin.x + 13, FL.bin.y); return; }
    }
    returnToSrc(dr);
    return;
  }
  if (inKitchen && dropKitchen(dr, kx, ky)) return;
  returnToSrc(dr);
}

// ============================================================ 绘制：营业日
function drawCustomer(c) {
  if (c.state === 'pending' || c.state === 'gone') return;
  const walking = c.state === 'walk' || c.state === 'leave';
  const fi = walking ? Math.floor(c.walkT * 8) % 4 : { idle: 4, happy: 5, impatient: 6, angry: 7 }[c.face] || 4;
  let hopY = 0;
  if (c.state === 'served' && c.hop) hopY = -Math.abs(Math.sin(c.hop * 9)) * 6 * Math.max(0, 1 - c.hop / 1.6);
  if (c.state === 'wait' && c.face === 'impatient') hopY = (Math.floor(G.t * 6) % 2) ? -1 : 0;
  const flip = walking && c.dir < 0;
  sprFrame('char_customer_' + c.kind, fi, 28, 44, c.x - 28, c.y - 88 + hopY, 2, flip);
}
function drawBubble(c) {
  if (c.state !== 'wait') return;
  const s = 0.6 + 0.4 * c.bub;
  const w = 62, h = 30, x = c.x - w / 2, y = c.y - 88 - h - 8;
  ctx.save();
  ctx.translate(c.x, y + h);
  ctx.scale(s, s);
  ctx.translate(-c.x, -(y + h));
  fillRR(x, y + 2, w, h, 6, C.shadow);
  fillRR(x, y, w, h, 6, '#fff', C.ink, 1);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(c.x - 5, y + h - 0.5); ctx.lineTo(c.x, y + h + 6); ctx.lineTo(c.x + 5, y + h - 0.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(c.x - 5, y + h); ctx.lineTo(c.x, y + h + 6); ctx.lineTo(c.x + 5, y + h); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(c.x - 4, y + h - 1.5, 8, 2);
  spr('food_knot_baked', x + 4, y + 9);
  txt('+', x + 21, y + 15, { size: 8, bold: true, color: C.inkSoft, align: 'center' });
  c.prefs.forEach((t, i) => spr(TAGS[t].icon, x + 25 + i * 13, y + 9));
  const f = custFrac(c);
  const col = f > 0.6 ? C.green : f > 0.3 ? '#e8a020' : C.red;
  ring(x + w - 8, y + 15, 4.5, G.relaxed ? 1 : f, col, 2);
  ctx.restore();
}
// 配料在面包上的样子：豆蔻=绿籽、橙皮=橙丝、珍珠糖=白粒、蜂蜜=金色淋面
const EXTRA_OVERLAY = { cardamom: 'food_overlay_cardamom', orange: 'food_overlay_orange', pearl: 'food_overlay_pearl', honey: 'food_overlay_honey' };
function drawBun(x, y, b, sprk) {
  spr(sprk || knotSprite(b.bake), x, y);
  if (b.bake === 'golden' || b.bake === 'dark') spr('food_overlay_gloss', x, y);
  ['cardamom', 'orange', 'pearl', 'honey'].forEach(k => { if (b.extras.includes(k)) spr(EXTRA_OVERLAY[k], x, y); });
}
function batchTags(b) {
  const t = [];
  b.extras.forEach(k => { const g = EXTRAS[k].tag; if (!t.includes(g)) t.push(g); });
  if (b.heatTag && !t.includes(b.heatTag)) t.push(b.heatTag);
  return t;
}
// 口味标签条：和客人气泡里的图标一致，方便对单
function drawTagStrip(cx, y, b, s = 1) {
  const tags = batchTags(b);
  const ruined = b.bake === 'burnt' || b.bake === 'raw';
  const n = Math.max(1, tags.length);
  const w = (n * 13 + 4) * s, h = 14 * s, x = cx - w / 2;
  fillRR(x, y, w, h, 4 * s, ruined ? '#f3d2c8' : '#fffaf0', C.ink, 0.9);
  if (!tags.length) { txt('原味', cx, y + h / 2 + 0.5, { size: 6.5 * s, bold: true, align: 'center', color: C.inkSoft }); return; }
  tags.forEach((t, i) => spr(TAGS[t].icon, x + (3 + i * 13) * s, y + 1 * s, s));
  if (ruined) { ctx.strokeStyle = C.red; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 2, y + h - 2); ctx.lineTo(x + w - 2, y + 2); ctx.stroke(); }
}
function drawPlate(cx, by, b, strip = true) {
  spr('food_plate', cx - 22, by - 16);
  [cx - 12, cx, cx + 12].forEach(x => drawBun(x - 7, by - 18, b));
  if (strip) drawTagStrip(cx, by - 1, b);
}
function drawKnotsOnTray(x, y, sprk, b) {
  [12, 28, 44].forEach(ox => {
    if (b) drawBun(x + ox - 7, y + 2, Object.assign({}, b, { bake: null }), sprk);
    else spr(sprk, x + ox - 7, y + 2);
  });
}
// 统一绘制可拖拽的物品（底边中点锚定）
function drawItem(type, data, cx, by, s = 1) {
  if (type === 'dough') {
    sprAnchor(data.stage === 'raw' ? 'food_dough_raw' : 'food_dough_smooth', cx, by, s, s);
    data.b.extras.forEach((k, i) => spr(TAGS[EXTRAS[k].tag].icon, cx - data.b.extras.length * 5 + i * 10, by - 26 * s, 0.75 * s));
  } else if (type === 'proof') {
    const g = Math.min(data.t / 10, 1.1), sc = (0.78 + 0.32 * g) * s;
    const over = data.t > PROOF_ZONE.g1;
    sprAnchor(data.t >= PROOF_ZONE.g0 ? 'food_dough_proofed' : 'food_dough_smooth', cx, by, sc * (over ? 1.1 : 1), sc * (over ? 0.8 : 1));
    const ex = data.d.b.extras;
    ex.forEach(k => { const o = IMG[EXTRA_OVERLAY[k]]; if (o) ctx.drawImage(o, cx - 16 * sc, by - 18 * sc, 32 * sc, 16 * sc); });
    ex.forEach((k, i) => spr(TAGS[EXTRAS[k].tag].icon, cx - ex.length * 5 + i * 10, by - 24 * sc - 8, 0.75 * s));
  } else if (type === 'board') {
    const B = KL.board;
    const hh = data.stage === 'tray' ? 22 : data.stage === 'cut' ? LOG.h : SHEET.h * (data.s || 1);
    ctx.save(); ctx.translate(cx, by - hh * s / 2); ctx.scale(s, s); ctx.translate(-B.cx, -B.cy);
    drawBoardBody(data, false);
    ctx.restore();
  } else if (type === 'plate' || type === 'counter') {
    const b = type === 'plate' ? data.b : data;
    ctx.save(); ctx.translate(cx, by); ctx.scale(s, s); ctx.translate(-cx, -by);
    drawPlate(cx, by, b);
    ctx.restore();
  }
}
function drawFront() {
  const d = G.day;
  spr('bg_front', 0, 0);
  if (d.doorSwing > 0) {
    const a = Math.sin(d.doorSwing * 30) * 2;
    ctx.fillStyle = C.yel; ctx.fillRect(51 + a, 46, 12, 6);
  }
  const list = d.customers.filter(c => c.state !== 'pending' && c.state !== 'gone').sort((a, b) => a.y - b.y);
  list.forEach(drawCustomer);
  spr('bg_front_counter', 0, FL.counterY);
  d.counter.forEach((b, i) => { if (b) drawPlate(FL.plateSlots[i], 199, b); });
  const draggingCounter = d.drag && d.drag.type === 'counter';
  const overBin = draggingCounter && hitFrontBin(ptr.x + cam.x, ptr.y);
  spr(overBin ? 'station_bin_open' : 'station_bin', FL.bin.x, FL.bin.y);
  if (draggingCounter) {
    dashBox(FL.bin.x - 4, FL.bin.y - 6, 34, 40, '扔掉');
    d.customers.filter(c => c.state === 'wait').forEach(c => dashBox(c.x - 26, c.y - 92, 52, 84, ''));
  }
  list.forEach(drawBubble);
  if (draggingCounter) list.filter(c => c.state === 'wait').forEach(c => drawMatchBadge(c, d.drag.data));
}
// 对单提示：这盘面包和这位客人的口味对上几个
function matchInfo(b, c) {
  const tags = batchTags(b);
  const ruined = b.bake === 'burnt' || b.bake === 'raw';
  const n = ruined ? 0 : c.prefs.filter(t => tags.includes(t)).length;
  return { n, ruined, mult: 1 + 0.25 * Math.min(2, n) };
}
function drawMatchBadge(c, b) {
  const m = matchInfo(b, c);
  const hover = ptr.inside && inRect(ptr.x + cam.x, ptr.y, c.x - 30, c.y - 128, 60, 128);
  const label = m.ruined ? '烤坏了' : m.n === 2 ? '全对上 ×1.5' : m.n === 1 ? '对上 1 个 ×1.25' : '没对上';
  const col = m.ruined ? '#e8b4a8' : m.n === 2 ? '#7cc45a' : m.n === 1 ? '#f6d46a' : '#e2d8cc';
  const w = textW(label, 7.5, true) + 12, x = c.x - w / 2, y = c.y - 140 + (hover ? -2 : 0);
  fillRR(x, y + 1.5, w, 13, 6, C.shadow);
  fillRR(x, y, w, 13, 6, col, C.ink, hover ? 1.6 : 1);
  txt(label, c.x, y + 7, { size: 7.5, bold: true, align: 'center' });
}
function dashBox(x, y, w, h, label) {
  const a = 0.55 + 0.35 * Math.sin(G.t * 8);
  ctx.save();
  ctx.setLineDash([3, 2]); ctx.lineWidth = 1.3; ctx.strokeStyle = `rgba(60,150,60,${a})`;
  rrPath(x, y, w, h, 4); ctx.stroke();
  ctx.restore();
  if (label) txt(label, x + w / 2, y - 4, { size: 6.5, bold: true, align: 'center', color: '#2f7a2f', outline: '#fff', ow: 2 });
}
// 拖拽时高亮可以放下的位置（后厨局部坐标）
function drawDropTargets(dr) {
  const d = G.day;
  if (!dr || dr.type === 'jar' || dr.type === 'counter') {
    if (dr && dr.type === 'jar') {
      const e = EXTRAS[dr.key];
      if (e.where === 'dough' && d.dough) dashBox(KL.dough.cx - 22, KL.dough.by - 28, 44, 32, '揉入');
      if (e.where === 'plate' && d.plate) dashBox(KL.plate.cx - 26, KL.plate.by - 30, 52, 34, '淋上');
      if (e.where === 'tray' && d.board && d.board.stage === 'tray') dashBox(KL.board.x, KL.board.y, KL.board.w, KL.board.h, '撒上');
    }
    return;
  }
  dashBox(KL.bin.x - 4, KL.bin.y - 6, 34, 40, '扔掉');
  KL.hold.slots.forEach((cx, i) => { if (!d.hold[i]) { dashBox(cx - 25, 76, 50, 32, ''); txt('暂存', cx, 92, { size: 7, bold: true, align: 'center', color: '#2f7a2f', outline: '#fff', ow: 2 }); } });
  if (dr.type === 'dough') {
    if (dr.data.stage === 'smooth') d.proof.forEach((p, i) => { if (!p) dashBox(131, KL.proofSlots[i].top, 52, 50, '发酵'); });
    if (!d.dough) dashBox(KL.dough.cx - 22, KL.dough.by - 28, 44, 32, '');
  } else if (dr.type === 'proof') {
    if (!d.board) dashBox(KL.board.x, KL.board.y, KL.board.w, KL.board.h, '整形');
    d.proof.forEach((p, i) => { if (!p) dashBox(131, KL.proofSlots[i].top, 52, 50, ''); });
  } else if (dr.type === 'board') {
    if (!d.board) dashBox(KL.board.x, KL.board.y, KL.board.w, KL.board.h, '整形台');
    if (dr.data.stage === 'tray') d.oven.forEach((o, i) => { if (!o) dashBox(318, KL.ovenSlots[i].top, 64, 46, '烘烤'); });
  } else if (dr.type === 'plate') {
    if (!d.plate) dashBox(KL.plate.cx - 26, KL.plate.by - 30, 52, 34, '');
    dashBox(KL.pass.x - 2, KL.pass.y - 2, KL.pass.w + 4, KL.pass.h + 4, '出餐');
  }
}
function drawKitchen() {
  const d = G.day;
  ctx.save();
  ctx.translate(KX, 0);
  spr('bg_kitchen', 0, 0);
  // 订单票
  const waiting = d.customers.filter(c => c.state === 'wait' || c.state === 'order');
  waiting.forEach((c, i) => {
    const x = 30 + i * 35, y = 12;
    const f = custFrac(c);
    const shake = (!G.relaxed && f < 0.3) ? Math.sin(G.t * 30) * 1 : 0;
    ctx.save(); ctx.translate(x + 16 + shake, y);
    ctx.fillStyle = C.ink; ctx.fillRect(-1, -4, 2, 4);
    fillRR(-16, 0, 32, 42, 2, C.paper, C.ink, 1);
    spr('char_face_' + c.kind, -10, 2);
    if (c.state === 'wait') {
      c.prefs.forEach((t, k) => spr(TAGS[t].icon, -13 + k * 14, 25));
      const col = f > 0.6 ? C.green : f > 0.3 ? '#e8a020' : C.red;
      bar(-12, 38, 24, 2, G.relaxed ? 1 : f, col);
    } else txt('点单中', 0, 31, { size: 7, align: 'center', color: C.inkSoft });
    ctx.restore();
  });
  // 架子与配料罐
  spr('station_shelf', 8, 118);
  for (const k of EXTRA_KEYS) {
    const j = KL.jars[k];
    const dragging = d.drag && d.drag.type === 'jar' && d.drag.key === k;
    spr(EXTRAS[k].jar, j.x, j.y, 1, { alpha: d.stock[k] > 0 ? (dragging ? 0.45 : 1) : 0.35 });
    fillRR(j.x + 11, j.y - 3, 11, 8, 3, d.stock[k] > 0 ? C.paper : '#f2c8bc', C.ink, 1);
    txt(String(d.stock[k]), j.x + 16.5, j.y + 1, { size: 7, bold: true, align: 'center', color: d.stock[k] > 0 ? C.ink : C.red });
  }
  for (const k of EXTRA_KEYS) txt(WHERE_SHORT[EXTRAS[k].where], KL.jars[k].x + 10, 135, { size: 6.3, align: 'center', color: C.inkSoft });
  // 揉面台
  spr('station_dough_table', 8, 170);
  spr('tool_flour', KL.flour.x, KL.flour.y);
  const dg = d.dough;
  if (dg) {
    let sx = 1, sy = 1;
    if (dg.kneading) { const w = Math.sin(G.t * 22); sx = 1.12 + 0.08 * w; sy = 0.82 - 0.08 * w; }
    sprAnchor(dg.stage === 'raw' ? 'food_dough_raw' : 'food_dough_smooth', KL.dough.cx, KL.dough.by, sx, sy);
    dg.b.extras.forEach(k => { const o = IMG[EXTRA_OVERLAY[k]]; if (o) ctx.drawImage(o, KL.dough.cx - 14 * sx, KL.dough.by - 15 * sy, 28 * sx, 14 * sy); });
    dg.b.extras.forEach((k, i) => spr(TAGS[EXTRAS[k].tag].icon, KL.dough.cx - 14 + i * 10, KL.dough.by - 30, 0.75));
    if (dg.stage === 'raw') {
      const x = 104, y = 141, h = 30, w = 6;
      fillRR(x - 1, y - 1, w + 2, h + 2, 2, C.ink);
      ctx.fillStyle = '#e8dcc8'; ctx.fillRect(x, y, w, h);
      const toY = v => y + h - h * v / 100;
      ctx.fillStyle = '#cfe8b0'; ctx.fillRect(x, toY(KNEAD_ZONE.g1), w, toY(KNEAD_ZONE.g0) - toY(KNEAD_ZONE.g1));
      ctx.fillStyle = '#7cc45a'; ctx.fillRect(x, toY(KNEAD_ZONE.p1), w, toY(KNEAD_ZONE.p0) - toY(KNEAD_ZONE.p1));
      ctx.fillStyle = 'rgba(214,92,76,.85)'; ctx.fillRect(x, toY(dg.knead), w, y + h - toY(dg.knead));
      ctx.fillStyle = C.ink; ctx.fillRect(x - 2, toY(dg.knead) - 1, w + 4, 2);
    }
  }
  // 发酵柜
  const proofOn = d.proof.some(Boolean);
  spr(proofOn ? 'station_proofer_on' : 'station_proofer_idle', KL.proofer.x, KL.proofer.y);
  d.proof.forEach((s, i) => {
    if (!s) return;
    const sl = KL.proofSlots[i];
    drawItem('proof', s, sl.cx, sl.by);
    const frac = s.t / PROOF_ZONE.max;
    bar(134, sl.top + 4, 46, 3, frac, null, '#e8dcc8',
      { p0: PROOF_ZONE.p0 / PROOF_ZONE.max, p1: PROOF_ZONE.p1 / PROOF_ZONE.max, g0: PROOF_ZONE.g0 / PROOF_ZONE.max, g1: PROOF_ZONE.g1 / PROOF_ZONE.max });
    marker(134 + 46 * clamp(frac, 0, 1), sl.top + 4, 3);
  });
  // 暂存架
  spr('station_shelf', KL.hold.shelfX, KL.hold.y);
  fillRR(204, 64, 92, 11, 5, 'rgba(255,250,240,.9)', 'rgba(74,48,40,.5)', 1);
  txt('暂存架 · 放上去不会发过头', 250, 69.5, { size: 6.5, bold: true, align: 'center', color: C.inkSoft });
  d.hold.forEach((it, i) => {
    const cx = KL.hold.slots[i];
    if (!it) { ctx.fillStyle = 'rgba(74,48,40,.12)'; ctx.fillRect(cx - 14, KL.hold.y - 2, 28, 2); return; }
    drawItem(it.type, it.data, cx, KL.hold.y, it.type === 'board' ? 0.48 : it.type === 'plate' ? 0.82 : 0.85);
    if (it.type === 'proof') {
      fillRR(cx + 10, KL.hold.y - 26, 16, 9, 3, '#eaf4ff', C.ink, 0.8);
      ctx.fillStyle = C.blue; ctx.fillRect(cx + 15, KL.hold.y - 24, 1.6, 5); ctx.fillRect(cx + 19, KL.hold.y - 24, 1.6, 5);
    }
  });
  // 整形台
  spr('station_shaping_table', 194, 170);
  const B = KL.board;
  fillRR(B.x, B.y + 2, B.w, B.h, 3, 'rgba(120,80,50,.35)');
  fillRR(B.x, B.y, B.w, B.h, 3, '#e8c08a', C.ink, 1);
  ctx.fillStyle = '#dcae74';
  for (let yy = B.y + 6; yy < B.y + B.h; yy += 7) ctx.fillRect(B.x + 3, yy, B.w - 6, 1);
  spr('tool_butter_bowl', 196, 156);
  if (d.board) drawBoardBody(d.board, true);
  if (canGrab(d.board)) {
    const g = KL.grab, hov = ptr.inside && hitGrab(ptr.x + cam.x - KX, ptr.y);
    fillRR(g.x, g.y + (hov ? -1 : 0), g.w, g.h, 3, hov ? '#ffe7b8' : C.paper, C.ink, 1);
    spr('ui_cursor_hand', g.x + 2, g.y + 1 + (hov ? -1 : 0), 0.3);
    txt('拿起', g.x + 24, g.y + 6.5 + (hov ? -1 : 0), { size: 7, bold: true, align: 'center' });
  }
  // 垃圾桶（放在整形台前）
  const draggingItem = d.drag && d.drag.type !== 'jar' && d.drag.type !== 'counter';
  const overBin = draggingItem && hitBin(ptr.x + cam.x - KX, ptr.y);
  spr(overBin ? 'station_bin_open' : 'station_bin', KL.bin.x, KL.bin.y);
  // 烤箱
  const ovenOn = d.oven.some(Boolean);
  const HT = HEATS[d.temp];
  spr(ovenOn ? 'station_oven_on' : 'station_oven_off', KL.oven.x, KL.oven.y);
  if (ovenOn) {
    ctx.globalAlpha = HT.glow + HT.glow * 0.4 * Math.sin(G.t * (6 + HT.rate * 3));
    ctx.fillStyle = '#ffb050'; ctx.fillRect(KL.oven.x - 6, KL.oven.y + 20, 88, 126);
    ctx.globalAlpha = 1;
  }
  // 火焰：根据火力显示数量和高度
  if (ovenOn) {
    KL.ovenSlots.forEach(s => {
      for (let k = 0; k < HT.flames; k++) {
        const fx_ = 323 + (k + 0.5) * (54 / HT.flames);
        const fh = (1.6 + HT.rate * 0.9) * (0.75 + 0.25 * Math.sin(G.t * 14 + k * 1.7));
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath(); ctx.moveTo(fx_ - 2.2, s.rack + 4.5); ctx.lineTo(fx_, s.rack + 4.5 - fh * 2); ctx.lineTo(fx_ + 2.2, s.rack + 4.5); ctx.fill();
        ctx.fillStyle = '#ffe070';
        ctx.beginPath(); ctx.moveTo(fx_ - 1, s.rack + 4.5); ctx.lineTo(fx_, s.rack + 4.5 - fh); ctx.lineTo(fx_ + 1, s.rack + 4.5); ctx.fill();
      }
    });
  }
  // 火力牌子
  fillRR(314, 70, 72, 12, 6, 'rgba(255,250,240,.95)', C.ink, 1);
  txt(`火力：${HT.name}`, 333, 76.5, { size: 7, bold: true, align: 'center', color: C.red });
  txt({ low: '慢·稳', mid: '中·+2', high: '快·+5' }[d.temp], 365, 76.5, { size: 6.5, align: 'center', color: C.inkSoft });
  KL.knobs.forEach(k => {
    if (d.temp === k.k) { ctx.fillStyle = C.yel; ctx.beginPath(); ctx.arc(k.x, k.y, 6.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = C.ink; ctx.save(); ctx.translate(k.x, k.y);
    ctx.rotate({ low: -0.9, mid: 0, high: 0.9 }[k.k]); ctx.fillRect(-0.5, -5, 1.5, 4); ctx.restore();
    txt(HEATS[k.k].name, k.x, k.y + 0.5, { size: 6.5, bold: true, align: 'center', color: d.temp === k.k ? C.ink : C.inkSoft });
  });
  d.oven.forEach((o, i) => {
    if (!o) return;
    const s = KL.ovenSlots[i];
    spr('food_tray', s.cx - 28, s.rack - 20);
    drawKnotsOnTray(s.cx - 28, s.rack - 20, bakeInfo(o).spr, o.b);
    const M = BAKE_U.max;
    bar(323, s.top + 5, 54, 4, 0, null, '#e8dcc8',
      { p0: BAKE_U.gold / M, p1: BAKE_U.goldEnd / M, g0: BAKE_U.pale / M, g1: BAKE_U.burn / M, goodColor: '#f4d9a0', color: '#f2a516', bad: BAKE_U.burn / M });
    marker(323 + 54 * clamp(o.u / M, 0, 1), s.top + 5, 4);
    const cd = ovenCountdown(o, d.temp);
    txt(cd.t, 350, s.top + 14, { size: 6.5, bold: true, align: 'center', color: cd.c, outline: C.ink, ow: 2 });
  });
  // 出餐窗口与装饰台
  spr('station_pass_window', KL.pass.x, KL.pass.y);
  txt('出餐', KL.pass.x + 31, KL.pass.y + 25, { size: 8, bold: true, align: 'center', color: C.inkSoft });
  spr('station_plating_table', 394, 170);
  if (d.plate) drawPlate(KL.plate.cx, KL.plate.by, d.plate.b);
  if (d.drag) drawDropTargets(d.drag);
  ctx.restore();
}
// 整形台上的内容（以整形台坐标绘制；full=false 用于缩小显示）
function drawBoardBody(bd, full) {
  const B = KL.board;
  if (bd.stage === 'roll' || bd.stage === 'spread') {
    const r = sheetRect(bd.s);
    fillRR(r.x, r.y, r.w, r.h, 3 * bd.s, '#f8e6c4', C.ink, 1);
    if (bd.stage === 'roll' && full) {
      const dev = Math.abs(bd.s - 1);
      ctx.setLineDash([3, 2]); ctx.lineWidth = 1.4;
      ctx.strokeStyle = dev <= 0.06 ? '#3c9a3c' : bd.s > 1.06 ? C.red : 'rgba(74,48,40,.8)';
      ctx.strokeRect(B.cx - SHEET.w / 2, B.cy - SHEET.h / 2, SHEET.w, SHEET.h);
      ctx.setLineDash([]);
      if (bd.s > 1.06) txt('擀过头了', B.cx, B.y + B.h + 6, { size: 7, bold: true, align: 'center', color: C.red, outline: '#fff' });
    }
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(r.x + 3, r.y + 2, r.w * 0.5, 1);
    if (bd.s > 1.15) { ctx.fillStyle = '#c89a6a'; ctx.fillRect(r.x + r.w * 0.3, r.y + r.h * 0.5, 3, 2); ctx.fillRect(r.x + r.w * 0.7, r.y + r.h * 0.3, 2, 2); }
    if (bd.stage === 'spread') {
      for (let i = 0; i < 24; i++) {
        if (!bd.cov[i]) continue;
        const cw = r.w / 8, ch = r.h / 3;
        ctx.fillStyle = (i + Math.floor(i / 8)) % 2 ? '#a0582e' : '#96522c';
        ctx.fillRect(r.x + (i % 8) * cw + 1, r.y + Math.floor(i / 8) * ch + 1, cw - 0.5, ch - 0.5);
      }
    }
  } else if (bd.stage === 'rollup') {
    const t = clamp(bd.anim / 0.5, 0, 1);
    const w = lerp(SHEET.w * bd.s, LOG.x1 - LOG.x0, t), h = lerp(SHEET.h * bd.s, LOG.h, t);
    fillRR(B.cx - w / 2, B.cy - h / 2, w, h, h / 2, '#f4dcb0', C.ink, 1);
    ctx.fillStyle = '#96522c'; ctx.fillRect(B.cx - w / 2 + 2, B.cy - 1, w - 4, 1);
  } else if (bd.stage === 'cut') {
    fillRR(LOG.x0, LOG.y - LOG.h / 2, LOG.x1 - LOG.x0, LOG.h, 5, '#f4dcb0', C.ink, 1);
    ctx.fillStyle = '#96522c';
    for (let x = LOG.x0 + 4; x < LOG.x1 - 4; x += 6) { ctx.fillRect(x, LOG.y - 3, 3, 1); ctx.fillRect(x + 2, LOG.y + 1, 3, 1); }
    if (full) {
      ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(74,48,40,.35)';
      [1, 2].forEach(k => { const x = LOG.x0 + (LOG.x1 - LOG.x0) * k / 3; ctx.beginPath(); ctx.moveTo(x, LOG.y - 10); ctx.lineTo(x, LOG.y + 10); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    bd.cuts.forEach(x => { ctx.fillStyle = C.ink; ctx.fillRect(x - 0.5, LOG.y - 7, 1.5, 14); ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, LOG.y - 6, 1, 12); });
  } else if (bd.stage === 'twist' || bd.stage === 'tray') {
    spr('food_tray', B.cx - 28, B.cy - 9);
    const t = bd.stage === 'twist' ? clamp(bd.anim / 0.8, 0, 1) : 1;
    [12, 28, 44].forEach((ox, i) => {
      const x = B.cx - 28 + ox;
      if (t < 1) {
        const w = lerp(20, 14, t), h = lerp(8, 12, t);
        ctx.save(); ctx.translate(x, B.cy - 1); ctx.rotate((1 - t) * 0.6 * (i - 1));
        fillRR(-w / 2, -h / 2, w, h, h / 2, '#f4dcb0', C.ink, 1); ctx.restore();
      } else drawBun(x - 7, B.cy - 7, Object.assign({}, bd.b, { bake: null }), 'food_knot_raw');
    });
  }
}

function drawCursorTool() {
  const d = G.day;
  if (!ptr.inside) return;
  const x = ptr.x, y = ptr.y;
  if (d.drag && !G.paused) {
    const dr = d.drag;
    if (dr.type === 'jar') spr(EXTRAS[dr.key].jar, x - 10, y - 14);
    else drawItem(dr.type, dr.data, x, y + 8, dr.type === 'board' ? 0.75 : 1);
    return;
  }
  const kx = x + cam.x - KX, ky = y;
  if (!G.paused && view() === 'kitchen' && camSettled() && !hitButton(x, y)) {
    if (d.board && hitBoard(kx, ky) && !(canGrab(d.board) && hitGrab(kx, ky))) {
      if (d.board.stage === 'roll') { spr('tool_pin', x - 23, y - 5); return; }
      if (d.board.stage === 'spread') { spr('tool_brush', x - 2, y - 5); return; }
      if (d.board.stage === 'cut') { spr('tool_cutter', x - 4, y - 4); return; }
    }
  }
  spr(ptr.down ? 'ui_cursor_grab' : 'ui_cursor_hand', x - 6, y - 2, 0.55);
}

// ----- 引导提示
function computeHint() {
  const d = G.day;
  const K = (x, y, text) => ({ view: 'kitchen', wx: KX + x, wy: y, text });
  const waiting = d.customers.filter(c => c.state === 'wait');
  if (d.drag && d.drag.type !== 'jar') {
    const tp = d.drag.type;
    if (tp === 'counter') return { view: 'front', wx: null, text: '客人头顶会显示口味对上几个：绿色＝全对上；拖进左边垃圾桶可以扔掉' };
    return { view: 'kitchen', wx: null, text: '绿色虚线处可以放下：暂存架先放着，垃圾桶扔掉' + (tp === 'board' && d.drag.data.stage === 'tray' ? '，烤箱开烤' : '') };
  }
  for (let i = 0; i < 2; i++) {
    const o = d.oven[i];
    if (!o) continue;
    const st = bakeInfo(o).st;
    const s = KL.ovenSlots[i];
    if (st === 'burnt') return K(s.cx + 22, s.top + 30, '烤焦了！快点击烤盘取出');
    if (st === 'golden' || st === 'dark') return K(s.cx + 22, s.top + 30, '烤到金黄了，点击烤盘取出');
  }
  const ci = d.counter.findIndex(Boolean);
  if (ci >= 0 && waiting.length) return { view: 'front', wx: FL.plateSlots[ci], wy: 170, text: '盘子下面的图标＝这盘的口味，和客人气泡里的图标对上越多，分越高' };
  // 发酵好了但整形台被占
  for (let i = 0; i < 2; i++) {
    const s = d.proof[i];
    if (s && s.t >= PROOF_ZONE.p0 && d.board && canGrab(d.board) && d.board.stage !== 'tray')
      return K(KL.grab.x + 19, KL.grab.y - 2, '面团发好了但整形台占着：点“拿起”，把整形台上的东西放到暂存架');
  }
  if (d.plate) {
    if (d.plate.b.bake === 'burnt' || d.plate.b.bake === 'raw') return K(KL.bin.x + 13, KL.bin.y - 4, '这盘烤坏了：可以拖进垃圾桶扔掉，或者照样上菜（只有 1 星）');
    return K(KL.pass.x + 31, KL.pass.y - 2, '可以把蜂蜜淋在盘里；再把盘子拖进出餐窗口');
  }
  for (let i = 0; i < 2; i++) {
    const s = d.proof[i];
    if (s && s.t >= PROOF_ZONE.p0 && !d.board) return K(KL.proofSlots[i].cx, KL.proofSlots[i].top - 2, '发酵好了（进度在绿区），把面团拖到整形台');
  }
  const bd = d.board;
  if (bd) {
    if (bd.stage === 'roll') return K(KL.board.cx, KL.board.y - 4, '按住左右拖动擀面杖，擀到虚线大小，再点“好了”');
    if (bd.stage === 'spread') return K(KL.board.cx, KL.board.y - 4, '按住拖动刷子，把肉桂黄油抹满面皮');
    if (bd.stage === 'cut') return K(KL.board.cx, KL.board.y - 4, '在面卷上竖着划两刀，切成三等份');
    if (bd.stage === 'tray') {
      const free = d.oven.findIndex(x => !x);
      if (free >= 0) return K(KL.ovenSlots[free].cx, KL.ovenSlots[free].top - 2, '可先把珍珠糖撒在烤盘上，再拖进烤箱（高火快、窗口短、+5 且酥脆）');
    }
  }
  // 暂存架上的东西
  for (let i = 0; i < 2; i++) {
    const it = d.hold[i];
    if (!it) continue;
    const at = K(KL.hold.slots[i], 74, '');
    if (it.type === 'proof' && !d.board) { at.text = '把暂存的面团拖到整形台（暂存时不会发过头）'; return at; }
    if (it.type === 'board' && !d.board) { at.text = '把暂存的半成品拖回整形台继续做'; return at; }
    if (it.type === 'dough' && it.data.stage === 'smooth' && d.proof.some(p => !p)) { at.text = '把暂存的面团拖进发酵柜'; return at; }
    if (it.type === 'plate' && !d.plate) { at.text = '把暂存的盘子拖回装饰台'; return at; }
  }
  if (d.dough) {
    if (d.dough.stage === 'raw') return K(KL.dough.cx, KL.dough.by - 24, '按住面团揉面，红条进绿区时松手（豆蔻、橙皮可先拖进面团）');
    const free = d.proof.findIndex(x => !x);
    if (free >= 0) return K(KL.proofSlots[free].cx, KL.proofSlots[free].top - 2, '把面团拖进发酵柜');
  }
  for (let i = 0; i < 2; i++) {
    if (d.proof[i]) return K(KL.proofSlots[i].cx, KL.proofSlots[i].top - 2, '面团发酵中，可以先开下一团面');
  }
  const needed = waiting.length + d.customers.filter(c => c.state === 'order' || c.state === 'walk').length - pipelineCount(d);
  if (needed > 0 && !d.dough) return K(KL.flour.x + 11, KL.flour.y - 2, '点击面粉袋，开一团新面');
  if (d.oven.some(Boolean)) return K(KL.ovenSlots[d.oven.findIndex(Boolean)].cx, KL.oven.y + 22, '面包在烤：看倒计时，金黄时取出');
  if (EXTRA_KEYS.some(k => d.stock[k] === 0) && d.coins >= 2) return K(KL.market.x + 43, KL.market.y - 2, '配料用完了？点“市场”用小费补货');
  if (d.customers.some(c => c.state === 'walk' || c.state === 'order')) return { view: 'front', wx: null, text: '客人正在进店点单……' };
  return { view: view(), wx: null, text: d.customers.some(c => c.state === 'pending') ? '下一位客人快到了，可以先备一团面' : '今天的客人都招呼过了' };
}

function drawHint() {
  const d = G.day;
  if (d.ended) return;
  const h = computeHint();
  let text = h.text, ax = null, ay = null;
  if (h.view !== view()) {
    text = (h.view === 'kitchen' ? '去后厨：' : '去前厅：') + text;
    ax = h.view === 'kitchen' ? 466 : 14; ay = h.view === 'kitchen' ? 100 : 58;
  } else if (h.wx !== null && h.wx !== undefined) { ax = h.wx - cam.x; ay = h.wy; }
  const w = Math.min(470, textW(text, 8) + 18);
  const x = (W - w) / 2, y = 252;
  fillRR(x, y + 2, w, 14, 7, C.shadow);
  fillRR(x, y, w, 14, 7, 'rgba(255,250,240,.96)', C.ink, 1);
  txt(text, W / 2, y + 7.5, { size: 8, align: 'center' });
  const showArrow = G.tutorial && !d.firstServed && !d.drag;
  if (showArrow && ax !== null) {
    const bob = Math.abs(Math.sin(G.t * 5)) * 4;
    spr('ui_hint_arrow', ax - 8, ay - 20 - bob);
  }
}

function nextTarget(score) { return DAY_CFG.targets.find(t => score < t) || DAY_CFG.targets[DAY_CFG.targets.length - 1]; }
function drawHUD() {
  const d = G.day;
  const x = 240, y = 3, w = 236;
  panel(x, y, w, 15, 'rgba(255,246,228,.95)', 7);
  spr('ui_star_full', x + 3, y - 1, 1);
  txt(`${d.score}`, x + 22, y + 8, { size: 8, bold: true });
  txt(`/${nextTarget(d.score)}`, x + 22 + textW(`${d.score}`, 8, true), y + 8, { size: 7, color: C.inkSoft });
  spr('ui_coin', x + 76, y + 1.5);
  txt(String(d.coins), x + 90, y + 8, { size: 8, bold: true });
  const done = d.customers.filter(c => ['gone', 'leave', 'served', 'angry'].includes(c.state)).length;
  txt(`客人 ${done}/${d.customers.length}`, x + 112, y + 8, { size: 8 });
  button('menu', x + w - 50, y + 1.5, 30, 12, '菜单', () => { G.paused = 'menu'; d.drag = null; }, { color: C.yel, size: 7 });
  button('mute', x + w - 18, y + 1, 15, 13, '', toggleMute, { bare: true,
    draw: (bx, by) => spr(audio.muted ? 'ui_sound_off' : 'ui_sound_on', bx, by) });
  if (G.relaxed) txt('无压力模式', x + 2, y + 23, { size: 7, color: C.inkSoft });
}
function drawViewButtons() {
  const d = G.day;
  if (view() === 'front') {
    const blink = d.alertK > 0 && Math.floor(d.alertK * 3) % 2 === 0;
    button('toK', 456, 104, 20, 26, '', () => setView('kitchen'), {
      color: blink ? '#ffb38a' : C.cream, draw: (bx, by) => { spr('ui_arrow_right', bx + 1, by + 2); } });
    txt('后厨', 466, 138, { size: 7.5, bold: true, align: 'center', outline: C.paper });
    if (d.alertK > 0) txt('!', 470, 102, { size: 10, bold: true, color: C.red, outline: '#fff' });
  } else {
    const blink = d.alertF > 0 && Math.floor(d.alertF * 3) % 2 === 0;
    button('toF', 4, 58, 20, 26, '', () => setView('front'), {
      color: blink ? '#ffb38a' : C.cream, draw: (bx, by) => { spr('ui_arrow_left', bx + 1, by + 2); } });
    txt('前厅', 14, 92, { size: 7.5, bold: true, align: 'center', outline: C.paper });
    if (d.alertF > 0) txt('!', 20, 56, { size: 10, bold: true, color: C.red, outline: '#fff' });
  }
  if (view() !== 'kitchen' || !camSettled() || d.drag) return;
  const m = KL.market;
  button('market', m.x, m.y, m.w, m.h, '市场 · 补货', () => { G.paused = 'market'; }, { wood: true, size: 8, labelDx: 6,
    draw: (bx, by) => spr('ui_coin', bx + 5, by + 4) });
  const bd = d.board;
  if (bd) {
    if (bd.stage === 'roll' && bd.s >= 0.75) button('rollDone', KL.board.x + 62, KL.board.y - 15, 38, 13, '好了 ✓', finishRoll, { color: C.greenL });
    if (bd.stage === 'spread' && bd.cov.filter(Boolean).length >= 8) button('spreadDone', KL.board.x + 62, KL.board.y - 15, 38, 13, '卷起 ✓', finishSpread, { color: C.greenL });
  }
}

function receiptLines(r) {
  const lines = [];
  lines.push(['骨架：面团·肉桂黄油·卷切', '+' + BASE_PTS]);
  lines.push(['工艺', '+' + r.craft, 'craft']);
  r.ing.forEach(x => lines.push([x.name + (x.authentic ? '（瑞典地道）' : ''), '+' + x.pts]));
  r.combos.forEach(x => lines.push(['组合：' + x.name, '+' + x.pts]));
  if (r.heat) lines.push([`火力加成（${r.heatName}）` + (r.heatTag ? '·外皮酥脆' : ''), '+' + r.heat]);
  lines.push(['小计', String(r.sub), 'sub']);
  lines.push(['口味匹配 ' + (r.matched.length ? r.matched.map(t => TAGS[t].name).join('、') : (r.ruined ? '（' + (r.bake === 'burnt' ? '烤焦' : '没熟') + '，不计）' : '无')), '×' + r.mult.toFixed(2)]);
  lines.push(['速度小费', '+' + r.tip]);
  return lines;
}
// 小票：默认收起成左上角小卡片（不挡操作），点击才展开明细
function drawReceipt() {
  const d = G.day, rc = d.receipt;
  if (!rc) return;
  if (view() !== 'front' || !camSettled()) { rc.w = 0; return; }
  const r = rc.r;
  if (!rc.open) {
    const w = 176, h = 30;
    const ease = 1 - Math.pow(1 - clamp(rc.t / 0.3, 0, 1), 3);
    const x = lerp(-w - 6, 6, ease), y = 22;
    rc.x = x; rc.y = y; rc.w = w; rc.h = h;
    ctx.globalAlpha = clamp((rc.life - rc.t) / 0.6, 0, 1);
    panel(x, y, w, h, C.paper, 5);
    ctx.fillStyle = C.red; ctx.fillRect(x + 1.5, y + 3, 2.5, h - 6);
    for (let s = 0; s < 3; s++) spr(s < r.stars ? 'ui_star_full' : 'ui_star_empty', x + 7 + s * 13, y + 2.5, 0.75);
    txt(r.total + ' 分', x + 50, y + 9.5, { size: 9.5, bold: true, color: C.red });
    spr('ui_coin', x + 96, y + 4, 0.8);
    txt('+' + r.coins + ' 小费', x + 107, y + 9.5, { size: 7.5, bold: true });
    if (r.ruined) txt(r.bake === 'burnt' ? '烤焦了，口味不计' : '没烤熟，口味不计', x + 8, y + 22, { size: 7, color: C.red });
    else if (r.matched.length) {
      txt('口味对上', x + 8, y + 22, { size: 7, color: C.inkSoft });
      r.matched.forEach((t, i) => spr(TAGS[t].icon, x + 41 + i * 13, y + 16));
      txt('×' + r.mult.toFixed(2), x + 44 + r.matched.length * 13, y + 22, { size: 7, bold: true });
    } else txt('口味没对上', x + 8, y + 22, { size: 7, color: C.inkSoft });
    txt('点我看明细 ▸', x + w - 7, y + 22, { size: 6.8, bold: true, align: 'right', color: C.blue });
    ctx.globalAlpha = 1;
    return;
  }
  const lines = receiptLines(r);
  const w = 168, lh = 10.5, h = 30 + lines.length * lh + 14;
  const x = 6, y = 22;
  rc.x = x; rc.y = y; rc.w = w; rc.h = h;
  panel(x, y, w, h, C.paper, 3);
  ctx.fillStyle = C.red; ctx.fillRect(x + 1, y + 1, w - 2, 3);
  txt('小票 · 瑞典肉桂卷', x + 8, y + 12, { size: 8.5, bold: true });
  for (let s = 0; s < 3; s++) spr(s < r.stars ? 'ui_star_full' : 'ui_star_empty', x + w - 58 + s * 17, y + 4);
  lines.forEach((l, i) => {
    const yy = y + 28 + i * lh;
    if (l[2] === 'sub') { ctx.fillStyle = 'rgba(74,48,40,.25)'; ctx.fillRect(x + 8, yy - 6, w - 16, 0.6); }
    txt(l[0], x + 8, yy, { size: 7.5, color: C.ink });
    if (l[2] === 'craft') {
      r.craftLines.forEach((c, k) => {
        fillRR(x + 30 + k * 13, yy - 5, 12, 10, 2, GRADE_COL[c.g], C.ink, 0.8);
        txt(c.short, x + 36 + k * 13, yy + 0.5, { size: 6.5, bold: true, align: 'center', color: '#fff' });
      });
    }
    txt(l[1], x + w - 8, yy, { size: 7.5, bold: true, align: 'right' });
  });
  const ty = y + 28 + lines.length * lh + 2;
  ctx.fillStyle = C.ink; ctx.fillRect(x + 8, ty - 5, w - 16, 0.8);
  txt('合计', x + 8, ty + 3, { size: 8.5, bold: true });
  txt(String(r.total), x + w - 8, ty + 3, { size: 10, bold: true, align: 'right', color: C.red });
  txt('点击收起 · 10 秒后自动收起', x + w / 2, y + h - 4, { size: 6, align: 'center', color: C.gray });
}

// ----- 营业中的弹窗：菜单、市场
function dim(a = 0.45) { ctx.fillStyle = `rgba(60,34,20,${a})`; ctx.fillRect(0, 0, W, H); }
function restartDay() { G.paused = false; newDay(); playBgm('bakery_loop'); toast('重新开始本局', 1.4); }
function drawMenu() {
  dim();
  const x = 150, y = 52, w = 180, h = 168;
  woodFrame(x, y, w, h);
  ribbon(240, y - 8, 96, '暂停中');
  const bx = x + 22, bw = w - 44;
  button('resume', bx, y + 22, bw, 22, '继续营业', () => { G.paused = false; }, { wood: true, color: '#5f9e4a', hoverColor: '#6fb258', size: 9 });
  button('restart', bx, y + 52, bw, 22, '重新开始本局', restartDay, { wood: true, size: 9 });
  button('quitMap', bx, y + 82, bw, 22, '返回地图', () => { G.paused = false; goto('map', () => { G.day = null; playBgm('bakery_loop'); }); }, { wood: true, size: 9 });
  button('quitTitle', bx, y + 112, bw, 22, '返回首页', () => { G.paused = false; goto('title', () => { G.day = null; }); }, { wood: true, size: 9 });
  stxt('离开或重开不会保存本局进度', 240, y + h - 15, { size: 7, align: 'center' });
}
function drawMarket() {
  const d = G.day;
  dim();
  const x = 104, y = 40, w = 272, h = 196;
  woodFrame(x, y, w, h);
  ribbon(240, y - 8, 120, '市场 · 补货');
  // 小费余额
  fillRR(x + w - 74, y + 14, 60, 15, 7, '#fff3d6', WOOD.dark, 1);
  spr('ui_coin', x + w - 70, y + 15.5);
  stxt(`${d.coins} 小费`, x + w - 40, y + 22, { size: 8, bold: true, align: 'center' });
  stxt('用今天赚到的小费补配料（营业已暂停）', x + 14, y + 22, { size: 7.5 });
  EXTRA_KEYS.forEach((k, i) => {
    const e = EXTRAS[k], ry = y + 36 + i * 32;
    fillRR(x + 12, ry, w - 24, 28, 3, i % 2 ? 'rgba(243,214,160,.55)' : 'rgba(255,248,232,.7)', 'rgba(90,52,24,.35)', 0.8);
    spr(e.jar, x + 18, ry + 2);
    stxt(e.name, x + 44, ry + 9, { size: 9, bold: true });
    spr(TAGS[e.tag].icon, x + 44 + textW(e.name, 9, true) + 4, ry + 3.5);
    txt(WHERE_TXT[e.where] + ` · 每份 +${e.pts} 分`, x + 44, ry + 20, { size: 6.8, color: WOOD.text });
    if (e.authentic) { fillRR(x + 44 + textW(e.name, 9, true) + 20, ry + 4, 26, 10, 3, '#c8483a'); txt('瑞典地道', x + 44 + textW(e.name, 9, true) + 33, ry + 9.5, { size: 6, bold: true, align: 'center', color: '#fff' }); }
    stxt(`库存 ${d.stock[k]}`, x + 170, ry + 14, { size: 8, bold: true, align: 'center', color: d.stock[k] > 0 ? WOOD.text : C.red });
    const can = d.coins >= e.price;
    button('buy_' + k, x + 196, ry + 5, 62, 18, `买 1 份 · ${e.price}`, () => buy(k), { wood: true, size: 7.5, disabled: !can,
      color: '#5f9e4a', hoverColor: '#6fb258' });
  });
  button('closeMarket', 240 - 40, y + h - 30, 80, 20, '回到厨房', () => { G.paused = false; }, { wood: true, size: 8.5 });
}

function drawFxAndFloats(dt) {
  G.fx = G.fx.filter(f => {
    f.t += dt; f.y += f.vy * dt; f.x += f.vx * dt;
    if (f.t >= f.dur) return false;
    const fi = Math.min(f.n - 1, Math.floor(f.t / f.dur * f.n));
    sprFrame(f.key, fi, f.fw, f.fh, f.x - (G.scene === 'day' || G.scene === 'summary' ? cam.x : 0), f.y);
    return true;
  });
  G.floats = G.floats.filter(f => {
    f.t += dt;
    if (f.t >= f.dur) return false;
    const k = f.t / f.dur;
    const off = G.scene === 'day' ? cam.x : 0;
    txt(f.text, f.x - off, f.y - 14 * Math.sqrt(k), { size: f.size, bold: true, align: 'center', color: f.color, outline: '#fff', ow: 2.6, alpha: k > 0.7 ? (1 - k) / 0.3 : 1 });
    return true;
  });
}
function drawToast(dt) {
  if (!G.toast) return;
  G.toast.t += dt;
  if (G.toast.t > G.toast.dur) { G.toast = null; return; }
  const a = Math.min(1, (G.toast.dur - G.toast.t) / 0.3);
  const w = textW(G.toast.msg, 8.5, true) + 20;
  ctx.globalAlpha = a;
  panel((W - w) / 2, 34, w, 16, '#fff3d6', 8);
  txt(G.toast.msg, W / 2, 42.5, { size: 8.5, bold: true, align: 'center' });
  ctx.globalAlpha = 1;
}

// ============================================================ 场景
const SCENES = {};

SCENES.loading = {
  draw() {
    ctx.fillStyle = '#f6e7c9'; ctx.fillRect(0, 0, W, H);
    txt('正在把面包装进旅行箱……', W / 2, H / 2, { size: 10, align: 'center' });
  },
};

// ---------- 首页
const TITLE = {
  walkers: [{ k: 'astrid', x: 40, dir: 1, sp: 24, t: 0 }, { k: 'oskar', x: 420, dir: -1, sp: 18, t: 0.3 }],
  clouds: [{ x: 20, y: 30, s: 1, v: 4 }, { x: 200, y: 18, s: 0.7, v: 6 }, { x: 330, y: 44, s: 1.2, v: 3 }, { x: 440, y: 26, s: 0.8, v: 5 }],
  birds: [{ x: -20, y: 70, v: 22, ph: 0 }, { x: -50, y: 78, v: 22, ph: 1.4 }],
};
function drawCloud(x, y, s) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, 18 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 9 * s, y - 1, 9 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 3 * s, y - 5 * s, 10 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e6f2fa'; ctx.fillRect(x - 16 * s, y + 3 * s, 32 * s, 2 * s);
}
SCENES.title = {
  howto: false,
  update(dt) {
    TITLE.walkers.forEach(w => {
      w.t += dt; w.x += w.dir * w.sp * dt;
      if (w.x > 455) w.dir = -1;
      if (w.x < 10) w.dir = 1;
    });
    TITLE.clouds.forEach(c => { c.x += c.v * dt; if (c.x > W + 40) c.x = -40; });
    TITLE.birds.forEach(b => { b.x += b.v * dt; if (b.x > W + 30) { b.x = -30 - Math.random() * 80; b.y = 60 + Math.random() * 30; } });
    if (Math.random() < dt * 2.6) fx('fx_steam', 297 + Math.random() * 6, 60, { vy: -12, dur: 1.4 });
  },
  draw() {
    spr('bg_title', 0, 0);
    TITLE.clouds.forEach(c => drawCloud(c.x, c.y, c.s));
    // 烟囱
    fillRR(296, 76, 13, 18, 1, '#7a5a4e', C.ink, 1);
    ctx.fillStyle = '#5c4038'; ctx.fillRect(294, 74, 17, 4);
    TITLE.birds.forEach(b => {
      const f = Math.sin(G.t * 10 + b.ph) * 2;
      ctx.strokeStyle = '#4a3a3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x - 4, b.y - f); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + 4, b.y - f); ctx.stroke();
    });
    // 店招：瑞典语“面包店”
    txt('BAGERI', 240, 93.5, { size: 10.5, bold: true, align: 'center', color: C.red });
    // 行人
    TITLE.walkers.forEach(w => sprFrame('char_customer_' + w.k, Math.floor(w.t * 8) % 4, 28, 44, w.x - 14, 188, 1, w.dir < 0));
    // 悬挂的木招牌 Logo
    const sw = Math.sin(G.t * 1.3) * 0.012;
    ctx.save(); ctx.translate(240, 0); ctx.rotate(sw); ctx.translate(-240, 0);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(156, 0, 2, 16); ctx.fillRect(322, 0, 2, 16);
    woodPlank(124, 12, 232, 46);
    spr('food_knot_baked', 136, 22, 2.2);
    spr('food_overlay_pearl', 136, 22, 2.2);
    spr('food_knot_baked', 313, 22, 2.2);
    spr('food_overlay_gloss', 313, 22, 2.2);
    txt('旅行烘焙箱', 241.5, 37, { size: 23, bold: true, align: 'center', color: '#7a4320' });
    txt('旅行烘焙箱', 240, 35, { size: 23, bold: true, align: 'center', color: '#fff1d6', outline: WOOD.dark, ow: 4 });
    ctx.restore();
    ribbon(240, 54, 118, '瑞典篇 · Sverige');
    if (this.howto) { this.drawHowto(); return; }
    // 按钮
    const pulse = 1 + 0.03 * Math.sin(G.t * 4);
    ctx.save(); ctx.translate(240, 238); ctx.scale(pulse, pulse); ctx.translate(-240, -238);
    button('start', 182, 225, 116, 26, '开始旅行', () => goto('map'), { wood: true, size: 11, color: '#d0742f', hoverColor: '#e2853c' });
    ctx.restore();
    button('howto', 14, 212, 88, 18, '怎么玩', () => { this.howto = true; }, { wood: true, size: 8.5 });
    button('relax', 14, 236, 88, 18, G.relaxed ? '无压力：开' : '无压力：关', () => { G.relaxed = !G.relaxed; },
      { wood: true, size: 8.5, color: G.relaxed ? '#5f9e4a' : '#c47a3c', hoverColor: G.relaxed ? '#6fb258' : '#d68c4c' });
    button('mute', 446, 236, 22, 18, '', toggleMute, { wood: true, draw: (bx, by) => spr(audio.muted ? 'ui_sound_off' : 'ui_sound_on', bx + 3, by + 2) });
    if (SAVE.days) {
      fillRR(330, 238, 108, 14, 7, 'rgba(255,243,214,.95)', WOOD.dark, 1);
      stxt(`最高分 ${SAVE.best} · 印章 ${SAVE.stamps}/3`, 384, 245, { size: 7, bold: true, align: 'center' });
    }
  },
  drawHowto() {
    dim(0.4);
    const x = 70, y = 34, w = 340, h = 214;
    woodFrame(x, y, w, h);
    ribbon(240, y - 8, 90, '怎么玩');
    const rows = [
      ['char_face_astrid', '客人进店，头顶气泡里是想要的 2 种口味'],
      ['food_dough_smooth', '后厨：揉面 → 发酵 → 擀面 → 抹（肉桂黄油）馅 → 切条 → 烘烤'],
      ['ing_jar_cardamom', '配料对上客人口味：分数 ×1.25，两种都对上 ×1.5'],
      ['station_oven_on', '火力随时可调：低火慢、好掌握；高火快、窗口短，+5 且外皮酥脆'],
      ['station_bin', '做坏了扔进垃圾桶；整形台被占时，先放到暂存架'],
      ['ui_coin', '小费可以在后厨的“市场”里补配料'],
      ['ui_cursor_hand', '操作：按住、拖动；Tab 切换前厅后厨；Esc 打开菜单'],
    ];
    rows.forEach((r, i) => {
      const ry = y + 22 + i * 23;
      fillRR(x + 14, ry, 20, 20, 4, '#fff3d6', 'rgba(90,52,24,.4)', 0.8);
      const im = IMG[r[0]];
      if (im) { const s = Math.min(16 / im.width, 16 / im.height); spr(r[0], x + 24 - im.width * s / 2, ry + 10 - im.height * s / 2, s); }
      stxt(r[1], x + 42, ry + 10, { size: 8 });
    });
    button('closeHow', 240 - 44, y + h - 30, 88, 20, '明白了', () => { this.howto = false; }, { wood: true, size: 9 });
  },
};

// ---------- 地图
const MAP_NODES = [
  { k: 'home', name: '我的树屋', x: 60, y: 200 },
  { k: 'sweden', name: '瑞典 · 肉桂卷', x: 230, y: 66, open: true },
  { k: 'france', name: '法国 · 可颂', x: 110, y: 86 },
  { k: 'portugal', name: '葡萄牙 · 蛋挞', x: 150, y: 186 },
  { k: 'italy', name: '意大利 · 康图奇', x: 300, y: 186 },
  { k: 'japan', name: '日本 · 菠萝包', x: 360, y: 98 },
  { k: 'mexico', name: '墨西哥 · 贝壳面包', x: 420, y: 200 },
  { k: 'china', name: '中国 · 蛋黄酥', x: 236, y: 140 },
];
SCENES.map = {
  card: false,
  draw() {
    spr('bg_map', 0, 0);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(120,80,60,.55)'; ctx.lineWidth = 1;
    const home = MAP_NODES[0];
    MAP_NODES.slice(1).forEach(n => { ctx.beginPath(); ctx.moveTo(home.x, home.y - 10); ctx.quadraticCurveTo((home.x + n.x) / 2, Math.min(home.y, n.y) - 40, n.x, n.y); ctx.stroke(); });
    ctx.setLineDash([]);
    MAP_NODES.forEach(n => {
      const hover = ptr.inside && Math.hypot(ptr.x - n.x, ptr.y - n.y) < 14 && !this.card;
      if (n.k === 'home') {
        ctx.fillStyle = '#8a5a3a'; ctx.fillRect(n.x - 2, n.y - 12, 5, 14);
        ctx.fillStyle = '#6aa056'; ctx.beginPath(); ctx.arc(n.x, n.y - 16, 11, 0, Math.PI * 2); ctx.fill();
        fillRR(n.x - 8, n.y - 22, 16, 10, 1, '#e8b070', C.ink, 1);
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(n.x - 10, n.y - 22); ctx.lineTo(n.x, n.y - 29); ctx.lineTo(n.x + 10, n.y - 22); ctx.fill();
        spr('ui_balloon', n.x + 10, n.y - 52 + Math.sin(G.t * 2) * 2);
      } else {
        const s = n.open ? 0.5 + (hover ? 0.06 : 0.03 * Math.sin(G.t * 4)) : 0.42;
        const sz = 44 * s;
        spr(n.open ? 'ui_stamp_sweden' : 'ui_stamp_locked', n.x - sz / 2, n.y - sz / 2, s);
        if (n.open && SAVE.stamps) for (let i = 0; i < 3; i++) spr(i < SAVE.stamps ? 'ui_star_full' : 'ui_star_empty', n.x - 22 + i * 15, n.y - 26, 0.8);
      }
      const lw = textW(n.name, 7.5, true) + 10;
      fillRR(n.x - lw / 2, n.y + 13, lw, 12, 6, n.open || n.k === 'home' ? C.paper : 'rgba(255,250,240,.75)', C.ink, 1);
      txt(n.name, n.x, n.y + 19.5, { size: 7.5, bold: true, align: 'center', color: n.open || n.k === 'home' ? C.ink : C.gray });
    });
    woodPlank(8, 8, 164, 30);
    txt('旅行手账地图', 18, 18.5, { size: 9.5, bold: true, color: '#fff1d6', outline: WOOD.dark, ow: 2.6 });
    txt('点击瑞典开始营业；其他国家即将开放', 18, 30, { size: 6.5, color: '#fff1d6', outline: WOOD.dark, ow: 2 });
    if (this.card) { buttons = []; this.drawCard(); return; }
    button('back', 406, 240, 64, 20, '返回首页', () => goto('title'), { wood: true, size: 8 });
  },
  drawCard() {
    dim(0.42);
    const x = 64, y = 24, w = 352, h = 226;
    woodFrame(x, y, w, h);
    ribbon(240, y - 10, 176, '');
    sweFlag(240 - 70, y - 5);
    txt('瑞典 · Sverige', 248, y - 1, { size: 10, bold: true, align: 'center', color: '#fff6e4', outline: '#6e221a', ow: 2.6 });
    // 左：插画框
    const ix = x + 14, iy = y + 16, iw = 128, ih = 96;
    fillRR(ix, iy, iw, ih, 3, '#cfe6ef', WOOD.dark, 1.2);
    ctx.fillStyle = '#e6f2f6'; ctx.fillRect(ix + 2, iy + 2, iw - 4, 30);
    for (let i = 0; i < 7; i++) {                    // 蓝黄小旗
      const fx_ = ix + 8 + i * 17, c = i % 2 ? C.yel : C.blue;
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(fx_, iy + 6); ctx.lineTo(fx_ + 12, iy + 6); ctx.lineTo(fx_ + 6, iy + 15); ctx.fill();
    }
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(ix + 4, iy + 6); ctx.lineTo(ix + iw - 4, iy + 6); ctx.stroke();
    ctx.fillStyle = '#c98a4e'; ctx.fillRect(ix + 2, iy + ih - 22, iw - 4, 20);   // 木桌
    ctx.fillStyle = '#b07440'; ctx.fillRect(ix + 2, iy + ih - 22, iw - 4, 2);
    const pcx = ix + 56, pby = iy + ih - 14;
    ctx.save(); ctx.translate(pcx, pby); ctx.scale(2, 2); ctx.translate(-pcx, -pby);
    drawPlate(pcx, pby, { bake: 'golden', extras: ['pearl', 'honey'], grades: {} }, false);
    ctx.restore();
    // 咖啡杯（fika）
    const cx_ = ix + 106, cy_ = iy + ih - 34;
    fillRR(cx_ - 8, cy_, 16, 14, 2, '#ffffff', C.ink, 1);
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(cx_ - 6, cy_ + 2, 12, 3);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx_ + 9, cy_ + 7, 3, -1.2, 1.2); ctx.stroke();
    fillRR(cx_ - 11, cy_ + 13, 22, 3, 1, '#ffffff', C.ink, 0.8);
    const st = Math.floor(G.t * 6) % 4;                          // 热气
    sprFrame('fx_steam', st, 12, 16, pcx - 26, pby - 52, 1, false, 0.9);
    sprFrame('fx_steam', (st + 2) % 4, 12, 16, pcx + 10, pby - 54, 1, false, 0.9);
    sprFrame('fx_steam', (st + 1) % 4, 12, 16, cx_ - 6, cy_ - 16, 1, false, 0.8);
    stxt('肉桂卷 · Kanelbulle', ix + iw / 2, iy + ih + 12, { size: 10, bold: true, align: 'center' });
    stxt('瑞典咖啡时光 fika 的主角', ix + iw / 2, iy + ih + 25, { size: 7.5, align: 'center' });
    // 今日客人
    ['astrid', 'lars', 'elena', 'yuki', 'oskar'].forEach((k, i) => spr('char_face_' + k, ix + 4 + i * 19, iy + ih + 34, 0.8));
    stxt('等 6 位', ix + 102, iy + ih + 43, { size: 7.5, bold: true });
    // 右：信息
    const rx = x + 156, rw = w - 170;
    const head = (t, yy) => { stxt(t, rx, yy, { size: 8.5, bold: true }); ctx.fillStyle = 'rgba(90,52,24,.35)'; ctx.fillRect(rx, yy + 6, rw, 0.8); };
    head('今日工序', y + 18);
    STEPS.forEach(([k, name, short], i) => {
      const cx = rx + i * 26;
      fillRR(cx, y + 28, 22, 15, 3, ['#f6c26a', '#a8d48a', '#f0b07a', '#d79a6a', '#e8c08a', '#f29a5a', '#f6de7a'][i], WOOD.dark, 1);
      txt(short, cx + 11, y + 36, { size: 8.5, bold: true, align: 'center', color: WOOD.text });
      if (i < STEPS.length - 1) { ctx.fillStyle = WOOD.dark; ctx.beginPath(); ctx.moveTo(cx + 23, y + 33); ctx.lineTo(cx + 25.5, y + 35.5); ctx.lineTo(cx + 23, y + 38); ctx.fill(); }
    });
    stxt('全部用鼠标按住、拖动完成', rx, y + 51, { size: 7 });
    head('当地风味', y + 66);
    EXTRA_KEYS.forEach((k, i) => {
      const e = EXTRAS[k], jx = rx + 6 + i * 46;
      spr(e.jar, jx, y + 76);
      spr(TAGS[e.tag].icon, jx + 21, y + 89);
      if (e.authentic) { fillRR(jx + 12, y + 72, 22, 9, 3, '#c8483a', '#5e1d16', 0.8); txt('地道', jx + 23, y + 76.8, { size: 6, bold: true, align: 'center', color: '#fff' }); }
      stxt(e.name, jx + 10, y + 108, { size: 7.5, bold: true, align: 'center' });
    });
    head('印章目标', y + 124);
    DAY_CFG.targets.forEach((t, i) => {
      const sx = rx + 2 + i * 60;
      spr(i < SAVE.stamps ? 'ui_stamp_sweden' : 'ui_stamp_locked', sx, y + 132, 0.62);
      stxt(t + ' 分', sx + 31, y + 146, { size: 8, bold: true });
    });
    // 小知识
    fillRR(x + 14, y + 168, w - 28, 22, 3, '#fff6dc', 'rgba(90,52,24,.45)', 0.8);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x + 22, y + 179, 2.6, 0, Math.PI * 2); ctx.fill();
    stxt('小知识：瑞典把每年 10 月 4 日定为“肉桂卷日”；肉桂卷常配着 fika（咖啡时光）一起享用。', x + 30, y + 179.5, { size: 7 });
    button('cancel', x + 14, y + h - 32, 70, 22, '返回', () => { this.card = false; }, { wood: true, size: 9 });
    button('go', x + w - 112, y + h - 32, 98, 22, '出发！', () => { this.card = false; startTravel(); },
      { wood: true, size: 10, color: '#d0742f', hoverColor: '#e2853c' });
    if (SAVE.best) stxt(`最高分 ${SAVE.best}`, 240, y + h - 21, { size: 7.5, align: 'center' });
  },
  down(x, y) {
    if (this.card) return;
    const n = MAP_NODES.find(n => Math.hypot(x - n.x, y - n.y) < 16);
    if (!n) return;
    if (n.open) { this.card = true; sfx('pop', 0.4); }
    else if (n.k === 'home') toast('树屋基地还在建造中（后续版本）');
    else toast(n.name.split(' · ')[0] + '：还在准备食谱，敬请期待');
  },
};

function startTravel() {
  G.travel = { t: 0, dur: 2.4 };
  G.scene = 'travel';
  sfx('whoosh', 0.4);
}
SCENES.travel = {
  update(dt) {
    G.travel.t += dt;
    if (G.travel.t >= G.travel.dur) this.arrive();
  },
  arrive() {
    if (G.scene !== 'travel') return;
    sfx('stamp', 0.5);
    G.scene = 'travelEnd';
    goto('day', () => { newDay(); playBgm('bakery_loop'); toast('营业开始！第一位客人马上到', 2.2); });
  },
  draw() {
    spr('bg_map', 0, 0);
    const a = MAP_NODES[0], b = MAP_NODES[1];
    const t = clamp(G.travel.t / G.travel.dur, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 50;
    const q = (p0, p1, p2, u) => (1 - u) * (1 - u) * p0 + 2 * (1 - u) * u * p1 + u * u * p2;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let u = 0; u <= e; u += 0.02) { const px = q(a.x, cx, b.x, u), py = q(a.y - 30, cy, b.y - 20, u); if (u === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke(); ctx.setLineDash([]);
    const px = q(a.x, cx, b.x, e), py = q(a.y - 30, cy, b.y - 20, e);
    spr('ui_stamp_sweden', b.x - 11, b.y - 11, 0.5);
    spr('ui_balloon', px - 13, py - 30 + Math.sin(G.t * 6) * 1.5);
    woodPlank(140, 234, 200, 24);
    txt('乘热气球前往瑞典……（点击跳过）', 240, 246.5, { size: 8.5, bold: true, align: 'center', color: '#fff1d6', outline: WOOD.dark, ow: 2.6 });
  },
  down() { this.arrive(); },
};
SCENES.travelEnd = { draw() { SCENES.travel.draw(); } };

SCENES.day = {
  update(dt) {
    cam.x = Math.abs(cam.target - cam.x) < 1 ? cam.target : lerp(cam.x, cam.target, 1 - Math.pow(0.0005, dt));
    if (!G.paused) updateDay(dt);
  },
  draw(dt) {
    if (!G.day) return;
    ctx.save();
    ctx.translate(-Math.round(cam.x), 0);
    if (cam.x < W) drawFront();
    if (cam.x > 0) drawKitchen();
    ctx.restore();
    drawFxAndFloats(G.paused ? 0 : dt);
    drawHint();
    drawReceipt();
    drawHUD();
    drawViewButtons();
    if (G.paused) {
      buttons = [];                       // 弹窗打开时，底下的按钮不可点
      if (G.paused === 'market') drawMarket(); else drawMenu();
    }
  },
  down: dayDown, move: dayMove, up: dayUp,
  key(e) {
    if (e.key === 'Tab' || e.key === ' ') { e.preventDefault(); if (!G.paused) setView(view() === 'front' ? 'kitchen' : 'front'); }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { G.paused = G.paused ? false : 'menu'; if (G.day) G.day.drag = null; }
  },
};

SCENES.summary = {
  update(dt) {
    const s = G.summary;
    s.t += dt;
    if (!s.stamped && s.stamps > 0 && s.t > 1.4) { s.stamped = true; sfx('stamp', 0.6); }
  },
  draw() {
    const d = G.day, s = G.summary;
    if (d) {
      ctx.save(); ctx.translate(-Math.round(cam.x), 0);
      if (cam.x < W) drawFront();
      if (cam.x > 0) drawKitchen();
      ctx.restore();
    }
    dim(0.45);
    const x = 108, y = 30, w = 264, h = 214;
    const k = clamp(s.t / 0.35, 0, 1);
    ctx.save(); ctx.translate(240, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-240, -(y + h / 2));
    woodFrame(x, y, w, h);
    ribbon(240, y - 10, 170, `营业结束 · 第 ${G.dayNo} 天`);
    const rows = [
      ['服务客人', `${s.served} / ${DAY_CFG.arrivals.length}` + (s.left ? `（${s.left} 位等太久离开）` : '')],
      ['今日得分', String(s.score)],
      ['印章目标', DAY_CFG.targets.join(' / ')],
      ['小费', `赚 ${s.coins + s.spent} · 市场花 ${s.spent}`],
      ['扔掉', `${s.discarded} 份`],
    ];
    rows.forEach((r, i) => {
      stxt(r[0], x + 18, y + 24 + i * 15, { size: 8.5 });
      stxt(r[1], x + 80, y + 24 + i * 15, { size: 8.5, bold: true, color: i === 1 ? '#b8392c' : WOOD.text });
    });
    for (let i = 0; i < 3; i++) spr(i < s.stamps ? 'ui_star_full' : 'ui_star_empty', x + 18 + i * 22, y + 104, 1.2);
    const msg = s.stamps === 3 ? '大师级面包师！' : s.stamps === 2 ? '客人们赞不绝口' : s.stamps === 1 ? '开张大吉，拿到第一枚印章' : '还差一点，明天再来';
    stxt(msg, x + 92, y + 114, { size: 9, bold: true });
    if (s.stamps > 0) {
      const sp = clamp((s.t - 1.1) / 0.3, 0, 1);
      if (sp > 0) {
        const sc = lerp(2.2, 1, sp);
        ctx.globalAlpha = sp;
        ctx.save(); ctx.translate(x + w - 44, y + 60); ctx.rotate(-0.25); ctx.scale(sc, sc);
        spr('ui_stamp_sweden', -22, -22); ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    fillRR(x + 14, y + 134, w - 28, 26, 3, '#fff6dc', 'rgba(90,52,24,.45)', 0.8);
    stxt('小知识：瑞典的肉桂卷常在面团里加豆蔻，', x + 22, y + 142, { size: 7.2 });
    stxt('烤前刷蛋液、撒珍珠糖。', x + 22, y + 153, { size: 7.2 });
    ctx.restore();
    if (k >= 1) {
      button('again', x + 14, y + h - 40, 112, 24, '再营业一天', () => { G.dayNo++; goto('day', () => { newDay(); playBgm('bakery_loop'); }); }, { wood: true, size: 9, color: '#d0742f', hoverColor: '#e2853c' });
      button('toMap', x + w - 126, y + h - 40, 112, 24, '返回地图', () => { goto('map', () => { G.day = null; playBgm('bakery_loop'); }); }, { wood: true, size: 9 });
    }
  },
};

// ============================================================ 主循环
let last = performance.now(), rafAlive = false;
function frame(now) {
  rafAlive = true;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try { step(dt); } catch (e) { window.__err = e.message + ' ' + (e.stack || '').split('\n')[1]; console.error(e); }
  requestAnimationFrame(frame);
}
// 兜底：某些内嵌/离屏浏览器不触发 requestAnimationFrame，改用定时器驱动
function startLoop() {
  requestAnimationFrame(frame);
  setTimeout(() => {
    if (rafAlive) return;
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { step(dt); } catch (e) { window.__err = e.message + ' ' + (e.stack || '').split('\n')[1]; }
    }, 1000 / 30);
  }, 300);
}
function step(dt) {
  G.t += dt;
  const sc = SCENES[G.scene];
  if (sc && sc.update && !G.fadeTo) sc.update(dt);
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  buttons = [];
  if (sc && sc.draw) sc.draw(dt);
  if (G.scene !== 'day') drawFxAndFloats(dt);
  drawToast(dt);
  if (G.fadeTo) {
    G.fade = Math.min(1, G.fade + dt * 4);
    if (G.fade >= 1) {
      const f = G.fadeTo; G.fadeTo = null;
      G.scene = f.scene;
      if (f.init) f.init();
    }
  } else G.fade = Math.max(0, G.fade - dt * 4);
  if (G.fade > 0) { ctx.fillStyle = `rgba(255,246,228,${G.fade})`; ctx.fillRect(0, 0, W, H); }
  // 像素鼠标指针：所有场景统一在最上层绘制（系统指针已隐藏）
  if (G.scene !== 'loading') {
    if (G.scene === 'day' && G.day) drawCursorTool();
    else if (ptr.inside) {
      const hb = hitButton(ptr.x, ptr.y);
      spr(ptr.down ? 'ui_cursor_grab' : 'ui_cursor_hand', ptr.x - 6, ptr.y - 2, hb && !hb.disabled ? 0.62 : 0.55);
    }
  }
  if (G.testOverlay) G.testOverlay();
}

// ============================================================ 启动
loadImages().then(() => {
  // 指针素材加载成功才隐藏系统鼠标，否则保留系统鼠标，避免看不见
  canvas.style.cursor = (IMG.ui_cursor_hand && IMG.ui_cursor_grab) ? 'none' : 'pointer';
  const el = document.getElementById('loading');
  if (el) el.remove();
  G.scene = 'title';
  audio.bgmName = 'bakery_loop';
  const shot = QS.get('shot');
  if (shot) setupShot(shot);
  if (QS.get('autotest')) runAutotest();
  startLoop();
});

// ============================================================ 截图与自动测试（开发用：?shot=kitchen / ?autotest=1）
function setupShot(name) {
  G.noSave = true;
  if (name === 'title') return;
  if (name === 'howto') { SCENES.title.howto = true; return; }
  if (name === 'map') { G.scene = 'map'; return; }
  if (name === 'card') { G.scene = 'map'; SCENES.map.card = true; return; }
  newDay(); G.scene = 'day';
  const d = G.day;
  for (let i = 0; i < 80; i++) updateDay(0.1);       // 前两位客人进店
  if (name === 'kitchen' || name === 'market' || name === 'menu') {
    cam.x = cam.target = KX;
    d.coins = 9;
    d.dough = { stage: 'raw', knead: 62, kneading: false, b: newBatch() };
    d.dough.b.extras = ['cardamom'];
    d.proof[0] = { d: { b: newBatch() }, t: 10, ready: true };
    const b1 = newBatch();
    d.board = { b: b1, stage: 'cut', s: 1, cuts: [238], cov: [] };
    d.hold[0] = { type: 'proof', data: { d: { b: newBatch() }, t: 9.5, ready: true } };
    d.temp = 'high';
    d.oven[0] = newOvenItem(newBatch()); d.oven[0].u = 15.2; d.oven[0].uBy.high = 15.2; d.oven[0].dinged = true;
    d.oven[1] = newOvenItem(newBatch()); d.oven[1].u = 6; d.oven[1].uBy.high = 6;
    const b2 = newBatch(); b2.bake = 'golden'; b2.extras = ['pearl', 'honey'];
    d.plate = { b: b2, stage: 'top' };
    d.stock.orange = 0;
    if (name === 'market') G.paused = 'market';
    if (name === 'menu') G.paused = 'menu';
  }
  if (name === 'drag') {
    cam.x = cam.target = KX;
    d.proof[0] = { d: { b: newBatch() }, t: 10, ready: true };
    d.board = { b: newBatch(), stage: 'spread', s: 1, cov: new Array(24).fill(false).map((_, i) => i < 10), cuts: [] };
    d.drag = { type: 'proof', data: { d: { b: newBatch() }, t: 11, ready: true }, src: { k: 'proof', i: 1 } };
    ptr.inside = true; ptr.x = 250; ptr.y = 96;
  }
  if (name === 'serve') {
    const mk = (ex, bake = 'golden', ht = null) => { const b = newBatch(); b.bake = bake; b.extras = ex; b.heatTag = ht; return b; };
    d.counter[0] = mk(['cardamom', 'orange']);
    d.counter[1] = mk(['pearl', 'honey']);
    d.counter[2] = mk(['orange', 'honey'], 'golden', 'crunch');
    d.drag = { type: 'counter', data: mk(['cardamom', 'orange', 'pearl']), src: { k: 'counter', i: 0 } };
    ptr.inside = true; ptr.x = 330; ptr.y = 150;
  }
  if (name === 'buns') {
    cam.x = cam.target = KX;
    const mk = (ex) => { const b = newBatch(); b.bake = 'golden'; b.extras = ex; return b; };
    d.plate = { b: mk(['cardamom', 'orange', 'honey']), stage: 'top' };
    d.hold[0] = { type: 'plate', data: { b: mk(['pearl']), stage: 'top' } };
    d.hold[1] = { type: 'plate', data: { b: mk([]), stage: 'top' } };
    d.dough = { stage: 'smooth', knead: 80, kneading: false, b: mk(['cardamom', 'orange']) };
    d.proof[0] = { d: { b: mk(['orange']) }, t: 10, ready: true };
    d.board = { b: mk(['pearl']), stage: 'tray', s: 1, cuts: [], cov: [] };
    d.oven[0] = newOvenItem(mk(['cardamom', 'pearl'])); d.oven[0].u = 15;
  }
  if (name === 'front' || name === 'receipt' || name === 'receiptOpen') {
    const b = newBatch(); b.bake = 'golden'; b.extras = ['cardamom', 'orange', 'pearl']; b.heatBonus = 5; b.heatName = '高火'; b.heatTag = 'crunch';
    STEPS.forEach(([k], i) => { b.grades[k] = i % 3 === 2 ? 'G' : 'P'; });
    d.counter[0] = b;
    const b2 = newBatch(); b2.bake = 'burnt'; d.counter[1] = b2;
    if (name !== 'front') {
      const c = d.customers.find(x => x.state === 'wait');
      serve(c, b);
      d.receipt.t = 3;
      if (name === 'receiptOpen') d.receipt.open = true;
      d.counter[0] = b;
    }
  }
  if (name === 'summary') {
    d.score = 470; d.served = 5; d.left = 1; d.coins = 26; d.spent = 5; d.discarded = 1;
    G.summary = { score: 470, served: 5, left: 1, coins: 26, spent: 5, discarded: 1, stamps: 2, newStamp: true, t: 3, stamped: true };
    G.scene = 'summary';
  }
}

function runAutotest() {
  G.noSave = true;
  const log = [];
  const ok = (cond, msg) => { log.push((cond ? '通过 ' : '失败 ') + msg); };
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) { G.t += 0.05; if (G.scene === 'day') SCENES.day.update(0.05); else if (G.scene === 'summary') SCENES.summary.update(0.05); } };
  const drawOnce = () => { buttons = []; ctx.setTransform(SC, 0, 0, SC, 0, 0); SCENES[G.scene].draw(0); };
  const K = (x) => x - (cam.x - KX);                       // 后厨局部 → 屏幕
  const down = (x, y) => { ptr.x = x; ptr.y = y; ptr.down = true; ptr.moved = 0; dayDown(x, y); };
  const move = (x, y) => { const dx = x - ptr.x, dy = y - ptr.y; ptr.x = x; ptr.y = y; ptr.moved += Math.abs(dx) + Math.abs(dy); dayMove(x, y, dx, dy); };
  const up = (x, y) => { ptr.x = x; ptr.y = y; ptr.down = false; dayUp(x, y); };
  const dragTo = (x0, y0, x1, y1) => { down(x0, y0); for (let i = 1; i <= 8; i++) move(lerp(x0, x1, i / 8), lerp(y0, y1, i / 8)); up(x1, y1); };
  const click = (id) => { drawOnce(); const b = buttons.find(b => b.id === id); if (b && !b.disabled) b.onClick(); return !!b; };
  const HOLD = (i) => [K(KL.hold.slots[i]), 92];
  const BIN = () => [K(KL.bin.x + 13), KL.bin.y + 14];
  try {
    newDay(); G.scene = 'day';
    const d = G.day;
    tick(9);
    const c0 = d.customers[0];
    ok(c0.state === 'wait', '第一位客人走到柜台并点单（状态 ' + c0.state + '）');
    setView('kitchen'); tick(1.5);
    ok(cam.x === KX, '镜头切到后厨');
    down(K(KL.flour.x + 10), KL.flour.y + 10); up(K(KL.flour.x + 10), KL.flour.y + 10);
    ok(d.dough && d.dough.stage === 'raw', '点面粉袋生成面团');
    // 垃圾桶：生面团拖进去
    dragTo(K(KL.dough.cx), KL.dough.by - 8, ...BIN());
    ok(!d.dough && d.discarded === 1, '按住生面团拖动 → 扔进垃圾桶（面团清空，扔掉 1 份）');
    down(K(KL.flour.x + 10), KL.flour.y + 10); up(K(KL.flour.x + 10), KL.flour.y + 10);
    dragTo(K(KL.jars.cardamom.x + 10), KL.jars.cardamom.y + 10, K(KL.dough.cx), KL.dough.by - 8);
    dragTo(K(KL.jars.orange.x + 10), KL.jars.orange.y + 10, K(KL.dough.cx), KL.dough.by - 8);
    ok(d.dough.b.extras.join() === 'cardamom,orange' && d.stock.cardamom === 3, '豆蔻、橙皮拖入面团并扣库存');
    dragTo(K(KL.jars.pearl.x + 10), KL.jars.pearl.y + 10, K(KL.dough.cx), KL.dough.by - 8);
    ok(d.dough.b.extras.length === 2 && d.stock.pearl === 4, '珍珠糖不能揉进面团（被拒绝，不扣库存）');
    down(K(KL.dough.cx), KL.dough.by - 8); tick(1.3); up(K(KL.dough.cx), KL.dough.by - 8);
    ok(d.dough.stage === 'smooth' && d.dough.b.grades.knead === 'P', '揉面按住 1.3 秒松手 → 完美（' + d.dough.b.grades.knead + '）');
    dragTo(K(KL.dough.cx), KL.dough.by - 8, K(157), 130);
    ok(d.proof[0] && !d.dough, '面团放进发酵柜');
    tick(10);
    // 暂存架：发酵好的面团放上去不再计时
    dragTo(K(157), 130, ...HOLD(0));
    ok(d.hold[0] && d.hold[0].type === 'proof' && !d.proof[0], '发酵好的面团拖到暂存架');
    const tHeld = d.hold[0].data.t;
    tick(8);
    ok(Math.abs(d.hold[0].data.t - tHeld) < 1e-6, `暂存架上 8 秒不再发酵（t 保持 ${tHeld.toFixed(1)}）`);
    // 整形台被占时：拿起 → 暂存，再放面团
    d.board = { b: newBatch(), stage: 'cut', s: 1, cuts: [], anim: 0 };
    dragTo(...HOLD(0), K(KL.board.cx), KL.board.cy);
    ok(d.hold[0] && d.board.stage === 'cut', '整形台被占：面团放不上去，自动退回暂存架');
    dragTo(K(KL.grab.x + 10), KL.grab.y + 6, ...HOLD(1));
    ok(!d.board && d.hold[1] && d.hold[1].type === 'board', '点“拿起”把整形台上的半成品放到暂存架');
    dragTo(...HOLD(0), K(KL.board.cx), KL.board.cy);
    ok(d.board && d.board.b.grades.proof === 'P', '暂存的面团拖到整形台 → 发酵评级完美（' + (d.board && d.board.b.grades.proof) + '）');
    down(K(220), 150);
    let x = 220, dir = 1;
    while (d.board.s < 0.99) { x += dir * 8; if (x > 290 || x < 210) dir = -dir; move(K(x), 150); }
    up(K(x), 150);
    ok(click('rollDone') && d.board.stage === 'spread' && d.board.b.grades.roll === 'P', '擀到虚线大小点“好了” → 完美（s=' + d.board.s.toFixed(2) + '）');
    down(K(206), 138);
    for (let row = 0; row < 3; row++) { const yy = 140 + row * 10; for (let xx = 206; xx <= 294; xx += 4) move(K(xx), yy); }
    up(K(294), 160);
    ok(d.board.stage === 'rollup' && d.board.b.grades.spread === 'P', '抹满肉桂黄油自动卷起 → 完美');
    tick(0.6);
    const third = (LOG.x1 - LOG.x0) / 3;
    dragTo(K(LOG.x0 + third), LOG.y - 12, K(LOG.x0 + third), LOG.y + 12);
    dragTo(K(LOG.x0 + 2 * third + 1), LOG.y - 12, K(LOG.x0 + 2 * third + 1), LOG.y + 12);
    ok(d.board.b.grades.cut === 'P', '两刀切成三等份 → 完美（' + d.board.b.grades.cut + '）');
    tick(0.9);
    ok(d.board.stage === 'tray', '扭结成型，放上烤盘');
    dragTo(K(KL.jars.pearl.x + 10), KL.jars.pearl.y + 10, K(KL.board.cx), KL.board.cy);
    ok(d.board.b.extras.includes('pearl') && d.stock.pearl === 3, '进烤箱前把珍珠糖撒在烤盘上');
    down(K(KL.knobs[1].x), KL.knobs[1].y); up(K(KL.knobs[1].x), KL.knobs[1].y);
    dragTo(K(KL.board.cx), KL.board.cy, K(350), 135);
    ok(d.oven[0] && !d.board, '烤盘进烤箱上层（中火）');
    tick(9.4);
    down(K(350), 135); up(K(350), 135);
    ok(d.plate && d.plate.b.grades.bake === 'P' && d.plate.b.heatBonus === 2, `中火金黄取出 → 完美，火力加成 +${d.plate && d.plate.b.heatBonus}`);
    ok(d.plate.stage === 'top', '出炉直接装盘（不再刷蛋液）');
    dragTo(K(KL.jars.pearl.x + 10), KL.jars.pearl.y + 10, K(KL.plate.cx), 168);
    ok(d.stock.pearl === 3, '珍珠糖不能出炉后再撒（被拒绝，不扣库存）');
    dragTo(K(KL.jars.honey.x + 10), KL.jars.honey.y + 10, K(KL.plate.cx), 168);
    ok(!d.plate.b.extras.includes('honey') && d.stock.honey === 4, '每份最多 3 种配料：第 4 种蜂蜜被拒绝');
    dragTo(K(KL.plate.cx), 168, K(KL.pass.x + 30), KL.pass.y + 30);
    ok(d.counter[0] && !d.plate, '盘子送进出餐窗口，出现在前厅柜台');
    setView('front'); tick(1.5);
    ok(batchTags(d.counter[0]).join() === 'spice,citrus,crunch', '盘子口味标签：豆蔻→香料、橙皮→柑橘、珍珠糖→脆口');
    const mi = matchInfo(d.counter[0], c0);
    ok(mi.n === 2 && mi.mult === 1.5, '对单提示：和第一位客人（香料+柑橘）全对上 ×1.5');
    const fake = { prefs: ['sweet', 'crunch'] };
    ok(matchInfo(d.counter[0], fake).n === 1, '对单提示：和“甜蜜+脆口”的客人对上 1 个');
    const burnt = newBatch(); burnt.bake = 'burnt'; burnt.extras = ['cardamom'];
    ok(matchInfo(burnt, c0).ruined && matchInfo(burnt, c0).n === 0, '对单提示：烤焦的盘子显示“烤坏了”、不计口味');
    const before = d.score;
    dragTo(FL.plateSlots[0], 190, c0.x, c0.y - 60);
    ok(c0.state === 'served' && d.score > before, `上菜给第一位客人，得分 ${d.score}，${d.receipt ? d.receipt.r.stars : 0} 星`);
    if (d.receipt) {
      const r = d.receipt.r;
      const expect = Math.floor((BASE_PTS + 36 + 8 + 8 + 6 + 6 + 2) * 1.5) + r.tip;
      ok(r.total === expect, `总分公式核对（含中火 +2）：期望 ${expect}，实际 ${r.total}`);
    }
    // 小票：收起卡片不挡柜台和客人；点击展开、再点收起；不点会自动消失
    tick(0.4); drawOnce();
    const rc = d.receipt;
    const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
    const blocks = FL.plateSlots.some(px => overlap(rc.x, rc.y, rc.w, rc.h, px - 24, 168, 48, 34)) ||
      d.customers.some(c => overlap(rc.x, rc.y, rc.w, rc.h, c.x - 30, c.y - 128, 60, 128) && (c.state === 'wait'));
    ok(rc && !rc.open && rc.w > 0 && !blocks, `小票收起成左上角小卡片，不挡柜台和客人（${Math.round(rc.x)},${rc.y} ${rc.w}x${rc.h}）`);
    down(rc.x + 20, rc.y + 10); up(rc.x + 20, rc.y + 10);
    ok(d.receipt && d.receipt.open, '点击小卡片展开明细');
    drawOnce();
    const ox = d.receipt.x + 20, oy = d.receipt.y + 20;
    ok(d.receipt.h > 100, `展开后显示完整明细（高 ${Math.round(d.receipt.h)}）`);
    down(ox, oy); up(ox, oy);
    ok(!d.receipt, '再点一下收起');
    d.receipt = { r: { stars: 1 }, t: 0, life: 7, open: false, openT: 0 };
    tick(7.5);
    ok(!d.receipt, '不点的话 7 秒后自动消失');
    // 火力：三档速度不同，且实时生效
    setView('kitchen'); tick(1.5);
    d.oven[1] = newOvenItem(newBatch());
    d.temp = 'low'; tick(2); const uLow = d.oven[1].u;
    d.temp = 'high'; tick(2); const uHigh = d.oven[1].u - uLow;
    ok(Math.abs(uLow - 2) < 0.15 && Math.abs(uHigh - 5.2) < 0.2, `低火 2 秒 +${uLow.toFixed(1)}，切到高火 2 秒 +${uHigh.toFixed(1)}（旋钮实时生效）`);
    tick(3.8);
    down(K(350), 190); up(K(350), 190);
    ok(d.plate && d.plate.b.bake === 'golden' && d.plate.b.heatTag === 'crunch' && d.plate.b.heatBonus === 4,
      `大部分用高火烤到金黄 → 脆口，火力加成 +${d.plate && d.plate.b.heatBonus}（${d.plate && d.plate.b.bake}）`);
    // 烤坏的盘子扔掉
    dragTo(K(KL.plate.cx), 168, ...BIN());
    ok(!d.plate && d.discarded === 2, '装饰台上的盘子拖进垃圾桶');
    d.oven[1] = newOvenItem(newBatch()); d.oven[1].u = 22; d.oven[1].burnt = true;
    down(K(350), 190); up(K(350), 190);
    ok(d.plate && d.plate.b.bake === 'burnt' && d.plate.b.grades.bake === 'M' && !d.plate.b.heatBonus, '烤焦取出 → 失误、烤焦、无火力加成');
    // 市场
    d.coins = 7; const st0 = d.stock.cardamom;
    G.paused = 'market';
    click('buy_cardamom'); click('buy_cardamom'); click('buy_cardamom');
    ok(d.stock.cardamom === st0 + 2 && d.coins === 1, `市场：7 小费买 2 份豆蔻（每份 3），第三次钱不够（库存 ${d.stock.cardamom}，余 ${d.coins}）`);
    const tFrozen = d.t; tick(2);
    ok(d.t === tFrozen, '打开市场时营业暂停');
    click('closeMarket');
    ok(!G.paused, '关闭市场继续营业');
    // 客人等太久
    const c1 = d.customers[1];
    for (let i = 0; i < 400 && c1.state !== 'wait'; i++) tick(0.1);
    c1.patience = 0.01; tick(0.2);
    ok(c1.state === 'angry', '客人耐心耗尽会生气（状态 ' + c1.state + '）');
    tick(9);
    ok(c1.state === 'gone' && d.left === 1, `生气的客人走出店门，记 1 位离开（状态 ${c1.state}，离开数 ${d.left}）`);
    // 菜单：重新开始
    G.paused = 'menu';
    click('restart');
    ok(G.day !== d && G.day.score === 0 && !G.paused && G.day.discarded === 0, '菜单 → 重新开始本局：分数清零');
    G.paused = 'menu';
    click('quitMap'); tick(0.1);
    ok(G.fadeTo && G.fadeTo.scene === 'map', '菜单 → 返回地图');
    G.fadeTo.init && G.fadeTo.init(); G.scene = G.fadeTo.scene; G.fadeTo = null;
    ok(G.scene === 'map' && G.day === null, '回到地图，本局数据清空');
    // 结算
    newDay(); G.scene = 'day';
    G.day.customers.forEach(c => { c.state = 'gone'; });
    tick(1.5);
    ok(G.scene === 'summary' && G.summary.stamps === 0, '所有客人离开后进入结算（得分 ' + G.summary.score + '）');
    G.scene = 'day';
  } catch (e) {
    log.push('异常 ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
  }
  window.__testLog = log;
  document.title = log.some(l => !l.startsWith('通过')) ? 'AUTOTEST FAIL' : 'AUTOTEST PASS';
  G.testOverlay = () => {
    ctx.setTransform(SC, 0, 0, SC, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(0, 0, W, H);
    const fails = log.filter(l => !l.startsWith('通过'));
    txt(`自动测试：${log.length - fails.length}/${log.length} 通过`, 6, 7, { size: 8, bold: true, color: fails.length ? '#c0392b' : '#2f7a2f' });
    const tail = log.slice(Math.max(0, log.length - 12));
    [...fails, '—— 最后 12 项 ——', ...tail].forEach((l, i) => txt(l, 6, 19 + i * 9, { size: 6.8, color: l.startsWith('通过') ? '#2f7a2f' : l.startsWith('——') ? '#666' : '#c0392b' }));
  };
}

window.__bb = { G, cam, SCENES };
})();
