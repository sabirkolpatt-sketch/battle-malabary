/* Battle Malabary - multiplayer server.
 * No dependencies. Run:  node server.js     (Node 16+)
 * Serves index.html (the game) and a WebSocket endpoint on the same port.
 * Env: PORT (default 3000), MAX_PLAYERS (default 16)
 * Endless free-for-all: join any time, respawn 5 s after dying.
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
    return res.end(JSON.stringify({ ok: true, players: players.size }));
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

/* ------------------------------ game ------------------------------ */
const players = new Map();       // id -> player
const world = { seed: ((Math.random() * 1e9) | 0) + 1, looted: new Map(), drops: new Map() };
let nextId = 1;
const now = () => Date.now();
const clean = s => String(s || 'Player').replace(/[^A-Za-z0-9_ ]/g, '').slice(0, 14) || 'Player';
const hexc = s => /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#b5231a';
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;

function bcast(obj, pred) {
  const s = JSON.stringify(obj);
  for (const p of players.values()) if (!pred || pred(p)) p.ws.send(s);
}
const full = p => ({ id: p.id, name: p.name, shirt: p.shirt, lungi: p.lungi, skin: p.skin, x: p.x, y: p.y, z: p.z, yaw: p.yaw, alive: p.alive, hp: p.hp, w: p.w, b: p.b });
function spawn(p) {
  p.alive = true; p.hp = MAXHP; p.protect = now() + PROTECT_MS; p.w = 'pistol'; p.b = 1; p.c = 0; p.q = -1; p.tok = {}; p.lastTok = {};
  return { di: (Math.random() * NDIS) | 0, rs: (Math.random() * 1e9) | 0 };
}
const sendCount = () => bcast({ t: 'cnt', n: players.size });

function onConnect(ws) {
  let p = null;
  ws.onmessage = raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!p) {
      if (m.t !== 'join') return;
      if (players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
      p = {
        id: nextId++, ws, name: clean(m.name), shirt: hexc(m.shirt), lungi: hexc(m.lungi), skin: hexc(m.skin),
        alive: true, hp: MAXHP, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, c: 0, w: 'pistol', b: 1, protect: 0,
        kills: 0, hs: 0, tok: {}, lastTok: {}, q: -1, hits: 0, lastHeal: 0, lastMsg: now()
      };
      const sp = spawn(p);
      const others = [...players.values()].map(full);
      players.set(p.id, p);
      ws.send(JSON.stringify({ t: 'welcome', id: p.id, seed: world.seed, spawn: sp, looted: [...world.looted.keys()], drops: [...world.drops.values()].map(d => d.it), players: others, n: players.size }));
      bcast({ t: 'join', p: full(p) }, q => q !== p);
      sendCount();
      return;
    }
    p.lastMsg = now();
    handle(p, m);
  };
  ws.onclose = () => {
    if (!p || !players.has(p.id)) return;
    players.delete(p.id);
    bcast({ t: 'leave', id: p.id, name: p.name });
    sendCount();
  };
}

function handle(p, m) {
  switch (m.t) {
    case 's': {
      if (!p.alive) return;
      p.x = num(m.x, -500, 3000, p.x); p.y = num(m.y, -5, 60, p.y); p.z = num(m.z, -500, 4000, p.z);
      p.yaw = num(m.yaw, -1e4, 1e4, p.yaw); p.pitch = num(m.pitch, -2, 2, p.pitch);
      p.c = m.c ? 1 : 0; if (W[m.w]) p.w = m.w; p.b = num(m.b, 1, 3, 1) | 0; break;
    }
    case 'shot': {
      if (!p.alive || !W[m.wid]) return;
      bcast({ t: 'shot', id: p.id, wid: m.wid, x: num(m.x, -1e4, 1e4, 0), y: num(m.y, -50, 500, 0), z: num(m.z, -1e4, 1e4, 0), tx: num(m.tx, -1e4, 1e4, 0), ty: num(m.ty, -50, 500, 0), tz: num(m.tz, -1e4, 1e4, 0) }, q => q !== p);
      break;
    }
    case 'hit': {
      if (!p.alive) return;
      const tg = players.get(m.id | 0); if (!tg || tg === p || !tg.alive || now() < tg.protect) return;
      const def = W[m.wid]; if (!def) return;
      const tn = now();
      if (m.q !== p.q) {            // a new trigger pull: needs a shot token
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
      if (tg.hp > 0) { bcast({ t: 'dmg', id: tg.id, hp: tg.hp, by: p.id, head, wid: m.wid }); return; }
      tg.hp = 0; tg.alive = false; p.kills++; if (head) p.hs++;
      bcast({ t: 'dmg', id: tg.id, hp: 0, by: p.id, head, wid: m.wid });
      bcast({ t: 'kill', id: tg.id, by: p.id, head, wid: m.wid });
      setTimeout(() => {      // respawn after 5 seconds
        if (!players.has(tg.id)) return;
        const sp = spawn(tg);
        tg.ws.send(JSON.stringify({ t: 'respawn', spawn: sp }));
        bcast({ t: 'resp', id: tg.id }, q => q !== tg);
      }, RESPAWN_MS);
      break;
    }
    case 'heal': {
      if (!p.alive) return;
      if (now() - p.lastHeal < 2000) return;
      p.lastHeal = now(); p.hp = Math.min(MAXHP, p.hp + 80);
      bcast({ t: 'heal', id: p.id, hp: p.hp }); break;
    }
    case 'pick': {   // someone took a loot item: remove it for everyone else
      const id = m.id;
      if (typeof id === 'number') {
        if (world.looted.has(id)) return;
        world.looted.set(id, now());
        setTimeout(() => { world.looted.delete(id); bcast({ t: 'lootback', id }); }, LOOT_RESPAWN_MS);
      } else if (typeof id === 'string') {
        const d = world.drops.get(id); if (!d) return; clearTimeout(d.timer); world.drops.delete(id);
      } else return;
      bcast({ t: 'pick', id, by: p.id }, q => q !== p); break;
    }
    case 'drop': {
      if (!m.it || world.drops.size > 400) return;
      const it = m.it, kind = it.kind;
      if (!['gun', 'med', 'bag', 'ammo'].includes(kind)) return;
      const clean_ = { id: String(it.id).slice(0, 20), kind, wid: W[it.wid] ? it.wid : null, lvl: num(it.lvl, 0, 3, 0) | 0, qty: num(it.qty, 1, 7, 1) | 0, x: num(it.x, -1e4, 1e4, 0), z: num(it.z, -1e4, 1e4, 0) };
      if (world.drops.has(clean_.id)) return;
      const timer = setTimeout(() => { world.drops.delete(clean_.id); bcast({ t: 'pick', id: clean_.id, by: 0 }); }, DROP_LIFE_MS);
      world.drops.set(clean_.id, { it: clean_, timer });
      bcast({ t: 'drop', it: clean_ }, q => q !== p);
      break;
    }
    default: break;   // 'ping' etc just refresh lastMsg
  }
}

setInterval(() => {   // idle cleanup
  const t = now();
  for (const p of players.values()) if (t - p.lastMsg > 45000) p.ws.close();
}, 5000);

setInterval(() => {   // 15 Hz: positions of everyone alive
  const arr = [];
  for (const p of players.values()) if (p.alive) arr.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(2), p.c, p.w, p.hp, p.b]);
  if (arr.length > 1 || (arr.length === 1 && players.size > 1)) bcast({ t: 'st', p: arr });
}, 66);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Battle Malabary server running on port ' + PORT);
  console.log('Open  http://localhost:' + PORT + '  (others: http://<your-ip>:' + PORT + ')');
});
