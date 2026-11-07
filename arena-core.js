/* Battle Malabary - 5v5 tactical arena rules (shared by server.js and the game page).
 * Pure logic, no DOM, no sockets. Server-authoritative: HP, armor, economy, rounds, spike. */
(function (G) {
'use strict';
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const AX=4000,AZ=0,AW=150,AH=100;

const THEMES=[
  {n:'Kochi Port',ml:'കൊച്ചി തുറമുഖം',floor:0x6b7076,wall:0x8d6a4f,trim:0xd9c9a2,props:[0xc0392b,0x2e6da4,0xd49a1e,0x3a8f5c],kind:'container',fog:0xbcd3e4},
  {n:'Munnar Estate',ml:'മൂന്നാർ',floor:0x4f8a3b,wall:0xd8d2bd,trim:0x6d4c2f,props:[0x2f7d33,0x3b9a40,0x276b2c,0x8a5a3c],kind:'bush',fog:0xcfe3d4},
  {n:'Alappuzha Yard',ml:'ആലപ്പുഴ',floor:0x8c7b58,wall:0x2f6f78,trim:0xf2e6b8,props:[0x7a4a28,0x9a6a38,0x1f5560,0xd8b24a],kind:'boat',fog:0xe5d9bb},
  {n:'Kozhikode Bazaar',ml:'കോഴിക്കോട് ബസാർ',floor:0x9a8a6d,wall:0xb5553a,trim:0xf1e2b5,props:[0xe0a82a,0xc0392b,0x1f7a4a,0x6a3fa0],kind:'stall',fog:0xeed7b4}
];
function arLayout(seed){
  for(let att=0;att<30;att++){const L=arTry(seed*131+att*977+11,false);if(L)return L;}
  return arTry(seed,true);
}
function arTry(s,plain){
  const r=mulberry(s),W_=AW,H_=AH,R=[];
  const T=(r()*THEMES.length)|0,th=THEMES[T],LW=[26,28,30][(r()*3)|0],midT=(r()*3)|0,flip=r()<.5;
  const wall=(u0,v0,u1,v1,h)=>R.push({u0,v0,u1,v1,h:h||8,k:'wall'});
  const solid=(u0,v0,u1,v1,h,c,k)=>R.push({u0,v0,u1,v1,h,c,k});
  wall(-2,-2,W_+2,0);wall(-2,H_,W_+2,H_+2);wall(-2,0,0,H_);wall(W_,0,W_+2,H_);
  const d0=LW,d1=LW+3,e0=H_-LW-3,e1=H_-LW;
  const divider=(a,b)=>{
    const gs=[[8,14],[W_-14,W_-8]],used=[],n=1+((r()*3)|0);
    for(let i=0;i<n;i++){const w=8+((r()*4)|0),u=34+r()*(W_-68-w);if(used.every(x=>Math.abs(x-u)>w+16)){used.push(u);gs.push([u,u+w]);}}
    gs.sort((p,q)=>p[0]-q[0]);let cur=0;for(const g of gs){if(g[0]>cur)wall(cur,a,g[0],b);cur=g[1];}if(cur<W_)wall(cur,a,W_,b);
  };
  divider(d0,d1);divider(e0,e1);
  const m0=d1,m1=e0,mc=(m0+m1)/2;
  wall(22,m0,24,mc-5);wall(22,mc+5,24,m1);wall(W_-24,m0,W_-22,mc-5);wall(W_-24,mc+5,W_-22,m1);
  const sizes={container:[6,2.6,2.6],bush:[8,2,1.3],boat:[7,2.4,1.4],stall:[3.6,3.6,2.2]};
  const pc=()=>th.props[(r()*th.props.length)|0];
  const prop=(u,v,rot)=>{const z=sizes[th.kind],w=rot?z[1]:z[0],d=rot?z[0]:z[1];solid(u-w/2,v-d/2,u+w/2,v+d/2,z[2],pc(),th.kind);};
  const crate=(u,v,sz,h)=>solid(u-sz/2,v-sz/2,u+sz/2,v+sz/2,h,pc(),'crate');
  const siteU=W_-30;
  for(const sv of [LW/2,H_-LW/2]){const k=sv<H_/2?1:-1;crate(siteU-9,sv-5*k,2.6,1.6);crate(siteU+6,sv+5*k,3,2.6);crate(siteU+10,sv-6*k,2.4,1.5);}
  if(!plain){
    if(midT===1){const hw=11+r()*5,hv=(m1-m0)/2-6;solid(W_/2-hw,mc-hv,W_/2+hw,mc+hv,6,th.wall,'bld');}
    else if(midT===2){const n=3+((r()*3)|0);for(let i=0;i<n;i++){const u=38+r()*(W_-76),v=m0+4+r()*(m1-m0-8);solid(u,v,u+3,v+3,6,th.wall,'bld');}}
    else{wall(52,m0,55,m0+11);wall(95,m1-11,98,m1);}
    const c1=48+r()*40,c2=62+r()*40;wall(c1,0,c1+3,LW*.55);wall(c2,H_-LW*.55,c2+3,H_);
    const n=10+((r()*6)|0);
    for(let i=0;i<n;i++){const lane=(r()*3)|0,u=30+r()*(W_-60);let v;
      if(lane===0)v=4+r()*(LW-8);else if(lane===1)v=H_-LW+4+r()*(LW-8);else v=m0+5+r()*(m1-m0-10);
      if(r()<.6)prop(u,v,r()<.5);else crate(u,v,2+r()*2,r()<.5?1.5:2.7);}
  }
  const atk=[],def=[];for(let i=0;i<5;i++){const v=m0+4+i*((m1-m0-8)/4);atk.push({u:4+(i%2)*7,v});def.push({u:W_-4-(i%2)*7,v});}
  const sites=[{u:siteU,v:LW/2},{u:siteU,v:H_-LW/2}],mid={u:W_/2,v:mc};
  if(flip){for(const q of R){const a=H_-q.v1,b=H_-q.v0;q.v0=a;q.v1=b;}for(const a of atk.concat(def,sites,[mid]))a.v=H_-a.v;}
  const L={th,T,R,atk,def,sites,mid,LW};
  return (plain||arConnected(L))?L:null;
}
function arConnected(L){
  const CW=AW,CH=AH,bl=new Uint8Array(CW*CH);
  for(const q of L.R){const i0=Math.max(0,Math.floor(q.u0-.5)),i1=Math.min(CW-1,Math.floor(q.u1+.5)),j0=Math.max(0,Math.floor(q.v0-.5)),j1=Math.min(CH-1,Math.floor(q.v1+.5));
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)bl[i*CH+j]=1;}
  const cell=p=>[Math.max(0,Math.min(CW-1,Math.floor(p.u))),Math.max(0,Math.min(CH-1,Math.floor(p.v)))];
  const pts=L.atk.concat(L.def,L.sites,[L.mid]).map(cell);
  for(const c of pts)if(bl[c[0]*CH+c[1]])return false;
  const seen=new Uint8Array(CW*CH),st=[pts[0][0]*CH+pts[0][1]];seen[st[0]]=1;
  while(st.length){const k=st.pop(),i=(k/CH)|0,j=k%CH;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj;if(a<0||b<0||a>=CW||b>=CH)continue;const q=a*CH+b;if(seen[q]||bl[q])continue;seen[q]=1;st.push(q);}}
  return pts.every(c=>seen[c[0]*CH+c[1]]);
}

