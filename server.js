/* Battle Malabary - multiplayer server.
 * No dependencies. Run:  node server.js     (Node 16+)
 * Serves index.html (the game) and a WebSocket endpoint on the same port.
 * Env: PORT (default 3000), MAX_PLAYERS (default 16)
 * Two online modes: 'br' endless battle royale (join any time, respawn in 5 s) and
 * 'arena' 5v5 tactical rounds (fixed map Newro, first to 4 rounds).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 16;
const RESPAWN_MS = 5000;     // time dead before respawning
const PROTECT_MS = 3000;     // spawn protection after (re)spawn
const LOOT_RESPAWN_MS = 120000;  // map loot comes back after this
const DROP_LIFE_MS = 90000;      // dropped items disappear after this
const MAXHP = 200;
const NDIS = 14;             // districts on the map

// must match the client's weapon table
const W = {
  pistol: { dmg: 20, head: 3, rate: .32, range: 150, pel: 1 },
  smg: { dmg: 13, head: 1.5, rate: .075, range: 110, pel: 1 },
  ar: { dmg: 27, head: 1.8, rate: .11, range: 240, pel: 1 },
  sg: { dmg: 12, head: 1.4, rate: .9, range: 48, pel: 8 },
  sn: { dmg: 78, head: 2.4, rate: 1.3, range: 650, pel: 1 }
};

/* ------------------------------ HTTP ------------------------------ */
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/health' || url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, br: rooms.br.players.size, arena: rooms.arena.players.size }));
  }
  if (url === '/' || url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, buf) => {
      if (err) { res.writeHead(500); return res.end('index.html missing next to server.js'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

/* --------------------------- tiny WebSocket ----------------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  onConnect(new WS(socket));
});

class WS {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.open = true; this.onmessage = null; this.onclose = null;
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); try { this.parse(); } catch (e) { this.close(); } });
    socket.on('close', () => this.finish()); socket.on('error', () => this.finish());
  }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const op = b[0] & 15; let len = b[1] & 127, off = 2; const masked = !!(b[1] & 128);
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) { this.close(); return; }
      if (b.length < off + (masked ? 4 : 0) + len) return;
      let mask = null; if (masked) { mask = b.slice(off, off + 4); off += 4; }
      const data = Buffer.from(b.slice(off, off + len));
      if (mask) for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.slice(off + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) this.frame(10, data);
      else if ((op === 1 || op === 0) && this.onmessage) this.onmessage(data.toString('utf8'));
    }
  }
  frame(op, data) {
    if (!this.open) return;
    const n = data.length; let h;
    if (n < 126) h = Buffer.from([128 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    try { this.socket.write(Buffer.concat([h, data])); } catch (e) { this.finish(); }
  }
  send(s) { this.frame(1, Buffer.from(s)); }
  close() { if (this.open) { try { this.frame(8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} } this.finish(); }
  finish() { if (!this.open) return; this.open = false; try { this.socket.destroy(); } catch (e) {} if (this.onclose) this.onclose(); }
}

/* ------------------------------ game rooms ------------------------------ */
const now = () => Date.now();
const clean = s => String(s || 'Player').replace(/[^A-Za-z0-9_ ]/g, '').slice(0, 14) || 'Player';
const hexc = s => /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#b5231a';
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
const rnd = n => (Math.random() * n) | 0;
let nextId = 1;

// arena rules
const HALF = 3, WINS = 4, FREEZE = 6, LIVE = 100, ENDWAIT = 5, STARTDELAY = 5, MAXTEAM = 5;
const LOADOUT = ['smg', 'smg', 'ar', 'ar', 'ar', 'sg', 'sn'];

class Room {
  constructor(kind) {
    this.kind = kind; this.players = new Map();
    this.world = { seed: rnd(1e9) + 1, looted: new Map(), drops: new Map() };      // br
    this.A = { state: 'wait', round: 0, scores: [0, 0], seed: rnd(1e9) + 1, t0: 0, atk: 0, startT: null, ending: false };   // arena
  }
  bcast(obj, pred) { const s = JSON.stringify(obj); for (const p of this.players.values()) if (!pred || pred(p)) p.ws.send(s); }
  full(p) { return { id: p.id, name: p.name, shirt: p.shirt, lungi: p.lungi, skin: p.skin, x: p.x, y: p.y, z: p.z, yaw: p.yaw, alive: p.alive, hp: p.hp, w: p.w, b: p.b, team: p.team }; }
  spawn(p) {
    p.alive = true; p.hp = MAXHP; p.protect = now() + PROTECT_MS; p.w = 'pistol'; p.b = 1; p.c = 0; p.q = -1; p.tok = {}; p.lastTok = {};
    return { di: rnd(NDIS), rs: rnd(1e9) };
  }
  sendCount() { this.bcast({ t: 'cnt', n: this.players.size }); }
  teamCount(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }

  join(ws, m) {
    if (this.players.size >= (this.kind === 'arena' ? MAXTEAM * 2 : MAX_PLAYERS)) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return null; }
    const p = {
      id: nextId++, ws, room: this, name: clean(m.name), shirt: hexc(m.shirt), lungi: hexc(m.lungi), skin: hexc(m.skin),
      alive: true, hp: MAXHP, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, c: 0, w: 'pistol', b: 1, protect: 0, team: 0, inRound: false,
      kills: 0, hs: 0, tok: {}, lastTok: {}, q: -1, hits: 0, lastHeal: 0, lastMsg: now()
    };
    const others = [...this.players.values()].map(q => this.full(q));
    if (this.kind === 'arena') {
      const t0 = this.teamCount(0), t1 = this.teamCount(1);
      if (t0 >= MAXTEAM && t1 >= MAXTEAM) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return null; }
      p.team = t0 <= t1 ? 0 : 1; p.alive = this.A.state === 'wait';
      this.players.set(p.id, p);
      ws.send(JSON.stringify({ t: 'welcome', mode: 'arena', id: p.id, team: p.team, seed: this.A.seed, phase: this.A.state, round: this.A.round, atkTeam: this.A.atk, scores: this.A.scores, players: others, n: this.players.size }));
      this.bcast({ t: 'join', p: this.full(p) }, q => q !== p);
      this.sendCount(); this.arCheck();
      return p;
    }
    const sp = this.spawn(p);
    this.players.set(p.id, p);
    ws.send(JSON.stringify({ t: 'welcome', mode: 'br', id: p.id, seed: this.world.seed, spawn: sp, looted: [...this.world.looted.keys()], drops: [...this.world.drops.values()].map(d => d.it), players: others, n: this.players.size }));
    this.bcast({ t: 'join', p: this.full(p) }, q => q !== p);
    this.sendCount();
    return p;
  }
  leave(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    this.bcast({ t: 'leave', id: p.id, name: p.name });
    this.sendCount();
    if (this.kind === 'arena') {
      if (this.A.state === 'live' && p.inRound && p.alive) { this.bcast({ t: 'kill', id: p.id, by: 0, head: false, wid: '', left: true }); this.arCheckEnd(); }
      this.arCheck();
    }
  }

  handle(p, m) {
    const ar = this.kind === 'arena';
    switch (m.t) {
      case 's': {
        if (!p.alive) return;
        p.x = num(m.x, -500, 6000, p.x); p.y = num(m.y, -5, 60, p.y); p.z = num(m.z, -500, 4000, p.z);
        p.yaw = num(m.yaw, -1e4, 1e4, p.yaw); p.pitch = num(m.pitch, -2, 2, p.pitch);
        p.c = m.c ? 1 : 0; if (W[m.w]) p.w = m.w; p.b = num(m.b, 1, 3, 1) | 0; break;
      }
      case 'shot': {
        if (!p.alive || !W[m.wid]) return;
        if (ar && this.A.state !== 'live') return;
        this.bcast({ t: 'shot', id: p.id, wid: m.wid, x: num(m.x, -1e4, 1e4, 0), y: num(m.y, -50, 500, 0), z: num(m.z, -1e4, 1e4, 0), tx: num(m.tx, -1e4, 1e4, 0), ty: num(m.ty, -50, 500, 0), tz: num(m.tz, -1e4, 1e4, 0) }, q => q !== p);
        break;
      }
      case 'hit': {
        if (!p.alive) return;
        if (ar && (this.A.state !== 'live' || !p.inRound)) return;
        const tg = this.players.get(m.id | 0); if (!tg || tg === p || !tg.alive || now() < tg.protect) return;
        if (ar && (tg.team === p.team || !tg.inRound)) return;
        const def = W[m.wid]; if (!def) return;
        const tn = now();
        if (m.q !== p.q) {
          const last = p.lastTok[m.wid] || tn;
          p.tok[m.wid] = Math.min(3, (p.tok[m.wid] == null ? 3 : p.tok[m.wid]) + (tn - last) / (def.rate * 1000 * .9));
          p.lastTok[m.wid] = tn;
          if (p.tok[m.wid] < 1) return;
          p.tok[m.wid] -= 1; p.q = m.q; p.hits = 0;
        }
        if (++p.hits > def.pel) return;
        const d = Math.hypot(p.x - tg.x, p.z - tg.z);
        if (d > def.range + 20) return;
        const head = !!m.head;
        const fall = m.wid === 'sn' ? 1 : 1 - .4 * Math.min(1, d / def.range);
        const dmg = Math.max(1, Math.round(def.dmg * (head ? def.head : 1) * fall));
        tg.hp -= dmg;
        if (tg.hp > 0) { this.bcast({ t: 'dmg', id: tg.id, hp: tg.hp, by: p.id, head, wid: m.wid }); return; }
        tg.hp = 0; tg.alive = false; p.kills++; if (head) p.hs++;
        this.bcast({ t: 'dmg', id: tg.id, hp: 0, by: p.id, head, wid: m.wid });
        this.bcast({ t: 'kill', id: tg.id, by: p.id, head, wid: m.wid });
        if (ar) { this.arCheckEnd(); break; }
        setTimeout(() => {      // br: respawn after 5 seconds
          if (!this.players.has(tg.id)) return;
          const sp = this.spawn(tg);
          tg.ws.send(JSON.stringify({ t: 'respawn', spawn: sp }));
          this.bcast({ t: 'resp', id: tg.id }, q => q !== tg);
        }, RESPAWN_MS);
        break;
      }
      case 'heal': {
        if (!p.alive) return;
        if (now() - p.lastHeal < 2000) return;
        p.lastHeal = now(); p.hp = Math.min(MAXHP, p.hp + 80);
        this.bcast({ t: 'heal', id: p.id, hp: p.hp }); break;
      }
      case 'pick': {
        if (ar) return;
        const id = m.id, w = this.world;
        if (typeof id === 'number') {
          if (w.looted.has(id)) return;
          w.looted.set(id, now());
          setTimeout(() => { w.looted.delete(id); this.bcast({ t: 'lootback', id }); }, LOOT_RESPAWN_MS);
        } else if (typeof id === 'string') {
          const d = w.drops.get(id); if (!d) return; clearTimeout(d.timer); w.drops.delete(id);
        } else return;
        this.bcast({ t: 'pick', id, by: p.id }, q => q !== p); break;
      }
      case 'drop': {
        if (ar || !m.it || this.world.drops.size > 400) return;
        const it = m.it, kind = it.kind, w = this.world;
        if (!['gun', 'med', 'bag', 'ammo'].includes(kind)) return;
        const c = { id: String(it.id).slice(0, 20), kind, wid: W[it.wid] ? it.wid : null, lvl: num(it.lvl, 0, 3, 0) | 0, qty: num(it.qty, 1, 7, 1) | 0, x: num(it.x, -1e4, 1e4, 0), z: num(it.z, -1e4, 1e4, 0) };
        if (w.drops.has(c.id)) return;
        const timer = setTimeout(() => { w.drops.delete(c.id); this.bcast({ t: 'pick', id: c.id, by: 0 }); }, DROP_LIFE_MS);
        w.drops.set(c.id, { it: c, timer });
        this.bcast({ t: 'drop', it: c }, q => q !== p);
        break;
      }
      default: break;
    }
  }

  /* ---------- arena round logic ---------- */
  arCheck() {
    const A = this.A;
    if (this.players.size < 2) {
      if (A.state !== 'wait') { A.state = 'wait'; A.round = 0; A.scores = [0, 0]; A.ending = false; for (const p of this.players.values()) { p.inRound = false; p.alive = true; } this.bcast({ t: 'wait', seed: A.seed, scores: A.scores }); }
      if (A.startT) { clearTimeout(A.startT); A.startT = null; }
      return;
    }
    if (A.state === 'wait' && !A.startT) {
      this.bcast({ t: 'wait', seed: A.seed, scores: A.scores, starting: STARTDELAY });
      A.startT = setTimeout(() => { A.startT = null; if (this.players.size >= 2 && A.state === 'wait') this.arStartMatch(); }, STARTDELAY * 1000);
    }
  }
  arStartMatch() {
    const A = this.A; A.round = 0; A.scores = [0, 0];
    let i = 0; for (const p of this.players.values()) p.team = (i++) % 2;     // fresh, balanced teams
    this.arStartRound();
  }
  arStartRound() {
    const A = this.A;
    if (A.state === 'freeze' || A.state === 'live') return;
    if (this.players.size < 2) { this.arCheck(); return; }
    A.round++; A.atk = A.round <= HALF ? 0 : 1; A.seed = rnd(1e9) + 1; A.state = 'freeze'; A.ending = false;
    const slots = [0, 0], list = [];
    for (const p of this.players.values()) {
      p.inRound = true; p.alive = true; p.hp = MAXHP; p.protect = 0; p.q = -1; p.tok = {}; p.lastTok = {}; p.c = 0; p.b = 1;
      p.w = A.round === 1 ? 'pistol' : LOADOUT[rnd(LOADOUT.length)];
      list.push({ id: p.id, team: p.team, slot: slots[p.team]++ % 5, w: p.w });
    }
    this.bcast({ t: 'round', seed: A.seed, n: A.round, atkTeam: A.atk, freeze: FREEZE, live: LIVE, scores: A.scores, players: list });
    setTimeout(() => {
      if (A.state !== 'freeze' || A.seed === undefined) return;
      A.state = 'live'; A.t0 = now(); this.bcast({ t: 'live', live: LIVE });
    }, FREEZE * 1000);
  }
  aliveTeam(t) { let n = 0; for (const p of this.players.values()) if (p.inRound && p.alive && p.team === t) n++; return n; }
  arCheckEnd() {
    const A = this.A; if (A.state !== 'live' || A.ending) return;
    const a0 = this.aliveTeam(0), a1 = this.aliveTeam(1);
    if (a0 && a1) return;
    this.arEndRound(a0 ? 0 : a1 ? 1 : (1 - A.atk), 'elim');
  }
  arEndRound(win, why) {
    const A = this.A; if (A.state !== 'live') return;
    A.ending = true; A.state = 'end'; A.scores[win]++;
    const over = A.scores[win] >= WINS;
    this.bcast({ t: 'rend', win, why, scores: A.scores, over });
    setTimeout(() => {
      if (over) { A.ending = false; this.arStartMatch(); } else { A.ending = false; this.arStartRound(); }
    }, (ENDWAIT + (over ? 4 : 0)) * 1000);
  }
  tick() {
    const t = now();
    for (const p of this.players.values()) if (t - p.lastMsg > 45000) p.ws.close();
    if (this.kind === 'arena' && this.A.state === 'live' && t - this.A.t0 > LIVE * 1000) this.arEndRound(1 - this.A.atk, 'time');
  }
  positions() {
    const arr = [];
    for (const p of this.players.values()) if (p.alive) arr.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(2), p.c, p.w, p.hp, p.b]);
    if (arr.length > 1 || (arr.length === 1 && this.players.size > 1)) this.bcast({ t: 'st', p: arr });
  }
}

