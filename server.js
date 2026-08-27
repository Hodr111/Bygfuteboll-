
require("dotenv").config();
const express=require("express"), http=require("http"), path=require("path");
const crypto=require("crypto"), Database=require("better-sqlite3");
const {WebSocketServer}=require("ws");
const {OAuth2Client}=require("google-auth-library");

const PORT=process.env.PORT||3000, DB_PATH=process.env.DB_PATH||path.join(__dirname,"data.sqlite");
const app=express(), server=http.createServer(app), wss=new WebSocketServer({server});
const db=new Database(DB_PATH); db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS players(
 id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT, name TEXT, avatar TEXT,
 role TEXT NOT NULL DEFAULT 'user', banned INTEGER NOT NULL DEFAULT 0,
 gold INTEGER NOT NULL DEFAULT 12500, gems INTEGER NOT NULL DEFAULT 850,
 wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
 goals INTEGER NOT NULL DEFAULT 0, penalties INTEGER NOT NULL DEFAULT 0,
 xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, formation TEXT NOT NULL DEFAULT '4-3-3',
 chemistry INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory(
 player_id TEXT NOT NULL, card_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(player_id,card_id), FOREIGN KEY(player_id) REFERENCES players(id)
);
CREATE TABLE IF NOT EXISTS seasons(
 id TEXT PRIMARY KEY, name TEXT, starts_at TEXT, ends_at TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS player_seasons(
 player_id TEXT, season_id TEXT, division INTEGER DEFAULT 10, points INTEGER DEFAULT 0,
 played INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, draws INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
 goals_for INTEGER DEFAULT 0, goals_against INTEGER DEFAULT 0,
 PRIMARY KEY(player_id,season_id)
);
CREATE TABLE IF NOT EXISTS match_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT, player_id TEXT, type TEXT, minute INTEGER,
 payload TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS missions(
 id TEXT PRIMARY KEY, title TEXT, description TEXT, target INTEGER, reward_gold INTEGER DEFAULT 0,
 reward_gems INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS player_missions(
 player_id TEXT, mission_id TEXT, progress INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0,
 PRIMARY KEY(player_id,mission_id)
);
CREATE TABLE IF NOT EXISTS cosmetics(
 id TEXT PRIMARY KEY, kind TEXT, title TEXT, rarity TEXT, price_gold INTEGER DEFAULT 0,
 price_gems INTEGER DEFAULT 0, active INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS player_cosmetics(
 player_id TEXT, cosmetic_id TEXT, equipped INTEGER DEFAULT 0,
 PRIMARY KEY(player_id,cosmetic_id)
);
CREATE TABLE IF NOT EXISTS matches(
 id TEXT PRIMARY KEY, home_id TEXT, away_id TEXT, home_score INTEGER DEFAULT 0, away_score INTEGER DEFAULT 0,
 status TEXT DEFAULT 'waiting', started_at TEXT, ended_at TEXT
);
CREATE TABLE IF NOT EXISTS leaderboard(
 player_id TEXT PRIMARY KEY, season TEXT NOT NULL, wins INTEGER DEFAULT 0, goals INTEGER DEFAULT 0, gold INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions(
 token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs(
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL, target_id TEXT, detail TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS game_config(
 key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements(
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shop_items(
 id TEXT PRIMARY KEY, title TEXT, price_gold INTEGER DEFAULT 0, price_gems INTEGER DEFAULT 0, stock INTEGER DEFAULT -1, active INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}'
);
INSERT OR IGNORE INTO game_config(key,value) VALUES
('maintenance','false'),('matchmaking','true'),('shop','false'),('daily_gold','500'),('daily_gems','25');
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
INSERT OR IGNORE INTO seasons(id,name,starts_at,ends_at,active) VALUES('S1','Temporada 1','2026-08-01','2026-11-01',1);
INSERT OR IGNORE INTO missions(id,title,description,target,reward_gold,reward_gems) VALUES
('first_win','Primeira Vitória','Vença uma partida',1,1000,20),
('goals_10','Artilheiro','Marque 10 gols',10,2500,50),
('matches_5','Maratona','Jogue 5 partidas',5,1500,30);
`);
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID||"";
const oauth=GOOGLE_CLIENT_ID?new OAuth2Client(GOOGLE_CLIENT_ID):null;
const PUBLIC_ORIGIN=process.env.PUBLIC_ORIGIN||`http://localhost:${PORT}`;
app.use(express.json({limit:"256kb"})); app.use(express.static(__dirname));

function uid(){return "PFC-"+crypto.randomBytes(5).toString("hex").toUpperCase()}
function token(){return crypto.randomBytes(32).toString("hex")}
function sha(s){return crypto.createHash("sha256").update(s).digest("hex")}
function auth(req,res,next){
 const raw=(req.headers.authorization||"").replace(/^Bearer /,"");
 const s=db.prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?").get(sha(raw),Date.now());
 if(!s)return res.status(401).json({error:"unauthorized"});
 req.player=db.prepare("SELECT * FROM players WHERE id=?").get(s.player_id);
 if(!req.player || req.player.banned)return res.status(403).json({error:"account_disabled"});
 if(req.player.role!=="admin" && db.prepare("SELECT value FROM game_config WHERE key='maintenance'").get()?.value==="true")return res.status(503).json({error:"maintenance"});
 next();
}
function admin(req,res,next){
 if(!req.player || req.player.role!=="admin")return res.status(403).json({error:"admin_only"});
 next();
}
function audit(actor,action,target,detail=""){db.prepare("INSERT INTO audit_logs(actor_id,action,target_id,detail) VALUES(?,?,?,?)").run(actor,action,target||null,detail)}
function publicProfile(p){return {id:p.id,email:p.email,name:p.name,avatar:p.avatar,role:p.role,gold:p.gold,gems:p.gems,wins:p.wins,losses:p.losses,draws:p.draws,goals:p.goals,penalties:p.penalties,xp:p.xp,level:p.level,formation:p.formation,chemistry:p.chemistry}}

app.post("/api/admin/bootstrap",async(req,res)=>{
 const secret=process.env.ADMIN_BOOTSTRAP_SECRET;
 if(!secret || req.headers["x-admin-bootstrap"]!==secret)return res.status(403).json({error:"forbidden"});
 const {googleSub}=req.body||{};if(!googleSub)return res.status(400).json({error:"googleSub required"});
 const p=db.prepare("SELECT * FROM players WHERE google_sub=?").get(googleSub);if(!p)return res.status(404).json({error:"player_not_found"});
 db.prepare("UPDATE players SET role='admin' WHERE id=?").run(p.id);audit(p.id,"admin.bootstrap",p.id,"bootstrap");res.json({ok:true});
});

app.get("/api/health",(req,res)=>res.json({ok:true,service:"pfc-backend",firebase:false,now:new Date().toISOString()}));

app.post("/api/auth/google",async(req,res)=>{
 try{
  if(!oauth)return res.status(503).json({error:"Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."});
  const {credential}=req.body||{}; if(!credential)return res.status(400).json({error:"credential required"});
  const ticket=await oauth.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID});
  const g=ticket.getPayload(); if(!g?.sub)return res.status(401).json({error:"invalid google token"});
  let p=db.prepare("SELECT * FROM players WHERE google_sub=?").get(g.sub);
  if(!p){const id=uid();db.prepare("INSERT INTO players(id,google_sub,email,name,avatar) VALUES(?,?,?,?,?)").run(id,g.sub,g.email||"",g.name||"Player",g.picture||"");p=db.prepare("SELECT * FROM players WHERE id=?").get(id)}
  else db.prepare("UPDATE players SET email=?,name=?,avatar=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(g.email||p.email,g.name||p.name,g.picture||p.avatar,p.id);
  const t=token();db.prepare("INSERT INTO sessions(token_hash,player_id,expires_at) VALUES(?,?,?)").run(sha(t),p.id,Date.now()+1000*60*60*24*30);
  res.json({token:t,profile:publicProfile(db.prepare("SELECT * FROM players WHERE id=?").get(p.id))});
 }catch(e){res.status(401).json({error:"Google authentication failed"})}
});
app.get("/api/me",auth,(req,res)=>res.json({profile:publicProfile(req.player)}));
app.post("/api/logout",auth,(req,res)=>{const raw=(req.headers.authorization||"").replace(/^Bearer /,"");db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha(raw));res.json({ok:true})});

app.get("/api/inventory",auth,(req,res)=>res.json({items:db.prepare("SELECT card_id,quantity FROM inventory WHERE player_id=?").all(req.player.id)}));
app.post("/api/inventory/add",auth,(req,res)=>{const {cardId,quantity=1}=req.body||{};if(!cardId)return res.status(400).json({error:"cardId"});db.prepare(`INSERT INTO inventory(player_id,card_id,quantity) VALUES(?,?,?) ON CONFLICT(player_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity`).run(req.player.id,cardId,Math.max(1,Math.min(99,quantity)));res.json({ok:true})});
app.post("/api/profile/update",auth,(req,res)=>{const {name,formation,chemistry}=req.body||{};db.prepare("UPDATE players SET name=COALESCE(?,name),formation=COALESCE(?,formation),chemistry=COALESCE(?,chemistry),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name||null,formation||null,Number.isFinite(chemistry)?chemistry:null,req.player.id);res.json({profile:publicProfile(db.prepare("SELECT * FROM players WHERE id=?").get(req.player.id))})});
app.post("/api/match/result",auth,(req,res)=>{
 const {matchId,homeScore=0,awayScore=0,penalties=0}=req.body||{};
 const win=Number(homeScore)>Number(awayScore),draw=Number(homeScore)===Number(awayScore);
 const xp=100+(win?150:0)+Number(homeScore)*20;
 db.prepare(`UPDATE players SET wins=wins+?,losses=losses+?,draws=draws+?,goals=goals+?,penalties=penalties+?,gold=gold+?,xp=xp+?,level=1+CAST((xp+?)/1000 AS INTEGER),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(win?1:0,!win&&!draw?1:0,draw?1:0,Number(homeScore),Number(penalties),Number(homeScore)*150,xp,xp,req.player.id);
 const p=db.prepare("SELECT * FROM players WHERE id=?").get(req.player.id);
 db.prepare(`INSERT INTO leaderboard(player_id,season,wins,goals,gold) VALUES(?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET wins=excluded.wins,goals=excluded.goals,gold=excluded.gold`).run(p.id,new Date().getUTCFullYear().toString(),p.wins,p.goals,p.gold);
 res.json({ok:true,profile:publicProfile(p)});
});
app.get("/api/leaderboard",auth,(req,res)=>res.json({rows:db.prepare("SELECT p.id,p.name,p.wins,p.goals,p.gold FROM players p ORDER BY p.wins DESC,p.goals DESC,p.gold DESC LIMIT 100").all()}));

const rooms=new Map();
function broadcast(room,msg){for(const c of room.clients){if(c.readyState===1)c.send(JSON.stringify(msg))}}
wss.on("connection",(ws)=>{
 let room=null,playerId=null;
 ws.on("message",(raw)=>{
  try{const m=JSON.parse(raw.toString());
   if(m.type==="join"){room=m.room||"quick-"+Math.floor(Math.random()*10);playerId=m.playerId||"guest";if(!rooms.has(room))rooms.set(room,{clients:new Set(),state:{ball:{x:0,y:0},score:[0,0],t:0}});rooms.get(room).clients.add(ws);ws.send(JSON.stringify({type:"joined",room}));broadcast(rooms.get(room),{type:"players",count:rooms.get(room).clients.size})}
   if(m.type==="input"&&room){const r=rooms.get(room);r.state.t++;r.state.lastInput={playerId,x:m.x,y:m.y,action:m.action||"move"};broadcast(r,{type:"state",state:r.state})}
   if(m.type==="leave"&&room){rooms.get(room)?.clients.delete(ws)}
  }catch{}
 });
 ws.on("close",()=>{if(room&&rooms.has(room)){const r=rooms.get(room);r.clients.delete(ws);if(!r.clients.size)rooms.delete(room)}})
});

/* ===== ADMIN CONTROL CENTER ===== */
app.get("/api/admin/overview",auth,admin,(req,res)=>{
 const users=db.prepare("SELECT COUNT(*) n FROM players").get().n;
 const banned=db.prepare("SELECT COUNT(*) n FROM players WHERE banned=1").get().n;
 const matches=db.prepare("SELECT COUNT(*) n FROM matches").get().n;
 const cfg=Object.fromEntries(db.prepare("SELECT key,value FROM game_config").all().map(x=>[x.key,x.value]));
 res.json({users,banned,matches,config:cfg,activeUsers:db.prepare("SELECT COUNT(*) n FROM sessions WHERE expires_at>?").get(Date.now()).n});
});
app.get("/api/admin/users",auth,admin,(req,res)=>res.json({rows:db.prepare("SELECT id,email,name,role,banned,gold,gems,wins,goals,created_at FROM players ORDER BY created_at DESC LIMIT 500").all()}));
app.post("/api/admin/user/:id",auth,admin,(req,res)=>{
 const id=req.params.id,{role,banned,gold,gems}=req.body||{},target=db.prepare("SELECT * FROM players WHERE id=?").get(id);
 if(!target)return res.status(404).json({error:"user_not_found"});
 if(id===req.player.id && role==="user")return res.status(400).json({error:"cannot_demote_self"});
 db.prepare("UPDATE players SET role=COALESCE(?,role),banned=COALESCE(?,banned),gold=COALESCE(?,gold),gems=COALESCE(?,gems),updated_at=CURRENT_TIMESTAMP WHERE id=?")
 .run(role??null,banned===undefined?null:(banned?1:0),gold===undefined?null:Math.max(0,Number(gold)),gems===undefined?null:Math.max(0,Number(gems)),id);
 audit(req.player.id,"admin.user.update",id,JSON.stringify({role,banned,gold,gems}));
 res.json({ok:true});
});
app.post("/api/admin/grant-card/:id",auth,admin,(req,res)=>{
 const {cardId,quantity=1}=req.body||{};if(!cardId)return res.status(400).json({error:"cardId"});
 db.prepare(`INSERT INTO inventory(player_id,card_id,quantity) VALUES(?,?,?) ON CONFLICT(player_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity`).run(req.params.id,cardId,Math.max(1,Math.min(999,Number(quantity))));
 audit(req.player.id,"admin.card.grant",req.params.id,`${cardId} x${quantity}`);res.json({ok:true});
});
app.post("/api/admin/config",auth,admin,(req,res)=>{
 const allowed=["maintenance","matchmaking","shop","daily_gold","daily_gems"];
 const tx=db.transaction(obj=>{for(const k of allowed)if(obj[k]!==undefined)db.prepare("INSERT INTO game_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(obj[k]))});
 tx(req.body||{});audit(req.player.id,"admin.config.update",null,JSON.stringify(req.body||{}));res.json({ok:true});
});
app.get("/api/admin/audit",auth,admin,(req,res)=>res.json({rows:db.prepare("SELECT a.*,p.name actor_name FROM audit_logs a LEFT JOIN players p ON p.id=a.actor_id ORDER BY a.id DESC LIMIT 300").all()}));
app.post("/api/admin/announcement",auth,admin,(req,res)=>{
 const {title="",body=""}=req.body||{};if(!title||!body)return res.status(400).json({error:"title_and_body_required"});
 const r=db.prepare("INSERT INTO announcements(title,body) VALUES(?,?)").run(title,body);audit(req.player.id,"admin.announcement.create",String(r.lastInsertRowid),title);res.json({ok:true,id:r.lastInsertRowid});
});
app.get("/api/announcements",(req,res)=>res.json({rows:db.prepare("SELECT id,title,body,created_at FROM announcements WHERE active=1 ORDER BY id DESC LIMIT 20").all()}));
app.get("/api/shop",(req,res)=>{
 const enabled=db.prepare("SELECT value FROM game_config WHERE key='shop'").get()?.value==="true";
 res.json({enabled,items:enabled?db.prepare("SELECT id,title,price_gold,price_gems,stock,metadata FROM shop_items WHERE active=1").all():[]});
});


/* ===== V18 GAME SYSTEMS ===== */
app.get("/api/season",auth,(req,res)=>{
 const s=db.prepare("SELECT * FROM seasons WHERE active=1 ORDER BY starts_at DESC LIMIT 1").get();
 const ps=s?db.prepare("SELECT * FROM player_seasons WHERE player_id=? AND season_id=?").get(req.player.id,s.id):null;
 res.json({season:s,ranking:ps||{division:10,points:0,played:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0}});
});
app.get("/api/missions",auth,(req,res)=>{
 const rows=db.prepare(`SELECT m.*,COALESCE(pm.progress,0) progress,COALESCE(pm.claimed,0) claimed
 FROM missions m LEFT JOIN player_missions pm ON pm.mission_id=m.id AND pm.player_id=? WHERE m.active=1`).all(req.player.id);
 res.json({rows});
});
app.post("/api/missions/:id/claim",auth,(req,res)=>{
 const m=db.prepare("SELECT * FROM missions WHERE id=? AND active=1").get(req.params.id);
 const pm=db.prepare("SELECT * FROM player_missions WHERE player_id=? AND mission_id=?").get(req.player.id,m?.id);
 if(!m||!pm||pm.progress<m.target||pm.claimed)return res.status(400).json({error:"mission_not_ready"});
 db.prepare("UPDATE player_missions SET claimed=1 WHERE player_id=? AND mission_id=?").run(req.player.id,m.id);
 db.prepare("UPDATE players SET gold=gold+?,gems=gems+? WHERE id=?").run(m.reward_gold,m.reward_gems,req.player.id);
 res.json({ok:true});
});
app.post("/api/match/start",auth,(req,res)=>{
 const id="M-"+crypto.randomBytes(7).toString("hex");
 db.prepare("INSERT INTO matches(id,home_id,status,started_at) VALUES(?,?,?,CURRENT_TIMESTAMP)").run(id,req.player.id,"waiting");
 res.json({matchId:id});
});
app.post("/api/match/event",auth,(req,res)=>{
 const {matchId,type,minute=0,payload={}}=req.body||{};
 const m=db.prepare("SELECT * FROM matches WHERE id=? AND home_id=?").get(matchId,req.player.id);
 if(!m)return res.status(404).json({error:"match_not_found"});
 const allowed=["goal","assist","yellow","red","substitution","shot","save","corner","foul","offside","penalty_goal","penalty_miss"];
 if(!allowed.includes(type))return res.status(400).json({error:"event_not_allowed"});
 db.prepare("INSERT INTO match_events(match_id,player_id,type,minute,payload) VALUES(?,?,?,?,?)").run(matchId,req.player.id,type,Math.max(0,Math.min(130,Number(minute))),JSON.stringify(payload));
 res.json({ok:true});
});
app.post("/api/match/finish",auth,(req,res)=>{
 const {matchId,homeScore=0,awayScore=0,events=[]}=req.body||{};
 const m=db.prepare("SELECT * FROM matches WHERE id=? AND home_id=?").get(matchId,req.player.id);
 if(!m||m.status==="finished")return res.status(400).json({error:"invalid_match"});
 const hs=Math.max(0,Math.min(30,Number(homeScore))),as=Math.max(0,Math.min(30,Number(awayScore)));
 const win=hs>as,draw=hs===as,season=db.prepare("SELECT id FROM seasons WHERE active=1 ORDER BY starts_at DESC LIMIT 1").get();
 const tx=db.transaction(()=>{
  db.prepare("UPDATE matches SET away_score=?,home_score=?,status='finished',ended_at=CURRENT_TIMESTAMP WHERE id=?").run(as,hs,matchId);
  if(season){
   db.prepare(`INSERT INTO player_seasons(player_id,season_id,division,points,played,wins,draws,losses,goals_for,goals_against)
   VALUES(?,?,10,?,?,?,?,?,?)
   ON CONFLICT(player_id,season_id) DO UPDATE SET points=points+excluded.points,played=played+1,wins=wins+excluded.wins,draws=draws+excluded.draws,losses=losses+excluded.losses,goals_for=goals_for+excluded.goals_for,goals_against=goals_against+excluded.goals_against`)
   .run(req.player.id,season.id,win?3:draw?1:0,1,win?1:0,draw?1:0,win||draw?0:1,hs,as);
  }
  db.prepare("UPDATE players SET wins=wins+?,losses=losses+?,draws=draws+?,goals=goals+?,xp=xp+?,gold=gold+?,level=1+CAST((xp+?)/1000 AS INTEGER) WHERE id=?")
  .run(win?1:0,!win&&!draw?1:0,draw?1:0,hs,(win?250:100)+hs*20,hs*150,(win?250:100)+hs*20,req.player.id);
  // Progress active missions.
  const ids=db.prepare("SELECT id FROM missions WHERE active=1").all().map(x=>x.id);
  for(const id of ids)db.prepare("INSERT INTO player_missions(player_id,mission_id,progress) VALUES(?,?,1) ON CONFLICT(player_id,mission_id) DO UPDATE SET progress=MIN(progress+(?),999)").run(req.player.id,id,1,1);
 });
 tx(); audit(req.player.id,"match.finish",matchId,`${hs}-${as}`);
 res.json({ok:true,profile:publicProfile(db.prepare("SELECT * FROM players WHERE id=?").get(req.player.id))});
});
app.get("/api/match/:id/events",auth,(req,res)=>{
 const m=db.prepare("SELECT * FROM matches WHERE id=? AND home_id=?").get(req.params.id,req.player.id);
 if(!m)return res.status(404).json({error:"not_found"});
 res.json({match:m,events:db.prepare("SELECT * FROM match_events WHERE match_id=? ORDER BY minute,id").all(req.params.id)});
});

app.get("/api/config",(req,res)=>res.json({googleEnabled:!!GOOGLE_CLIENT_ID,origin:PUBLIC_ORIGIN,ws:`${PUBLIC_ORIGIN.replace(/^http/,"ws")}`}));
server.listen(PORT,()=>console.log(`PFC backend running on ${PUBLIC_ORIGIN}`));