/* ------------------------------- guns ------------------------------- */
// cat: pistol|smg|shotgun|rifle|sniper|heavy   base = which 3D model it reuses
function gun(id,name,cat,price,base,o){return Object.assign({id,name,cat,price,base,dmg:20,head:2.5,leg:.85,rate:.1,mag:20,res:60,reload:2,range:150,pel:1,spread:.015,auto:true,det:80,burst:0,burstCd:0,rec:.01,recoil:null,tier:2,col:'#ffffff'},o);}
const GUNS={
  classic:gun('classic','Classic','pistol',0,'pistol',{dmg:26,head:3,rate:.2,mag:12,res:36,reload:1.5,range:130,spread:.012,auto:false,det:60,rc:[.004,.001]}),
  heavy:gun('heavy','Heavy Pistol','pistol',600,'pistol',{dmg:40,head:2.5,rate:.38,mag:7,res:28,reload:1.9,range:140,spread:.01,auto:false,det:70,rc:[.009,.002]}),
  burstp:gun('burstp','Burst Pistol','pistol',400,'pistol',{dmg:19,head:2.6,rate:.065,mag:15,res:45,reload:1.7,range:110,spread:.02,auto:true,burst:3,burstCd:.4,det:60,rc:[.005,.002]}),
  rapid:gun('rapid','Rapid SMG','smg',1600,'smg',{dmg:18,head:1.9,rate:.07,mag:30,res:90,reload:2.2,range:95,spread:.026,det:60,rc:[.0045,.0025]}),
  compact:gun('compact','Compact SMG','smg',1100,'smg',{dmg:15,head:1.9,rate:.09,mag:25,res:75,reload:1.8,range:85,spread:.02,det:55,rc:[.0035,.002]}),
  pump:gun('pump','Pump Shotgun','shotgun',900,'sg',{dmg:12,head:1.5,rate:.95,mag:5,res:20,reload:2.4,range:45,pel:8,spread:.07,auto:false,det:40,rc:[.03,.004]}),
  autosg:gun('autosg','Auto Shotgun','shotgun',1800,'sg',{dmg:9,head:1.5,rate:.34,mag:7,res:28,reload:2.6,range:42,pel:7,spread:.075,auto:true,det:40,rc:[.02,.006]}),
  arifle:gun('arifle','Assault Rifle','rifle',2900,'ar',{dmg:30,head:3.4,rate:.105,mag:25,res:75,reload:2.5,range:240,spread:.015,det:115,rc:[.0065,.0028]}),
  burstr:gun('burstr','Burst Rifle','rifle',2100,'ar',{dmg:26,head:3,rate:.07,mag:30,res:90,reload:2.4,range:210,spread:.014,burst:3,burstCd:.36,det:105,rc:[.0055,.002]}),
  precision:gun('precision','Precision Rifle','rifle',2500,'ar',{dmg:34,head:3,rate:.26,mag:15,res:45,reload:2.6,range:290,spread:.006,auto:false,det:150,rc:[.011,.002]}),
  lsniper:gun('lsniper','Light Sniper','sniper',3000,'sn',{dmg:85,head:2,rate:1.15,mag:5,res:15,reload:3.2,range:650,spread:.0015,auto:false,det:210,zoom:3,rc:[.04,.004]}),
  hsniper:gun('hsniper','Heavy Sniper','sniper',4700,'sn',{dmg:140,head:1.5,rate:1.7,mag:4,res:12,reload:3.6,range:650,spread:.001,auto:false,det:230,zoom:4,rc:[.055,.005]}),
  lmg:gun('lmg','LMG','heavy',2300,'ar',{dmg:24,head:2.5,rate:.075,mag:60,res:120,reload:4.4,range:190,spread:.024,det:100,rc:[.0055,.0042]}),
  hmg:gun('hmg','Heavy Machine Gun','heavy',3200,'ar',{dmg:33,head:2.6,rate:.09,mag:50,res:100,reload:5,range:210,spread:.022,det:105,rc:[.0075,.0048]})
};
const CATS=['pistol','smg','shotgun','rifle','sniper','heavy'];
// each gun gets its own deterministic recoil pattern: shot i -> [pitch up, yaw] in radians
let gi=0;for(const id in GUNS){const g=GUNS[id],r=mulberry(1000+(gi++)*77),up=g.rc[0],sd=g.rc[1],ph=r()*6,pat=[];let drift=0;
  for(let i=0;i<30;i++){const ramp=Math.min(1,.45+i*.07);drift+=(r()-.5)*sd*.8;pat.push([+(up*ramp).toFixed(5),+(Math.sin(i*.55+ph)*sd+drift).toFixed(5)]);}
  g.recoil=pat;g.tier=g.price>=2500?4:g.price>=1500?3:g.price>=600?2:1;}