/* ------------------------- 5v5 tactical arena room ------------------------- */
const AC = require('./arena-core.js').ArenaCore;
class ArenaRoom {
  constructor() {
    this.kind = 'arena'; this.players = new Map();
    this.M = new AC.Match((to, e) => this.emit(to, e));
  }
  emit(to, e) {
    const s = JSON.stringify(e);
    if (to == null) { for (const p of this.players.values()) p.ws.send(s); }
    else { const p = this.players.get(to); if (p) p.ws.send(s); }
  }
  get size() { return this.players.size; }
  full(q) { const m = this.M.P(q.id) || {}; return { id: q.id, name: q.name, shirt: q.shirt, lungi: q.lungi, skin: q.skin, team: m.team, alive: !!m.alive && !!m.inRound, hp: m.hp, armor: m.armor, w: m.w, x: m.x, y: m.y, z: m.z, yaw: m.yaw, slot: m.slot }; }
  join(ws, m) {
    const M = this.M;
    const info = { id: nextId++, name: clean(m.name), shirt: hexc(m.shirt), lungi: hexc(m.lungi), skin: hexc(m.skin) };
    const mp = M.addPlayer(info);
    if (!mp) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return null; }
    const p = { id: info.id, ws, room: this, name: info.name, shirt: info.shirt, lungi: info.lungi, skin: info.skin, lastMsg: now() };
    const others = [...this.players.values()].map(q => this.full(q));
    this.players.set(p.id, p);
    const b = M.bomb;
    ws.send(JSON.stringify({ t: 'welcome', mode: 'arena', id: p.id, team: mp.team, seed: M.seed, phase: M.st, round: M.round, atk: M.atk, scores: M.scores, time: Math.max(0, M.t), ot: M.ot ? M.ot.wins : null, players: others, n: this.players.size,
      bomb: b && b.planted ? { x: b.x, z: b.z, site: b.site } : null }));
    this.emit(null, { t: 'cnt', n: this.players.size });
    for (const q of this.players.values()) if (q !== p) q.ws.send(JSON.stringify({ t: 'join', p: this.full(p) }));
    M.econ(mp);
    M.check();
    return p;
  }
  leave(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    this.emit(null, { t: 'leave', id: p.id, name: p.name });
    this.emit(null, { t: 'cnt', n: this.players.size });
    this.M.removePlayer(p.id);
  }
  handle(p, m) {
    const M = this.M;
    if (m.t === 's') {
      M.setPos(p.id, num(m.x, -500, 6000, 0), num(m.y, -5, 60, 0), num(m.z, -500, 4000, 0), num(m.yaw, -1e4, 1e4, 0), num(m.pitch, -2, 2, 0), m.c, m.w);
    } else if (m.t === 'shot') {
      const mp = M.P(p.id); if (!mp || !mp.alive || !AC.GUNS[m.wid] || (M.st !== 'live' && M.st !== 'planted')) return;
      const s = JSON.stringify({ t: 'shot', id: p.id, wid: m.wid, x: num(m.x, -1e4, 1e4, 0), y: num(m.y, -50, 500, 0), z: num(m.z, -1e4, 1e4, 0), tx: num(m.tx, -1e4, 1e4, 0), ty: num(m.ty, -50, 500, 0), tz: num(m.tz, -1e4, 1e4, 0) });
      for (const q of this.players.values()) if (q !== p) q.ws.send(s);
    } else if (m.t === 'buy' || m.t === 'hit' || m.t === 'plant' || m.t === 'defuse') {
      M.msg(p.id, m);
    }
  }
  tick() {
    const t = now();
    for (const p of this.players.values()) if (t - p.lastMsg > 45000) p.ws.close();
  }
  step(dt) { this.M.tick(dt); }
  positions() {
    const arr = [];
    for (const p of this.M.players.values()) if (p.alive && p.inRound) arr.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(2), p.c, p.w, p.hp, p.armor]);
    if (arr.length && this.players.size > 1) this.emit(null, { t: 'st', p: arr });
  }
}
const rooms = { br: new Room('br'), arena: new ArenaRoom() };

function onConnect(ws) {
  let p = null;
  ws.onmessage = raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!p) {
      if (m.t !== 'join') return;
      const room = m.mode === 'arena' ? rooms.arena : rooms.br;
      p = room.join(ws, m);
      if (!p) { p = false; }
      return;
    }
    if (p === false) return;
    p.lastMsg = now();
    p.room.handle(p, m);
  };
  ws.onclose = () => { if (p) p.room.leave(p); };
}

setInterval(() => { for (const r of Object.values(rooms)) r.tick(); }, 1000);
setInterval(() => { for (const r of Object.values(rooms)) r.positions(); }, 66);
setInterval(() => rooms.arena.step(.05), 50);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Battle Malabary server running on port ' + PORT);
  console.log('Open  http://localhost:' + PORT + '  (others: http://<your-ip>:' + PORT + ')');
});