const ARMOR={light:{v:25,price:0},heavy:{v:50,price:800}};
const RULES={HP:100,ARMOR:25,PLAYERS_PER_TEAM:5,BUY:30,LIVE:100,PLANT:4,BOMB:45,DEFUSE:7,RESULT:5,OVER:9,WINS:13,HALF:12,REG:24,START_CREDITS:800,WIN_BONUS:3000,LOSS_BONUS:[1900,2400,2900],KILL_BONUS:200,PLANT_BONUS:300,CAP:9000,SITE_R:10,DEFUSE_R:3.5,BOOM_R:26,LEG:.85};

/* ------------------------------- match ------------------------------- */
class Match {
  constructor(emit){this.emit=emit;this.players=new Map();this.reset();}
  reset(){this.st='wait';this.round=0;this.scores=[0,0];this.ot=null;this.t=0;this.bomb=null;this.loss=[0,0];this.startT=null;this.atk=0;this.seed=((Math.random()*1e9)|0)+1;this.layout=null;}
  P(id){return this.players.get(id);}
  teamCount(t){let n=0;for(const p of this.players.values())if(p.team===t)n++;return n;}
  addPlayer(info){
    const t0=this.teamCount(0),t1=this.teamCount(1);
    if(t0>=RULES.PLAYERS_PER_TEAM&&t1>=RULES.PLAYERS_PER_TEAM)return null;
    const p=Object.assign({team:t0<=t1?0:1,inRound:false,alive:this.st==='wait',hp:RULES.HP,armor:RULES.ARMOR,credits:RULES.START_CREDITS,pri:null,sec:'classic',
      x:0,y:0,z:0,yaw:0,pitch:0,c:0,w:'classic',kills:0,deaths:0,tok:{},lastTok:{},q:-1,hits:0,planting:null,defusing:null,slot:0},info);
    this.players.set(p.id,p);return p;
  }
  removePlayer(id){
    const p=this.P(id);if(!p)return;
    if(this.bomb){if(this.bomb.planting&&this.bomb.planting.id===id)this.bomb.planting=null;if(this.bomb.defusing&&this.bomb.defusing.id===id)this.bomb.defusing=null;}
    this.players.delete(id);
    if((this.st==='live'||this.st==='planted'||this.st==='buy')&&p.inRound&&p.alive){this.emit(null,{t:'kill',id,by:0,zone:'body',wid:'',left:true});this.checkEnd();}
    this.check();
  }
  check(){
    if(this.players.size<2){
      if(this.st!=='wait'){const keep=this.players;this.reset();for(const p of keep.values()){p.inRound=false;p.alive=true;p.credits=RULES.START_CREDITS;p.pri=null;p.sec='classic';p.armor=RULES.ARMOR;p.hp=RULES.HP;}this.emit(null,{t:'wait',seed:this.seed,scores:this.scores});}
      this.startT=null;return;
    }
    if(this.st==='wait'&&this.startT==null){this.startT=5;this.emit(null,{t:'wait',seed:this.seed,scores:this.scores,starting:5});}
  }
  startMatch(){
    this.round=0;this.scores=[0,0];this.ot=null;this.loss=[0,0];let i=0;
    for(const p of this.players.values()){p.team=(i++)%2;p.credits=RULES.START_CREDITS;p.pri=null;p.sec='classic';p.armor=RULES.ARMOR;p.kills=0;p.deaths=0;p.alive=false;}
    this.startRound();
  }
  sideAtk(n){return n<=RULES.REG?(n<=RULES.HALF?0:1):((n-RULES.REG-1)%2===0?0:1);}
  startRound(){
    if(this.players.size<2){this.check();return;}
    this.round++;this.atk=this.sideAtk(this.round);this.seed=((Math.random()*1e9)|0)+1;this.layout=arLayout(this.seed);
    this.st='buy';this.t=RULES.BUY;this.bomb=null;this.startT=null;
    const slots=[0,0],list=[];
    for(const p of this.players.values()){
      const wasAlive=p.alive&&p.inRound;
      if(!wasAlive){p.pri=null;p.sec='classic';p.armor=RULES.ARMOR;}
      p.inRound=true;p.alive=true;p.hp=RULES.HP;if(p.armor<RULES.ARMOR)p.armor=RULES.ARMOR;
      p.q=-1;p.tok={};p.lastTok={};p.planting=null;p.defusing=null;p.slot=slots[p.team]++%5;p.w=p.pri||p.sec;
      if(p.bot)this.autoBuy(p);
      list.push({id:p.id,name:p.name,bot:!!p.bot,team:p.team,slot:p.slot,shirt:p.shirt,lungi:p.lungi,skin:p.skin,w:p.w});
    }
    this.emit(null,{t:'round',n:this.round,seed:this.seed,atk:this.atk,scores:this.scores,phase:'buy',time:RULES.BUY,ot:this.ot?this.ot.wins:null,players:list});
    for(const p of this.players.values())this.econ(p);
  }
  econ(p){this.emit(p.id,{t:'econ',credits:p.credits,pri:p.pri,sec:p.sec,armor:p.armor,hp:p.hp});}
  autoBuy(p){
    const r=Math.random();let c=p.credits;
    const tryBuy=id=>{const g=GUNS[id];if(g&&g.price<=c){c-=g.price;if(g.cat==='pistol')p.sec=id;else p.pri=id;return true;}return false;};
    if(!p.pri){
      const pool=this.round<=1?[]:r<.45?['arifle','burstr','precision']:r<.7?['rapid','compact','lmg']:r<.85?['pump','autosg','hmg']:['lsniper'];
      for(const id of pool.sort(()=>Math.random()-.5)){if(tryBuy(id))break;}
      if(!p.pri&&c>=1100&&this.round>1)tryBuy('compact');
    }
    if(p.sec==='classic'&&c>=600&&Math.random()<.4)tryBuy('heavy');
    if(p.armor<50&&c>=ARMOR.heavy.price&&Math.random()<.5){c-=ARMOR.heavy.price;p.armor=50;}
    p.credits=c;p.w=p.pri||p.sec;
  }
  buy(p,item){
    if(this.st!=='buy'||!p.inRound||!p.alive)return;
    if(item==='armor50'){if(p.armor>=50||p.credits<ARMOR.heavy.price)return;p.credits-=ARMOR.heavy.price;p.armor=50;}
    else{const g=GUNS[item];if(!g||p.credits<g.price)return;if(g.cat==='pistol'){if(p.sec===item)return;p.sec=item;}else{if(p.pri===item)return;p.pri=item;}p.credits-=g.price;}
    p.w=p.pri||p.sec;this.econ(p);
  }
  setPos(id,x,y,z,yaw,pitch,c,w){
    const p=this.P(id);if(!p||!p.alive)return;
    p.x=x;p.y=y;p.z=z;p.yaw=yaw;p.pitch=pitch;p.c=c?1:0;if(w&&GUNS[w]&&(w===p.pri||w===p.sec))p.w=w;
  }
  sitePos(i){const L=this.layout,s=L.sites[i];return {x:AX+s.u,z:AZ+s.v};}
  msg(id,m){
    const p=this.P(id);if(!p)return;
    switch(m.t){
      case 'buy':this.buy(p,m.item);break;
      case 'hit':this.hit(p,m);break;
      case 'plant':this.plant(p,!!m.on);break;
      case 'defuse':this.defuse(p,!!m.on);break;
      default:break;
    }
  }
  hit(p,m){
    if(!p.alive||!p.inRound||(this.st!=='live'&&this.st!=='planted'))return;
    const tg=this.P(m.id|0);if(!tg||tg===p||!tg.alive||!tg.inRound||tg.team===p.team)return;
    const wid=m.wid,def=GUNS[wid];if(!def||(wid!==p.pri&&wid!==p.sec))return;
    const tn=this.now();
    if(m.q!==p.q){
      const last=p.lastTok[wid]||tn;
      p.tok[wid]=Math.min(3,(p.tok[wid]==null?3:p.tok[wid])+(tn-last)/(def.rate*1000*.9));p.lastTok[wid]=tn;
      if(p.tok[wid]<1)return;p.tok[wid]-=1;p.q=m.q;p.hits=0;
    }
    if(++p.hits>def.pel)return;
    const d=Math.hypot(p.x-tg.x,p.z-tg.z);if(d>def.range+20)return;
    const zone=m.zone==='head'?'head':m.zone==='leg'?'leg':'body';
    const zm=zone==='head'?def.head:zone==='leg'?RULES.LEG:1,fall=def.cat==='sniper'?1:1-.4*Math.min(1,d/def.range);
    this.damage(tg,Math.max(1,Math.round(def.dmg*zm*fall)),p,zone,wid);
  }
  damage(tg,dmg,att,zone,wid){
    const ab=Math.min(tg.armor,Math.round(dmg*.66));tg.armor-=ab;tg.hp-=dmg-ab;
    if(tg.hp>0){this.emit(null,{t:'dmg',id:tg.id,hp:tg.hp,armor:tg.armor,by:att?att.id:0,zone,wid});return;}
    tg.hp=0;tg.alive=false;tg.deaths++;
    if(att){att.kills++;att.credits=Math.min(RULES.CAP,att.credits+RULES.KILL_BONUS);if(!att.bot)this.econ(att);}
    if(this.bomb){if(this.bomb.planting&&this.bomb.planting.id===tg.id)this.cancelPlant();if(this.bomb.defusing&&this.bomb.defusing.id===tg.id)this.cancelDefuse();}
    this.emit(null,{t:'dmg',id:tg.id,hp:0,armor:tg.armor,by:att?att.id:0,zone,wid});
    this.emit(null,{t:'kill',id:tg.id,by:att?att.id:0,head:zone==='head',zone,wid});
    this.checkEnd();
  }
  plant(p,on){
    if(!on){if(this.bomb&&this.bomb.planting&&this.bomb.planting.id===p.id)this.cancelPlant();return;}
    if(this.st!=='live'||!p.alive||p.team!==this.atk||this.bomb)return;
    for(let i=0;i<2;i++){const s=this.sitePos(i);if(Math.hypot(p.x-s.x,p.z-s.z)<=RULES.SITE_R){this.bomb={planted:false,planting:{id:p.id,site:i,t:0,x:p.x,z:p.z}};this.emit(null,{t:'plantstart',id:p.id,site:i});return;}}
  }
  cancelPlant(){if(this.bomb&&this.bomb.planting){const id=this.bomb.planting.id;this.bomb=null;this.emit(null,{t:'plantcancel',id});}}
  defuse(p,on){
    if(!on){if(this.bomb&&this.bomb.defusing&&this.bomb.defusing.id===p.id)this.cancelDefuse();return;}
    if(this.st!=='planted'||!p.alive||p.team===this.atk||this.bomb.defusing)return;
    if(Math.hypot(p.x-this.bomb.x,p.z-this.bomb.z)<=RULES.DEFUSE_R){this.bomb.defusing={id:p.id,t:0};this.emit(null,{t:'defusestart',id:p.id});}
  }
  cancelDefuse(){if(this.bomb&&this.bomb.defusing){const id=this.bomb.defusing.id;this.bomb.defusing=null;this.emit(null,{t:'defusecancel',id});}}
  alive(team){let n=0;for(const p of this.players.values())if(p.inRound&&p.alive&&p.team===team)n++;return n;}
  checkEnd(){
    if(this.st!=='live'&&this.st!=='planted')return;
    const a=this.alive(this.atk),d=this.alive(1-this.atk);
    if(d===0)this.endRound(this.atk,'elim');
    else if(a===0&&this.st==='live'&&!(this.bomb&&this.bomb.planting))this.endRound(1-this.atk,'elim');
    else if(a===0&&this.st==='live'&&this.bomb&&this.bomb.planting){/* planter dead handled by cancelPlant */}
  }
  endRound(win,why){
    if(this.st==='end'||this.st==='over')return;
    this.cancelPlant();this.st='end';this.t=RULES.RESULT;this.scores[win]++;
    for(const p of this.players.values()){if(!p.inRound)continue;
      const add=p.team===win?RULES.WIN_BONUS:RULES.LOSS_BONUS[Math.min(2,this.loss[p.team])];p.credits=Math.min(RULES.CAP,p.credits+add);}
    this.loss[win]=0;this.loss[1-win]++;
    let over=false;
    if(!this.ot){
      if(this.scores[win]>=RULES.WINS)over=true;
      else if(this.round>=RULES.REG&&this.scores[0]===this.scores[1]){this.ot={wins:[0,0],n:0};}
    }else{
      this.ot.wins[win]++;this.ot.n++;
      if(this.ot.n%2===0){if(this.ot.wins[0]!==this.ot.wins[1])over=true;else this.ot.wins=[0,0];}
    }
    if(over)this.t=RULES.RESULT+RULES.OVER;
    this.overFlag=over;
    this.emit(null,{t:'rend',win,why,scores:this.scores,over,ot:this.ot?this.ot.wins:null,round:this.round});
  }
  explode(){
    const b=this.bomb;this.emit(null,{t:'boom',x:b.x,z:b.z});
    for(const p of this.players.values()){if(!p.inRound||!p.alive)continue;const d=Math.hypot(p.x-b.x,p.z-b.z);if(d<RULES.BOOM_R){p.hp=0;p.alive=false;p.deaths++;this.emit(null,{t:'dmg',id:p.id,hp:0,armor:0,by:0,zone:'body',wid:''});this.emit(null,{t:'kill',id:p.id,by:0,head:false,zone:'body',wid:'',boom:true});}}
    this.endRound(this.atk,'boom');
  }
  tick(dt){
    if(this.st==='wait'){if(this.startT!=null){this.startT-=dt;if(this.startT<=0){this.startT=null;if(this.players.size>=2)this.startMatch();else this.check();}}return;}
    this.t-=dt;
    if(this.st==='buy'){if(this.t<=0){this.st='live';this.t=RULES.LIVE;this.emit(null,{t:'phase',phase:'live',time:RULES.LIVE});}}
    else if(this.st==='live'){
      const b=this.bomb;
      if(b&&b.planting){const pl=b.planting,p=this.P(pl.id);
        if(!p||!p.alive||Math.hypot(p.x-pl.x,p.z-pl.z)>1.6){this.cancelPlant();}
        else{pl.t+=dt;if(pl.t>=RULES.PLANT){const s=this.sitePos(pl.site);this.bomb={planted:true,site:pl.site,x:p.x,z:p.z,t:RULES.BOMB,defusing:null,sx:s.x,sz:s.z};this.st='planted';this.t=RULES.BOMB;
          p.credits=Math.min(RULES.CAP,p.credits+RULES.PLANT_BONUS);this.emit(null,{t:'planted',id:p.id,site:pl.site,x:p.x,z:p.z,time:RULES.BOMB});this.econ(p);this.checkEnd();}}
      }
      if(this.st==='live'&&this.t<=0)this.endRound(1-this.atk,'time');
    }
    else if(this.st==='planted'){
      const b=this.bomb;
      if(b.defusing){const p=this.P(b.defusing.id);
        if(!p||!p.alive||Math.hypot(p.x-b.x,p.z-b.z)>RULES.DEFUSE_R+.8)this.cancelDefuse();
        else{b.defusing.t+=dt;if(b.defusing.t>=RULES.DEFUSE){this.emit(null,{t:'defused',id:p.id});this.endRound(1-this.atk,'defuse');return;}}}
      if(this.t<=0)this.explode();
    }
    else if(this.st==='end'){
      if(this.t<=0){if(this.overFlag){this.overFlag=false;this.emit(null,{t:'mend'});this.startMatch();}else this.startRound();}
    }
  }
  now(){return Date.now();}
}
G.ArenaCore={Match,GUNS,CATS,ARMOR,RULES,THEMES,arLayout,arConnected,mulberry,AX,AZ,AW,AH};
})(typeof module!=='undefined'&&module.exports?module.exports:window);
