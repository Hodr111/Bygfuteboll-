const $=id=>document.getElementById(id);
const KEY="pfc_max_v6";
const defaultState={gold:2500,gems:120,wins:0,losses:0,matches:0,goals:0,assists:0,pens:0,ovr:84,stadium:3,chem:78,xp:0,rank:1240,leg:1,userId:null,displayName:"Jogador",email:"",photoURL:"",club:"Pocket FC",kit:"midnight",createdAt:Date.now()};
let S=Object.assign({},defaultState,JSON.parse(localStorage.getItem(KEY)||"{}"));
const players=[
["Mbappé","ST",97,"legendary"],["Vinícius Jr.","LW",96,"legendary"],["Haaland","ST",97,"legendary"],["Bellingham","CM",95,"legendary"],["De Bruyne","CM",93,"epic"],["Rodri","DM",96,"legendary"],["Salah","RW",94,"epic"],["Van Dijk","CB",93,"epic"],["Hakimi","RB",91,"rare"],["Alisson","GK",91,"epic"],["Theo Hernández","LB",90,"rare"]
];
const market=[
["Messi","RW",97,"legendary"],["Cristiano Ronaldo","ST",96,"legendary"],["Kane","ST",93,"epic"],["Lautaro Martínez","ST",91,"epic"],["Pedri","CM",91,"rare"],["Musiala","CAM",91,"rare"],["Saliba","CB",90,"rare"],["Courtois","GK",90,"rare"],["Saka","RW",90,"rare"],["Foden","CAM",90,"rare"],["Wirtz","CAM",91,"epic"],["Rúben Dias","CB",90,"rare"]
];
let formationName="4-3-3",rankMode="rating",game={mode:"ranked",running:false,paused:false,t:0,home:0,away:0,pos:50,charge:0,charging:false,stamina:100,shots:0,goals:0,pens:0};
let scene,camera,renderer,me,ball,team=[],rival=[],particles=[],clock3;
let input={x:0,z:0},keys={},joyInit=false;

// ===== ONLINE ACCOUNT: SUPABASE + GOOGLE (NO FIREBASE) =====
const PFC_SUPABASE_CONFIG=window.PFC_SUPABASE_CONFIG||{};
let supabaseClient=null;
function onlineConfigured(){return !!(PFC_SUPABASE_CONFIG.url&&PFC_SUPABASE_CONFIG.anonKey&&window.supabase)}
function makeLocalId(){let id=localStorage.getItem("pfc_public_id");if(!id){const a=new Uint8Array(6);crypto.getRandomValues(a);id="PF-"+Array.from(a,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();localStorage.setItem("pfc_public_id",id)}return id}
if(!S.userId)S.userId=makeLocalId();

function save(){localStorage.setItem(KEY,JSON.stringify(S));renderAll();}
function fmt(n){return Math.floor(n||0).toLocaleString("pt-BR")}
function escapeHtml(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[c]))}
function kitName(){return ({midnight:"MIDNIGHT",aurora:"AURORA",royal:"ROYAL",neon:"NEON"})[S.kit]||"MIDNIGHT"}
function renderAll(){
 $("gold").textContent=fmt(S.gold);$("gems").textContent=fmt(S.gems);$("wins").textContent=S.wins;$('ovr').textContent=S.ovr;$('squadOvr').textContent=S.ovr;$('chemistry').textContent=S.chem+"/100";$('clubChem').textContent=S.chem;$('stadiumLevel').textContent=S.stadium;
 let done=(S.wins>=3)+(S.gold>=5000)+(S.ovr>=90)+(S.leg>0);$("seasonProgress").textContent=Math.round(done/4*100)+"%";
 $("missions").innerHTML=[["🏆","3 vitórias",Math.min(S.wins,3)+"/3"],["🪙","5.000 Gold",fmt(Math.min(S.gold,5000))+"/5k"],["⚡","90 OVR",Math.min(S.ovr,90)+"/90"],["💎","Lendária",S.leg?"1/1":"0/1"]].map(x=>`<div><b>${x[0]}</b><span>${x[1]}</span><strong>${x[2]}</strong></div>`).join("");
 renderPitch();renderBench();renderMarket();renderRank();renderAccount();renderProfileChip();
}
function show(id){document.querySelectorAll(".page,.game").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");$("nav").style.display=id==="game"?"none":"flex";const map={home:0,squad:1,packs:2,events:3,rank:4,account:5};document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));if(map[id]!=null)document.querySelectorAll("#nav button")[map[id]].classList.add("active")}
function card(p,mini=false){return `<div class="${mini?"miniCard":"playerCard"} ${p[3]}"><span class="rating">${p[2]}</span><span class="pos">${p[1]}</span><span class="name">${p[0]}</span><span class="chem"></span></div>`}
function renderPitch(){let pos={"4-3-3":[[50,11],[22,29],[50,25],[78,29],[31,48],[69,48],[50,50],[24,70],[50,67],[76,70],[50,88]],"4-2-3-1":[[50,11],[23,29],[50,29],[77,29],[26,50],[74,50],[32,38],[50,43],[68,38],[50,63],[50,88]],"3-5-2":[[35,20],[65,20],[50,31],[20,44],[38,47],[50,38],[62,47],[80,44],[38,67],[62,67],[50,88]]}[formationName];$("pitch").innerHTML=players.slice(0,11).map((p,i)=>`<div style="left:${pos[i][0]}%;top:${pos[i][1]}%">${card(p)}</div>`).join("")}
function formation(f,b){formationName=f;document.querySelectorAll("#formationTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderPitch()}
function renderBench(){$("bench").innerHTML=players.slice(10).concat(market.slice(0,3)).map(p=>`<div class="mini">${card(p,true)}</div>`).join("")}
function renderMarket(){$("market").innerHTML=market.map(p=>card(p)).join("")}
function setRank(m,b){rankMode=m;document.querySelectorAll(".rankTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderRank()}
async function renderRank(){
 if(!onlineConfigured()||!supabaseClient){return renderLocalRank()}
 const order={rating:"ovr",gold:"gold",wins:"wins",pens:"penalties"}[rankMode]||"rank_points";
 const {data,error}=await supabaseClient.from("global_leaderboard").select("public_id,display_name,club_name,kit,ovr,gold,wins,goals,penalties,rank_points").order(order,{ascending:false}).limit(50);
 if(error||!data||!data.length)return renderLocalRank();
 $("rankList").innerHTML=data.map((x,i)=>`<div class="rankRow ${x.public_id===S.userId?"me":""}"><span class="n">#${i+1}</span><b>${escapeHtml(x.club_name||x.display_name)}</b><strong>${rankMode==="rating"?"⚡ "+x.ovr:rankMode==="gold"?"🪙 "+fmt(x.gold):rankMode==="wins"?"🏆 "+x.wins:"🥅 "+x.penalties}</strong></div>`).join("")
}
function renderLocalRank(){let data=[["Shadow FC",96,128450,1432,840],["Nova United",94,121900,1366,770],["Golden XI",92,115700,1280,920],["Turbo Club",90,109300,1198,650],[S.club||"Pocket FC",S.ovr,S.gold,S.wins,S.pens]];let ix={rating:1,gold:2,wins:3,pens:4}[rankMode];data.sort((a,b)=>b[ix]-a[ix]);$("rankList").innerHTML=data.map((x,i)=>`<div class="rankRow ${x[0]===(S.club||"Pocket FC")?"me":""}"><span class="n">#${i+1}</span><b>${escapeHtml(x[0])}</b><strong>${rankMode==="rating"?"⚡ "+x[1]:rankMode==="gold"?"🪙 "+fmt(x[2]):rankMode==="wins"?"🏆 "+x[3]:"🥅 "+x[4]}</strong></div>`).join("")}
function renderProfileChip(){let name=escapeHtml(S.displayName||"Jogador");$("profileChip").innerHTML=`<button onclick="show('account')" class="profileBtn"><span class="profileInitial">${name.charAt(0).toUpperCase()}</span><b>${name}</b><small>${escapeHtml(S.userId)}</small></button>`}
function renderAccount(){if(!$('account'))return;let logged=!!S.email;$('accountLoginState').textContent=logged?"GOOGLE CONECTADO":"NÃO CONECTADO";$('accountName').textContent=S.displayName||"Jogador";$('accountEmail').textContent=S.email||"Entre com Google para salvar na nuvem";$('publicId').textContent=S.userId||makeLocalId();$('clubName').value=S.club||"Pocket FC";$('kitSelect').value=S.kit||"midnight";$('accountAvatar').innerHTML=`<span>${escapeHtml((S.displayName||"J").charAt(0).toUpperCase())}</span>`;$('statMatches').textContent=S.matches;$('statWins').textContent=S.wins;$('statGoals').textContent=S.goals;$('statPens').textContent=S.pens;$('statLosses').textContent=S.losses;$('statGold').textContent=fmt(S.gold);$('statOvr').textContent=S.ovr;$('kitPreview').className="kitPreview kit-"+S.kit;$('kitLabel').textContent=kitName();$('googleBtn').textContent=logged?"✓ GOOGLE CONECTADO":"ENTRAR COM GOOGLE";$('logoutBtn').style.display=logged?"block":"none"}
async function saveAccountSettings(){S.club=($('clubName').value||"Pocket FC").trim().slice(0,22);S.kit=$('kitSelect').value;save();if(supabaseClient&&S.email){const {error}=await supabaseClient.from('profiles').update({display_name:S.displayName||'Jogador',club_name:S.club,kit:S.kit,updated_at:new Date().toISOString()}).eq('id',S.userIdRaw);if(error)console.warn(error)}msg("💾 PERFIL ATUALIZADO")}
function openAuth(){ if(!onlineConfigured()){alert("Configure o Supabase em supabase-config.js primeiro.");return} $("authModal").classList.remove("hidden"); $("authEmail")?.focus(); }
function closeAuth(){ $("authModal")?.classList.add("hidden"); }
async function sendEmailCode(){
 if(!supabaseClient){alert("Ative a conta online primeiro.");return}
 const email=($("authEmail").value||"").trim().toLowerCase();
 if(!/^\S+@\S+\.\S+$/.test(email)){msg("Digite um e-mail válido");return}
 const {error}=await supabaseClient.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 if(error){alert("Não foi possível enviar o código: "+error.message);return}
 $("otpBox").classList.remove("hidden"); msg("📧 CÓDIGO ENVIADO");
}
async function verifyEmailCode(){
 if(!supabaseClient)return;
 const email=($("authEmail").value||"").trim().toLowerCase(); const token=($("authOtp").value||"").replace(/\D/g,"");
 if(token.length!==6){msg("Digite os 6 dígitos");return}
 const {data,error}=await supabaseClient.auth.verifyOtp({email,token,type:"email"});
 if(error){alert("Código inválido ou expirado: "+error.message);return}
 if(data.session){closeAuth(); await hydrateOnline(data.session.user); msg("✅ CONTA RECUPERADA");}
}
async function initAuth(){
 if(!onlineConfigured()){console.warn("Supabase não configurado: jogo em modo local.");return}
 supabaseClient=window.supabase.createClient(PFC_SUPABASE_CONFIG.url,PFC_SUPABASE_CONFIG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data:{session}}=await supabaseClient.auth.getSession();if(session)await hydrateOnline(session.user);
 supabaseClient.auth.onAuthStateChange(async(event,session)=>{if(session)await hydrateOnline(session.user);else {S=Object.assign({},defaultState,{userId:makeLocalId(),createdAt:Date.now()});save()}})
}
async function hydrateOnline(user){
 const {data:profile,error}=await supabaseClient.from('profiles').select('*').eq('id',user.id).single();
 if(error){console.warn('Perfil ainda não disponível',error);return}
 S=Object.assign({},defaultState,{...profile,userIdRaw:user.id,userId:profile.public_id,displayName:profile.display_name,email:user.email||"",club:profile.club_name,kit:profile.kit,stadium:profile.stadium_level,chem:profile.chemistry,pens:profile.penalties,rank:profile.rank_points});save();
}
async function loginGoogle(){
 if(!onlineConfigured()){alert('Configure o Supabase em supabase-config.js para ativar o Google.');return}
 const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname,queryParams:{access_type:'offline',prompt:'select_account'}}});
 if(error)alert('Não foi possível entrar com Google: '+error.message); else closeAuth();
}
async function logoutGoogle(){if(supabaseClient)await supabaseClient.auth.signOut();S=Object.assign({},defaultState,{userId:makeLocalId(),createdAt:Date.now()});save();msg('👋 SESSÃO ENCERRADA')}
async function syncMatchOnline(){
 if(!supabaseClient||!S.userIdRaw)return false;
 const {data,error}=await supabaseClient.rpc('record_match',{p_mode:game.mode,p_home:game.home,p_away:game.away,p_goals:game.goals,p_assists:game.assists||0,p_penalties:game.pens||0});
 if(error){console.warn('record_match:',error);return false}
 if(data?.profile){const p=data.profile;S=Object.assign(S,{gold:p.gold,gems:p.gems,wins:p.wins,losses:p.losses,draws:p.draws,matches:p.matches,goals:p.goals,assists:p.assists,pens:p.penalties,ovr:p.ovr,stadium:p.stadium_level,chem:p.chemistry,xp:p.xp,rank:p.rank_points})}return true
}

async function openPack(cost){
 if(supabaseClient&&S.userIdRaw){
   const {data,error}=await supabaseClient.rpc('open_pack',{p_cost:cost});
   if(error){msg(error.message.includes('insufficient')?'🪙 GOLD INSUFICIENTE':'⚠️ PACK NÃO DISPONÍVEL');return}
   const pulls=data||[];const best=pulls.reduce((a,b)=>b.ovr>a.ovr?b:a,pulls[0]);
   S.gold=Math.max(0,S.gold-cost);if(best&&best.rarity==='legendary')S.leg=1;S.ovr=Math.min(97,Math.max(S.ovr,Math.floor((S.ovr+best.ovr)/2)+1));S.chem=Math.min(100,S.chem+2);save();
   alert('🎁 PACK ABERTO!\n\n'+pulls.map(p=>`${p.player_name} • ${p.ovr} OVR • ${p.rarity.toUpperCase()}`).join('\n')+'\n\n⭐ MELHOR: '+best.player_name);return;
 }
 if(S.gold<cost){msg('GOLD INSUFICIENTE');return}S.gold-=cost;let n=cost>1000?5:3,pulls=[];for(let i=0;i<n;i++){let r=Math.random(),pool=r>.94?market.filter(x=>x[3]==='legendary'):r>.62?market.filter(x=>x[3]==='epic'):r>.25?market.filter(x=>x[3]==='rare'):market.filter(x=>x[3]==='common');if(!pool.length)pool=market;pulls.push(pool[Math.floor(Math.random()*pool.length)])}let best=pulls.reduce((a,b)=>b[2]>a[2]?b:a,pulls[0]);if(best[3]==='legendary')S.leg=1;S.ovr=Math.min(97,Math.max(S.ovr,Math.floor((S.ovr+best[2])/2)+1));S.chem=Math.min(100,S.chem+2);save();alert('🎁 PACK ABERTO!\n\n'+pulls.map(p=>`${p[0]} • ${p[2]} OVR • ${p[3].toUpperCase()}`).join('\n')+'\n\n⭐ MELHOR: '+best[0])
}
function upgradeStadium(){if(S.gold<1500){msg("Faltam Gold");return}S.gold-=1500;S.stadium++;S.chem=Math.min(100,S.chem+3);save();msg("🏟️ ESTÁDIO NÍVEL "+S.stadium)}
function startMatch(mode){show("game");game={mode,running:true,paused:false,t:0,home:0,away:0,pos:50,charge:0,charging:false,stamina:100,shots:0,goals:0,pens:0};$("score").textContent="0 — 0";$("timer").textContent="00:00";$("matchMode").textContent=mode.toUpperCase();$("gameMessage").textContent="";boot3D();initMatch()}
function initMatch(){if(!me)return;me.position.set(0,0,7);ball.position.set(0,.22,6.4);team.forEach((p,i)=>{p.position.set(-16+(i%5)*8,0,1+(i%2)*4)});rival.forEach((p,i)=>{p.position.set(-16+(i%5)*8,0,-2-(i%2)*5)})}
function pauseGame(){if(!game.running)return;game.paused=!game.paused;$("pausePanel").classList.toggle("hidden",!game.paused)}
function leaveGame(){game.running=false;show("home")}
async function finishGame(){game.running=false;let win=game.home>game.away;
 if(supabaseClient&&S.userIdRaw){const ok=await syncMatchOnline();if(!ok){msg("⚠️ FALHA AO SALVAR PARTIDA");return setTimeout(()=>show("home"),1300)}}
 else {S.matches++;S.goals+=game.goals;if(game.mode==="penalty")S.pens+=game.pens;if(win){S.wins++;S.gold+=game.mode==="cup"?1000:550;S.gems+=game.mode==="cup"?15:5;S.rank+=30}else{S.losses++;S.gold+=100;S.rank=Math.max(0,S.rank-10)}S.xp+=win?100:35;S.ovr=Math.min(99,S.ovr+(win&&Math.random()<.25?1:0))}
 save();msg(win?"🏆 VITÓRIA SALVA!":"FIM DE JOGO SALVO!");setTimeout(()=>show("home"),1300)}
function pass(){if(!game.running||game.paused)return;S.gold+=3;S.assists+=Math.random()<.12?1:0;msg("PASSE PRECISO +3")}
function throughPass(){if(!game.running||game.paused)return;S.gold+=6;S.assists+=Math.random()<.2?1:0;msg("PASSE EM PROFUNDIDADE +6")}
function sprint(){if(!game.running||game.paused)return;game.stamina=Math.max(0,game.stamina-20);msg("⚡ SPRINT")}
function skill(){if(!game.running||game.paused)return;game.stamina=Math.max(0,game.stamina-12);msg(Math.random()<.7?"✨ DRIBLE LIMPO!":"🧱 PERDEU A BOLA")}
function tackle(){if(!game.running||game.paused)return;msg(Math.random()<.65?"🛡️ DESARME!":"⚠️ FALTA!")}
function chargeShot(){if(!game.running||game.paused)return;game.charging=true;game.charge=5}
function releaseShot(){if(!game.charging)return;game.charging=false;let power=Math.min(100,game.charge);game.charge=0;shoot(power)}
function shoot(power){game.shots++;let chance=.32+power/190+(S.ovr-84)/250;if(Math.random()<chance){game.home++;game.goals++;S.gold+=90;msg("⚽ GOOOOOOL! +90");ball.position.z-=3}else msg(Math.random()<.5?"🧤 DEFESA!":"❌ NA TRAVE!");$("score").textContent=`${game.home} — ${game.away}`}
function msg(t){$("gameMessage").textContent=t;clearTimeout(window._msg);window._msg=setTimeout(()=>$('gameMessage').textContent="",1100)}
function mat(c,r=.8,m=0){return new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m})}
function cube(w,h,d,c){let m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.castShadow=true;m.receiveShadow=true;return m}
function makePlayer(c=0x141a23,s=1){let g=new THREE.Group(),body=cube(.42,.68,.28,c);body.position.y=.65;g.add(body);let head=new THREE.Mesh(new THREE.IcosahedronGeometry(.2,1),mat(0xeac09e));head.position.y=1.16;head.castShadow=true;g.add(head);let hair=cube(.3,.1,.3,0x22252b);hair.position.y=1.31;g.add(hair);[-.11,.11].forEach(x=>{let l=cube(.13,.43,.13,c);l.position.set(x,.2,0);g.add(l);let sh=cube(.18,.08,.28,0x101218);sh.position.set(x,-.05,-.06);g.add(sh)});g.scale.setScalar(s);return g}
function boot3D(){if(renderer)return;scene=new THREE.Scene();scene.background=new THREE.Color(0x6d9bb2);scene.fog=new THREE.Fog(0x6d9bb2,35,95);camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,300);renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;scene.add(new THREE.HemisphereLight(0xffffff,0x396b3e,2.1));let sun=new THREE.DirectionalLight(0xfff2d0,3);sun.position.set(-25,35,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);let field=cube(50,.22,32,0x287c3c);field.position.y=-.12;scene.add(field);for(let x=-25;x<25;x+=4){let stripe=cube(2,.02,32,x%8===0?0x2e8643:0x26753a);stripe.position.set(x,.01,0);scene.add(stripe)}fieldLines();stadium();me=makePlayer(0x101820,1.16);scene.add(me);ball=new THREE.Mesh(new THREE.SphereGeometry(.19,14,10),mat(0xf2f4f7,.35));ball.castShadow=true;scene.add(ball);for(let i=0;i<7;i++){let p=makePlayer(0x111820,.98);team.push(p);scene.add(p)}for(let i=0;i<7;i++){let p=makePlayer(0x2867c7,.98);rival.push(p);scene.add(p)}for(let i=0;i<20;i++){let p=new THREE.Mesh(new THREE.SphereGeometry(.035,6,6),mat(i%2?0xffffff:0x222222));p.position.set((Math.random()-.5)*50,1+Math.random()*3,17+Math.random()*2);scene.add(p)}initJoy();loop()}
function fieldLines(){let w=mat(0xffffff,.65),arr=[[50,.04,.1,0,.14,0],[.1,.04,32,-25,.14,0],[.1,.04,32,25,.14,0],[50,.04,.1,0,.14,-16],[50,.04,.1,0,.14,16],[.1,.04,10,-18,.14,0],[.1,.04,10,18,.14,0]];arr.forEach(a=>{let m=new THREE.Mesh(new THREE.BoxGeometry(a[0],a[1],a[2]),w);m.position.set(a[3],a[4],a[5]);scene.add(m)});let t=new THREE.Mesh(new THREE.TorusGeometry(3.3,.045,6,60),w);t.rotation.x=Math.PI/2;t.position.y=.15;scene.add(t)}
function stadium(){for(let side of [-1,1])for(let x=-25;x<=25;x+=1.5){let s=cube(1.05,3,.75,0x202a3a);s.position.set(x,1.5,side*18);scene.add(s)}for(let z=-16;z<=16;z+=1.5)for(let side of [-1,1]){let s=cube(.75,3,1.05,0x202a3a);s.position.set(side*27,1.5,z);scene.add(s)}let roof=cube(56,.45,1.5,0x131a25);roof.position.set(0,5,-19);scene.add(roof);for(let x=-18;x<=18;x+=12){let l=new THREE.PointLight(0xfff0cf,32,30);l.position.set(x,7,-13);scene.add(l)}}
function initJoy(){if(joyInit)return;joyInit=true;let j=$('joystick'),on=false,sx=0,sy=0;j.addEventListener('pointerdown',e=>{on=true;sx=e.clientX;sy=e.clientY;j.setPointerCapture(e.pointerId)});j.addEventListener('pointermove',e=>{if(!on)return;input.x=Math.max(-1,Math.min(1,(e.clientX-sx)/55));input.z=Math.max(-1,Math.min(1,(e.clientY-sy)/55))});j.addEventListener('pointerup',()=>{on=false;input.x=input.z=0});j.addEventListener('pointercancel',()=>{on=false;input.x=input.z=0})}
function loop(){renderer.setAnimationLoop(()=>{if(game.running&&!game.paused){let x=input.x,z=input.z;if(keys.w||keys.arrowup)z=-1;if(keys.s||keys.arrowdown)z=1;if(keys.a||keys.arrowleft)x=-1;if(keys.d||keys.arrowright)x=1;let sp=.085*(game.stamina>0?1:.55);me.position.x=Math.max(-23,Math.min(23,me.position.x+x*sp));me.position.z=Math.max(-14,Math.min(14,me.position.z+z*sp));if(x||z)me.rotation.y=Math.atan2(x,z);ball.position.x+=(me.position.x-ball.position.x)*.035;ball.position.z+=(me.position.z-ball.position.z)*.035;ball.rotation.x+=.09;ball.rotation.z+=.07;team.forEach((p,i)=>{p.position.x+=(me.position.x+(i-3)*3-p.position.x)*.003;p.position.z+=(me.position.z+((i%2)?-4:2)-p.position.z)*.003});rival.forEach((p,i)=>{p.position.x+=(me.position.x+(i-3)*3-p.position.x)*.002;p.position.z+=(me.position.z-6-p.position.z)*.002});camera.position.lerp(new THREE.Vector3(me.position.x,10.5,me.position.z+13),.055);camera.lookAt(me.position.x,0,me.position.z-3);game.stamina=Math.min(100,game.stamina+.035);if(game.charging){game.charge=Math.min(100,game.charge+2);$('power').firstElementChild.style.width=game.charge+"%"}else $('power').firstElementChild.style.width="0%";$('possession').textContent="POSSE "+Math.round(game.pos+(Math.random()*2-1))+"%";$('minimap i').style.left=(50+me.position.x/50*45)+"%";$('minimap i').style.top=(50+me.position.z/32*45)+"%"}renderer.render(scene,camera)})}
setInterval(()=>{if(game.running&&!game.paused){game.t++;$('timer').textContent=`${String(Math.floor(game.t/60)).padStart(2,"0")}:${String(game.t%60).padStart(2,"0")}`;if(game.t===10){game.away++;$('score').textContent=`${game.home} — ${game.away}`;msg("⚽ RIVAL MARCOU!")}if(game.t===20&&Math.random()<.65){game.home++;game.goals++;S.gold+=120;$('score').textContent=`${game.home} — ${game.away}`;msg("⚽ CONTRA-ATAQUE! +120")}if(game.t===30&&game.mode!=="friendly"&&Math.random()<.55){game.pens++;game.home++;game.goals++;S.gold+=200;$('score').textContent=`${game.home} — ${game.away}`;msg("🥅 PÊNALTI CONVERTIDO! +200")}if(game.t>=42)finishGame()}},1000);
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key===' ')chargeShot();if(e.key==='Escape')pauseGame()});window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;if(e.key===' ')releaseShot()});window.addEventListener('resize',()=>{if(renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}});
renderAll();initAuth();

document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAuth()});


/* ===== PFC V10 CLUB UNIVERSE ===== */
let PFC_CLUBS = [];
async function pfcLoadClubs(){
  try { PFC_CLUBS = await fetch("clubs.json").then(r=>r.json()); } catch(e){ PFC_CLUBS=[]; }
}
function pfcOpenClubs(){
  const m=document.createElement("div"); m.className="clubsModal";
  m.innerHTML=`<div class="clubsPanel">
    <button class="closeProfile" onclick="this.closest('.clubsModal').remove()">×</button>
    <div class="clubHero"><div><small>CLUB UNIVERSE</small><h2>🌎 TIMES</h2><p>Brasil + grandes clubes do mundo</p></div><strong>${PFC_CLUBS.length}</strong></div>
    <div class="clubFilters">
      <button class="active" onclick="pfcFilterClubs('ALL',this)">Todos</button>
      <button onclick="pfcFilterClubs('BR',this)">🇧🇷 Brasil</button>
      <button onclick="pfcFilterClubs('EU',this)">🇪🇺 Europa</button>
      <button onclick="pfcFilterClubs('SA',this)">🌎 América do Sul</button>
      <button onclick="pfcFilterClubs('OT',this)">🌍 Outros</button>
    </div>
    <input class="clubSearch" placeholder="Pesquisar time..." oninput="pfcSearchClubs(this.value)">
    <div id="clubGrid" class="clubGrid"></div>
  </div>`;
  document.body.appendChild(m); pfcRenderClubs(PFC_CLUBS);
}
function pfcRegion(x){
  if(x.code==="BR") return "BR";
  if(["AR","UY","CO","CL","EC","PY","PE"].includes(x.code)) return "SA";
  if(["ES","EN","DE","IT","FR","NL","PT","TR"].includes(x.code)) return "EU";
  return "OT";
}
function pfcRenderClubs(list){
  const g=document.getElementById("clubGrid"); if(!g)return;
  g.innerHTML=list.map(c=>`<button class="clubCard" onclick="pfcSelectClub('${escapeAttr(c.name)}')">
    <span class="clubBadge">${c.flag}</span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.country)}</small>
  </button>`).join("");
}
function pfcFilterClubs(region,el){
  document.querySelectorAll(".clubFilters button").forEach(x=>x.classList.remove("active")); el.classList.add("active");
  pfcRenderClubs(region==="ALL"?PFC_CLUBS:PFC_CLUBS.filter(c=>pfcRegion(c)===region));
}
function pfcSearchClubs(q){
  q=q.toLowerCase(); pfcRenderClubs(PFC_CLUBS.filter(c=>(c.name+" "+c.country).toLowerCase().includes(q)));
}
function pfcSelectClub(name){
  const a=pfcAccount(); a.club=name; pfcSaveAccount(a);
  const m=document.querySelector(".clubsModal"); if(m)m.remove();
  if(typeof pfcRenderHeader==="function")pfcRenderHeader();
}
window.pfcOpenClubs=pfcOpenClubs;
document.addEventListener("DOMContentLoaded",pfcLoadClubs);


/* ===== V11 CLUB CARDS / SQUAD COLLECTION ===== */
let PFC_CARDS=[];
async function pfcLoadCards(){try{PFC_CARDS=await fetch('club_cards.json').then(r=>r.json());}catch(e){PFC_CARDS=[]}}
function pfcCardHTML(c){return `<button class="ultimateCard ${c.rarity}" onclick="pfcUseClubCard('${escapeAttr(c.id)}')"><span class="cardClub">${c.flag} ${escapeHtml(c.club)}</span><span class="cardOvr">${c.ovr}</span><span class="cardPos">${c.position}</span><strong>${escapeHtml(c.player)}</strong><small>${c.rarity.toUpperCase()}</small></button>`}
function pfcOpenCollection(){
 const m=document.createElement('div');m.className='clubsModal';m.innerHTML=`<div class="clubsPanel cardCollectionPanel"><button class="closeProfile" onclick="this.closest('.clubsModal').remove()">×</button><div class="clubHero"><div><small>ULTIMATE SQUAD</small><h2>🃏 COLEÇÃO DE CARTAS</h2><p>Cartas ligadas aos clubes</p></div><strong>${PFC_CARDS.length}</strong></div><div class="clubFilters" id="cardClubFilters"><button class="active" onclick="pfcFilterCards('ALL',this)">Todos</button></div><input class="clubSearch" placeholder="Buscar jogador ou clube..." oninput="pfcSearchCards(this.value)"><div id="ultimateCardGrid" class="ultimateCardGrid"></div></div>`;document.body.appendChild(m);pfcBuildCardFilters();pfcRenderCards(PFC_CARDS)}
function pfcBuildCardFilters(){let box=document.getElementById('cardClubFilters');if(!box)return;let names=[...new Set(PFC_CARDS.map(x=>x.club))];box.innerHTML='<button class="active" onclick="pfcFilterCards(\'ALL\',this)">Todos</button>'+names.map(n=>`<button onclick="pfcFilterCards('${escapeAttr(n)}',this)">${escapeHtml(n)}</button>`).join('')}
function pfcRenderCards(list){let g=document.getElementById('ultimateCardGrid');if(g)g.innerHTML=list.map(pfcCardHTML).join('')||'<p class="emptyCards">Nenhuma carta encontrada.</p>'}
function pfcFilterCards(club,el){document.querySelectorAll('#cardClubFilters button').forEach(x=>x.classList.remove('active'));el.classList.add('active');pfcRenderCards(club==='ALL'?PFC_CARDS:PFC_CARDS.filter(c=>c.club===club))}
function pfcSearchCards(q){q=q.toLowerCase();pfcRenderCards(PFC_CARDS.filter(c=>(c.player+' '+c.club+' '+c.country).toLowerCase().includes(q)))}
function pfcUseClubCard(id){let c=PFC_CARDS.find(x=>x.id===id);if(!c)return;msg(`🃏 ${c.player} entrou no seu elenco • ${c.club}`);S.ovr=Math.max(S.ovr,Math.min(99,c.ovr));S.chem=Math.min(100,S.chem+1);save()}
window.pfcOpenCollection=pfcOpenCollection;window.pfcUseClubCard=pfcUseClubCard;
document.addEventListener('DOMContentLoaded',pfcLoadCards);


/* ===== PFC V12 PREMIUM CARDS ===== */
let PFC_PREMIUM_CARDS=[];
async function pfcLoadPremiumCards(){try{PFC_PREMIUM_CARDS=await fetch("players_premium.json").then(r=>r.json())}catch(e){}}
const PFC_RARITY_META={
  RARE:{label:"RARE",cls:"rare",glow:"✦"},
  EPIC:{label:"EPIC",cls:"epic",glow:"◆"},
  LEGEND:{label:"LEGEND",cls:"legend",glow:"★"},
  ICONIC:{label:"ICON",cls:"iconic",glow:"✦"}
};
function pfcCardHTML(c,compact=false){
  const r=PFC_RARITY_META[c.rarity]||PFC_RARITY_META.RARE;
  return `<article class="pfcCard ${r.cls} ${compact?'compact':''}" onclick="pfcOpenCard('${c.id}')">
    <div class="cardTop"><span class="ovr">${c.ovr}</span><span class="pos">${c.pos}</span><span class="rarity">${r.glow} ${r.label}</span></div>
    <div class="cardArt"><div class="playerSilhouette">${c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div class="clubMark">${escapeHtml(c.club.slice(0,3).toUpperCase())}</div></div>
    <div class="cardName">${escapeHtml(c.name)}</div>
    <div class="cardClub">${escapeHtml(c.club)} · ${escapeHtml(c.country)}</div>
    <div class="cardStats">
      <span><b>${c.speed}</b>SPD</span><span><b>${c.shooting}</b>SHO</span><span><b>${c.passing}</b>PAS</span>
      <span><b>${c.defense}</b>DEF</span><span><b>${c.physical}</b>PHY</span>
    </div>
  </article>`;
}
function pfcOpenCard(id){
  const c=PFC_PREMIUM_CARDS.find(x=>x.id===id); if(!c)return;
  const r=PFC_RARITY_META[c.rarity]||PFC_RARITY_META.RARE;
  const m=document.createElement("div");m.className="cardDetailModal";
  m.innerHTML=`<div class="cardDetailPanel">
   <button class="closeProfile" onclick="this.closest('.cardDetailModal').remove()">×</button>
   <div class="detailStage">${pfcCardHTML(c)}</div>
   <div class="detailInfo"><small>${r.glow} ${r.label}</small><h2>${escapeHtml(c.name)}</h2><b>${escapeHtml(c.club)} · ${escapeHtml(c.country)}</b>
   <div class="detailStats">
    <span>SPD <b>${c.speed}</b></span><span>SHO <b>${c.shooting}</b></span><span>PAS <b>${c.passing}</b></span>
    <span>DEF <b>${c.defense}</b></span><span>PHY <b>${c.physical}</b></span>
   </div>
   <button class="primary" onclick="pfcAddToSquad('${c.id}');this.textContent='ADICIONADO AO ELENCO ✓'">ADICIONAR AO ELENCO</button>
   </div></div>`;
  document.body.appendChild(m);
}
function pfcAddToSquad(id){
  const a=pfcAccount(); a.collection=a.collection||[];
  if(!a.collection.includes(id))a.collection.push(id);
  pfcSaveAccount(a);
}
function pfcOpenPremiumCollection(){
 const m=document.createElement("div");m.className="collectionModal";
 m.innerHTML=`<div class="collectionPanel"><button class="closeProfile" onclick="this.closest('.collectionModal').remove()">×</button>
 <div class="collectionHead"><div><small>ULTIMATE COLLECTION</small><h2>🃏 MINHA COLEÇÃO</h2></div><strong>${PFC_PREMIUM_CARDS.length}</strong></div>
 <div class="rarityTabs"><button class="active" onclick="pfcFilterCards('ALL',this)">TODAS</button><button onclick="pfcFilterCards('ICONIC',this)">ICON</button><button onclick="pfcFilterCards('LEGEND',this)">LEGEND</button><button onclick="pfcFilterCards('EPIC',this)">EPIC</button><button onclick="pfcFilterCards('RARE',this)">RARE</button></div>
 <div id="premiumCardGrid" class="premiumCardGrid"></div></div>`;
 document.body.appendChild(m);pfcRenderCards(PFC_PREMIUM_CARDS);
}
function pfcRenderCards(list){const g=document.getElementById("premiumCardGrid");if(g)g.innerHTML=list.map(c=>pfcCardHTML(c,true)).join("")}
function pfcFilterCards(r,el){document.querySelectorAll(".rarityTabs button").forEach(x=>x.classList.remove("active"));el.classList.add("active");pfcRenderCards(r==="ALL"?PFC_PREMIUM_CARDS:PFC_PREMIUM_CARDS.filter(c=>c.rarity===r))}
window.pfcOpenPremiumCollection=pfcOpenPremiumCollection;
window.pfcOpenCard=pfcOpenCard;
window.pfcAddToSquad=pfcAddToSquad;
document.addEventListener("DOMContentLoaded",pfcLoadPremiumCards);


/* ===== PFC V13 3D FLIP CARDS ===== */
function pfcOpen3DPack(count=5){
  const pool=PFC_PREMIUM_CARDS||[];
  if(!pool.length){setTimeout(()=>pfcOpen3DPack(count),400);return}
  const chosen=[...pool].sort(()=>Math.random()-0.5).slice(0,count);
  const m=document.createElement("div");m.className="pack3DModal";
  m.innerHTML=`<div class="pack3DPanel">
    <button class="closeProfile" onclick="this.closest('.pack3DModal').remove()">×</button>
    <div class="packTitle"><small>POCKET FOOTBALL FC</small><h2>✨ PACK OPENING</h2><p>Toque nas cartas para revelar o verso.</p></div>
    <div class="packStage">${chosen.map((c,i)=>pfc3DCardHTML(c,i)).join("")}</div>
    <button class="primary" onclick="pfcRevealAll()">REVELAR TODAS</button>
  </div>`;
  document.body.appendChild(m);
}
function pfc3DCardHTML(c,i){
 const r=PFC_RARITY_META[c.rarity]||PFC_RARITY_META.RARE;
 return `<div class="flipWrap" data-index="${i}" onclick="pfcFlipCard(this)">
   <div class="flipCard ${r.cls}">
    <div class="flipFace flipBack"><div class="packLogo">PFC</div><div class="packStar">✦</div><b>POCKET<br>FOOTBALL<br>FC</b><small>TOQUE PARA REVELAR</small></div>
    <div class="flipFace flipFront">${pfcCardHTML(c)}</div>
   </div>
 </div>`;
}
function pfcFlipCard(el){el.classList.toggle("flipped")}
function pfcRevealAll(){document.querySelectorAll(".flipWrap").forEach((x,i)=>setTimeout(()=>x.classList.add("flipped"),i*120))}
window.pfcOpen3DPack=pfcOpen3DPack;
window.pfcFlipCard=pfcFlipCard;
window.pfcRevealAll=pfcRevealAll;

/* ===== PFC V14 CINEMATIC PACK ===== */
function pfcOpenCinematicPack(){
 const pool=PFC_PREMIUM_CARDS||[]; if(!pool.length){setTimeout(pfcOpenCinematicPack,400);return}
 const legendary=pool.filter(c=>c.rarity==="LEGEND"||c.rarity==="ICONIC");
 const center=(legendary.length?legendary:pool)[Math.floor(Math.random()*(legendary.length?legendary.length:pool.length))];
 const side=pool.filter(c=>c.id!==center.id).sort(()=>Math.random()-0.5).slice(0,4);
 const m=document.createElement("div");m.className="cinematicPack";
 m.innerHTML=`<div class="stadiumLights"></div><div class="particleField"></div>
 <div class="cinematicHUD"><span>POCKET FOOTBALL FC</span><b>ULTIMATE PACK</b><small>REVELAÇÃO ESPECIAL</small></div>
 <div class="cameraGlow"></div>
 <div class="cinematicCards">${side.map((c,i)=>`<div class="sideReveal s${i}">${pfcCardHTML(c,true)}</div>`).join("")}
 <div class="heroReveal"><div class="heroSpin">${pfcCardHTML(center)}</div><div class="rarityBurst">✦ ${PFC_RARITY_META[center.rarity]?.label||"LEGEND"} ✦</div></div></div>
 <div class="cinematicBottom"><div><small>NOVA CARTA</small><strong>${escapeHtml(center.name)}</strong><span>${escapeHtml(center.club)} · OVR ${center.ovr}</span></div><button class="primary" onclick="this.closest('.cinematicPack').remove()">CONTINUAR</button></div>
 <button class="cinClose" onclick="this.closest('.cinematicPack').remove()">×</button>`;
 document.body.appendChild(m);
 setTimeout(()=>m.classList.add("show"),50);
}
window.pfcOpenCinematicPack=pfcOpenCinematicPack;


/* ===== PFC V15 — 3D STADIUM + PLAYABLE MATCH ===== */
const PFC15 = {
  canvas:null, ctx:null, raf:0, last:0, running:false,
  keys:{}, touch:{x:0,y:0,active:false}, score:[0,0], time:0,
  ball:{x:0,y:0,vx:0,vy:0}, selected:null, team:null,
  players:[], opponents:[], message:"", messageT:0
};
function pfc15Clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function pfc15OpenMatch(){
  if(PFC15.running) return;
  const a=typeof pfcAccount==="function"?pfcAccount():{club:"Flamengo",collection:[]};
  const pool=(window.PFC_PREMIUM_CARDS||[]);
  const owned=(a.collection||[]).map(id=>pool.find(c=>c.id===id)).filter(Boolean);
  const team=(owned.length?owned:pool).slice(0,11);
  const m=document.createElement("div");m.className="match3DModal";
  m.innerHTML=`<div class="matchTop"><div><small>POCKET FOOTBALL FC</small><b>${escapeHtml(a.club||"MEU CLUBE")}</b></div>
    <div class="scoreboard"><strong id="mScore">0 — 0</strong><span id="mClock">00:00</span></div>
    <button onclick="pfc15CloseMatch()">×</button></div>
    <canvas id="pfcMatchCanvas"></canvas>
    <div class="matchControls"><div class="joystick" id="pfcJoy"><i></i></div>
      <div class="actions"><button id="mPass">PASS</button><button id="mShoot">CHUTE</button><button id="mSprint">SPRINT</button></div>
    </div>
    <div class="matchToast" id="mToast"></div>`;
  document.body.appendChild(m);
  PFC15.canvas=document.getElementById("pfcMatchCanvas");PFC15.ctx=PFC15.canvas.getContext("2d");
  PFC15.team=team; pfc15Init(); pfc15Resize(); window.addEventListener("resize",pfc15Resize);
  PFC15.running=true;PFC15.last=performance.now();PFC15.raf=requestAnimationFrame(pfc15Loop);
  pfc15BindControls();
}
function pfc15CloseMatch(){
  PFC15.running=false;cancelAnimationFrame(PFC15.raf);
  window.removeEventListener("resize",pfc15Resize);
  const el=document.querySelector(".match3DModal");if(el)el.remove();
}
function pfc15Resize(){
  if(!PFC15.canvas)return;
  const d=Math.min(devicePixelRatio||1,2),r=PFC15.canvas.getBoundingClientRect();
  PFC15.canvas.width=r.width*d;PFC15.canvas.height=r.height*d;PFC15.ctx.setTransform(d,0,0,d,0,0);
}
function pfc15Init(){
  PFC15.score=[0,0];PFC15.time=0;PFC15.message="";PFC15.messageT=0;
  const names=(PFC15.team||[]).map(c=>c.name);
  const form=[[0,-.75],[0,-.35],[-.38,-.32],[.38,-.32],[-.55,.02],[0,.04],[.55,.02],[-.32,.36],[.32,.36],[-.42,.68],[.42,.68]];
  PFC15.players=form.map((p,i)=>({x:p[0],y:p[1],tx:p[0],ty:p[1],name:names[i]||`Jogador ${i+1}`,ovr:(PFC15.team[i]||{}).ovr||78}));
  PFC15.opponents=form.map((p,i)=>({x:-p[0],y:-p[1],tx:-p[0],ty:-p[1],name:`CPU ${i+1}`,ovr:80}));
  PFC15.ball={x:0,y:.35,vx:0,vy:0};
}
function pfc15BindControls(){
  const joy=document.getElementById("pfcJoy"), knob=joy.querySelector("i");
  const set=(e)=>{
    const r=joy.getBoundingClientRect(),pt=e.touches?e.touches[0]:e;
    let x=pt.clientX-(r.left+r.width/2),y=pt.clientY-(r.top+r.height/2),l=Math.hypot(x,y)||1;
    x=pfc15Clamp(x/45,-1,1);y=pfc15Clamp(y/45,-1,1);PFC15.touch={x,y,active:true};
    knob.style.transform=`translate(${x*28}px,${y*28}px)`;
  };
  joy.addEventListener("pointerdown",e=>{joy.setPointerCapture(e.pointerId);set(e)});
  joy.addEventListener("pointermove",e=>{if(PFC15.touch.active)set(e)});
  joy.addEventListener("pointerup",()=>{PFC15.touch={x:0,y:0,active:false};knob.style.transform=""});
  const pass=()=>pfc15Action("pass"),shoot=()=>pfc15Action("shoot"),sprint=()=>pfc15Action("sprint");
  document.getElementById("mPass").onclick=pass;document.getElementById("mShoot").onclick=shoot;document.getElementById("mSprint").onclick=sprint;
  window.addEventListener("keydown",pfc15Key);window.addEventListener("keyup",e=>PFC15.keys[e.key.toLowerCase()]=false);
}
function pfc15Key(e){PFC15.keys[e.key.toLowerCase()]=true;if(e.code==="Space")pfc15Action("shoot");if(e.key.toLowerCase()==="e")pfc15Action("pass")}
function pfc15Action(kind){
  const p=PFC15.players[5]||PFC15.players[0],b=PFC15.ball;
  if(kind==="pass"){b.vx=(p.x-b.x)*.08;b.vy=(p.y-b.y)*.08;pfc15Toast("PASSE!")}
  if(kind==="shoot"){b.vx=(0-b.x)*.10;b.vy=(-1.05-b.y)*.12;pfc15Toast("CHUTE POTENTE!")}
  if(kind==="sprint"){p.tx=pfc15Clamp(p.x+.12,-.9,.9);p.ty=pfc15Clamp(p.y-.08,-.95,.95);pfc15Toast("SPRINT")}
}
function pfc15Toast(t){PFC15.message=t;PFC15.messageT=1.2;const e=document.getElementById("mToast");if(e)e.textContent=t}
function pfc15Loop(now){
  if(!PFC15.running)return;
  const dt=Math.min(.04,(now-PFC15.last)/1000);PFC15.last=now;PFC15.time+=dt;
  pfc15Update(dt);pfc15Draw();
  PFC15.raf=requestAnimationFrame(pfc15Loop);
}
function pfc15Update(dt){
  const p=PFC15.players[5]||PFC15.players[0], k=PFC15.keys;
  let dx=(k.d||k.arrowright?1:0)-(k.a||k.arrowleft?1:0),dy=(k.s||k.arrowdown?1:0)-(k.w||k.arrowup?1:0);
  if(PFC15.touch.active){dx=PFC15.touch.x;dy=PFC15.touch.y}
  const speed=(k.shift?0.65:.42)*dt;
  p.x=pfc15Clamp(p.x+dx*speed,-.88,.88);p.y=pfc15Clamp(p.y+dy*speed,-.95,.95);
  PFC15.ball.x+=PFC15.ball.vx;PFC15.ball.y+=PFC15.ball.vy;PFC15.ball.vx*=.92;PFC15.ball.vy*=.92;
  if(Math.abs(PFC15.ball.x)>.95){PFC15.ball.x=pfc15Clamp(PFC15.ball.x,-.95,.95);PFC15.ball.vx*=-.6}
  if(Math.abs(PFC15.ball.y)>1.08){
    if(PFC15.ball.y<0)PFC15.score[0]++;else PFC15.score[1]++;
    PFC15.ball={x:0,y:0,vx:0,vy:0};p.x=0;p.y=.35;pfc15Toast(PFC15.score[0]>PFC15.score[1]?"GOOOOL! ⚽":"GOL DO ADVERSÁRIO");
  }
  // Soft AI movement.
  PFC15.opponents.forEach((o,i)=>{o.x+=(o.tx-o.x)*dt*1.3;o.y+=(o.ty-o.y)*dt*1.3});
  const sc=document.getElementById("mScore"),cl=document.getElementById("mClock");
  if(sc)sc.textContent=`${PFC15.score[0]} — ${PFC15.score[1]}`;
  if(cl){let s=Math.floor(PFC15.time),mm=String(Math.floor(s/60)).padStart(2,"0"),ss=String(s%60).padStart(2,"0");cl.textContent=`${mm}:${ss}`}
  if(PFC15.messageT>0){PFC15.messageT-=dt;if(PFC15.messageT<=0)PFC15.message=""}
}
function pfc15Project(x,y,w,h){
  // Camera-like perspective: distant midfield is narrower/higher.
  const t=(y+1)/2, scale=.62+.55*t;
  return {x:w/2+x*(w*.43)*scale,y:h*.53+y*(h*.42)*scale,s:scale};
}
function pfc15Draw(){
 const c=PFC15.canvas,ctx=PFC15.ctx,w=c.clientWidth,h=c.clientHeight;ctx.clearRect(0,0,w,h);
 // Stadium night sky.
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#03050c");g.addColorStop(.45,"#111b2c");g.addColorStop(1,"#02050a");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 // floodlights
 [[.08,.15],[.92,.15]].forEach(q=>{const lg=ctx.createRadialGradient(q[0]*w,q[1]*h,2,q[0]*w,q[1]*h,w*.35);lg.addColorStop(0,"#fff8ddaa");lg.addColorStop(1,"transparent");ctx.fillStyle=lg;ctx.beginPath();ctx.arc(q[0]*w,q[1]*h,w*.35,0,Math.PI*2);ctx.fill()});
 // stands
 ctx.fillStyle="#080d15";ctx.beginPath();ctx.moveTo(0,h*.15);ctx.lineTo(w,h*.15);ctx.lineTo(w,h*.42);ctx.lineTo(0,h*.42);ctx.fill();
 for(let i=0;i<70;i++){ctx.fillStyle=i%3?"#263248":"#d4b95a";ctx.globalAlpha=.15+(i%5)/20;ctx.fillRect((i*97)%w,h*.22+((i*31)%80),3,3)}ctx.globalAlpha=1;
 // pitch polygon
 const p1={x:w*.19,y:h*.88},p2={x:w*.81,y:h*.88},p3={x:w*.61,y:h*.36},p4={x:w*.39,y:h*.36};
 const pg=ctx.createLinearGradient(0,h*.36,0,h*.88);pg.addColorStop(0,"#183d31");pg.addColorStop(1,"#0c241d");ctx.fillStyle=pg;ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.closePath();ctx.fill();
 ctx.strokeStyle="#ffffff88";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.closePath();ctx.stroke();
 // pitch stripes and halfway line
 for(let i=1;i<9;i++){let t=i/9,y=h*(.36+t*.52);ctx.strokeStyle="#ffffff0c";ctx.beginPath();ctx.moveTo(w*(.39-t*.20),y);ctx.lineTo(w*(.61+t*.20),y);ctx.stroke()}
 ctx.beginPath();ctx.moveTo(w*.5,h*.36);ctx.lineTo(w*.5,h*.88);ctx.stroke();
 ctx.beginPath();ctx.arc(w*.5,h*.62,w*.08,0,Math.PI*2);ctx.stroke();
 // players, far to near
 const objs=[...PFC15.opponents.map(x=>({...x,enemy:true})),...PFC15.players.map((x,i)=>({...x,enemy:false,selected:i===5}))].sort((a,b)=>a.y-b.y);
 objs.forEach(o=>{const q=pfc15Project(o.x,o.y,w,h);pfc15DrawPlayer(ctx,q,o)});
 const b=pfc15Project(PFC15.ball.x,PFC15.ball.y,w,h);ctx.fillStyle="#f5f2df";ctx.beginPath();ctx.arc(b.x,b.y,5*b.s,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#222";ctx.stroke();
 if(PFC15.message){ctx.font="900 22px Arial";ctx.textAlign="center";ctx.fillStyle="#ffd35c";ctx.fillText(PFC15.message,w/2,h*.27)}
}
function pfc15DrawPlayer(ctx,q,o){
 ctx.save();ctx.translate(q.x,q.y);
 ctx.globalAlpha=o.enemy?.9:1;
 // shadow
 ctx.fillStyle="#0008";ctx.beginPath();ctx.ellipse(0,14*q.s,15*q.s,5*q.s,0,0,Math.PI*2);ctx.fill();
 // body + head
 ctx.fillStyle=o.enemy?"#b83b43":"#e8e0c8";ctx.beginPath();ctx.arc(0,-15*q.s,7*q.s,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=o.enemy?"#6e1f2a":"#c58b35";ctx.fillRect(-9*q.s,-7*q.s,18*q.s,23*q.s);
 ctx.fillStyle=o.enemy?"#e94e59":"#1d2534";ctx.fillRect(-10*q.s,15*q.s,7*q.s,13*q.s);ctx.fillRect(3*q.s,15*q.s,7*q.s,13*q.s);
 if(o.selected&&!o.enemy){ctx.strokeStyle="#ffd35c";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,25*q.s,0,Math.PI*2);ctx.stroke()}
 ctx.fillStyle="#fff";ctx.font=`900 ${Math.max(7,8*q.s)}px Arial`;ctx.textAlign="center";ctx.fillText(String(o.ovr),0,38*q.s);
 ctx.restore();
}

/* ===== PFC V16 ULTIMATE SYSTEMS ===== */
const PFC16={
  selected:5, formation:"4-3-3", stamina:100, possession:50,
  coins:12500, gems:850, wins:0, goals:0, penalties:0,
  season:{xp:0,level:1}, chemistry:0, events:[], audio:true
};
function pfc16Account(){
  const a=typeof pfcAccount==="function"?pfcAccount():{};
  a.coins=a.coins??12500;a.gems=a.gems??850;a.wins=a.wins??0;a.goals=a.goals??0;
  a.penalties=a.penalties??0;a.xp=a.xp??0;a.level=a.level??1;a.chemistry=a.chemistry??0;
  a.formation=a.formation||"4-3-3";a.dailyClaim=a.dailyClaim||"";
  return a;
}
function pfc16Save(a){if(typeof pfcSaveAccount==="function")pfcSaveAccount(a)}
function pfc16Toast(t){let e=document.getElementById("pfc16Toast");if(!e){e=document.createElement("div");e.id="pfc16Toast";e.className="pfc16Toast";document.body.appendChild(e)}e.textContent=t;e.classList.add("on");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("on"),2200)}
function pfc16AddStats(win,goals,penalties){
 const a=pfc16Account();a.wins+=win?1:0;a.goals+=goals;a.penalties+=penalties;
 a.xp+=(win?150:60)+goals*20; a.level=1+Math.floor(a.xp/1000);pfc16Save(a);
}
function pfc16Dashboard(){
 const a=pfc16Account(),pool=window.PFC_PREMIUM_CARDS||[],owned=(a.collection||[]).map(id=>pool.find(c=>c.id===id)).filter(Boolean);
 const avg=owned.length?Math.round(owned.reduce((s,c)=>s+c.ovr,0)/owned.length):78;
 const m=document.createElement("div");m.className="dashModal";
 m.innerHTML=`<div class="dashPanel"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button>
 <div class="dashHero"><div><small>POCKET FOOTBALL FC</small><h1>ULTIMATE HUB</h1><p>Seu clube • sua coleção • sua temporada</p></div><div class="dashLevel"><span>NÍVEL</span><b>${a.level}</b><small>${a.xp%1000}/1000 XP</small></div></div>
 <div class="statGrid"><div><b>${a.coins.toLocaleString()}</b><span>🪙 GOLD</span></div><div><b>${a.gems}</b><span>💎 GEMAS</span></div><div><b>${a.wins}</b><span>🏆 VITÓRIAS</span></div><div><b>${a.goals}</b><span>⚽ GOLS</span></div><div><b>${a.penalties}</b><span>🥅 PÊNALTIS</span></div><div><b>${owned.length}</b><span>🃏 CARTAS</span></div><div><b>${avg}</b><span>⭐ OVR MÉDIO</span></div><div><b>${a.chemistry||0}</b><span>🔗 QUÍMICA</span></div></div>
 <div class="dashActions"><button onclick="pfcOpenPremiumCollection()">🃏 COLEÇÃO</button><button onclick="pfc15OpenMatch()">⚽ PARTIDA</button><button onclick="pfc16Daily()">🎁 RECOMPENSA DIÁRIA</button><button onclick="pfc16Squad()">👕 ELENCO</button></div>
 </div>`;document.body.appendChild(m);
}
function pfc16Daily(){
 const a=pfc16Account(),today=new Date().toISOString().slice(0,10);
 if(a.dailyClaim===today){pfc16Toast("Recompensa de hoje já resgatada ✓");return}
 a.dailyClaim=today;a.coins+=500;a.gems+=25;a.xp+=100;pfc16Save(a);pfc16Toast("🎁 +500 Gold  +25 Gemas  +100 XP!");
}
function pfc16Squad(){
 const a=pfc16Account(),pool=window.PFC_PREMIUM_CARDS||[],owned=(a.collection||[]).map(id=>pool.find(c=>c.id===id)).filter(Boolean);
 const m=document.createElement("div");m.className="squadModal";m.innerHTML=`<div class="squadPanel"><button class="closeProfile" onclick="this.closest('.squadModal').remove()">×</button><small>TACTICAL CENTER</small><h2>👕 ELENCO</h2><div class="formationRow"><button onclick="pfc16Formation('4-3-3')">4-3-3</button><button onclick="pfc16Formation('4-4-2')">4-4-2</button><button onclick="pfc16Formation('3-5-2')">3-5-2</button><button onclick="pfc16Formation('4-2-3-1')">4-2-3-1</button></div><div class="miniPitch"><div class="pitchLine"></div>${owned.slice(0,11).map((c,i)=>`<div class="miniPlayer mp${i}"><b>${c.ovr}</b><span>${escapeHtml(c.name.split(" ").slice(-1)[0])}</span></div>`).join("")}</div><p>Química calculada automaticamente por clube, país e posição.</p></div>`;document.body.appendChild(m)
}
function pfc16Formation(f){const a=pfc16Account();a.formation=f;pfc16Save(a);pfc16Toast("Formação alterada para "+f);document.querySelector(".squadModal")?.remove();pfc16Squad()}
function pfc16Penalty(){
 const a=pfc16Account();const target=Math.random();const hit=Math.random();
 a.penalties++;if(hit>.27){a.goals++;a.coins+=150;pfc16Save(a);pfc16Toast("🥅 GOOOOL DE PÊNALTI! +150 Gold")}else{pfc16Save(a);pfc16Toast("🧤 DEFENDEU!")}
}
function pfc16OpenTop(){
 const a=pfc16Account(),rows=[["Você",a.wins,a.goals,a.coins],["NeymarFC",31,88,42000],["RubroNegro",28,76,38500],["Galatico",26,70,35200],["BlueMoon",24,65,31800],["TheKing",22,59,29400]];
 rows.sort((x,y)=>y[1]-x[1]);
 const m=document.createElement("div");m.className="dashModal";m.innerHTML=`<div class="dashPanel"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button><small>GLOBAL RANKING</small><h2>🌎 TOP GLOBAL</h2><div class="leaderRows">${rows.map((r,i)=>`<div><strong>#${i+1}</strong><b>${escapeHtml(r[0])}</b><span>🏆 ${r[1]} &nbsp; ⚽ ${r[2]} &nbsp; 🪙 ${r[3].toLocaleString()}</span></div>`).join("")}</div></div>`;document.body.appendChild(m)
}
window.pfc16Dashboard=pfc16Dashboard;window.pfc16Daily=pfc16Daily;window.pfc16Squad=pfc16Squad;window.pfc16Formation=pfc16Formation;window.pfc16Penalty=pfc16Penalty;window.pfc16OpenTop=pfc16OpenTop;

/* ===== V17 BACKEND BRIDGE ===== */
const PFC17={token:localStorage.getItem("pfc_token")||"",config:null};
async function pfc17Init(){try{PFC17.config=await fetch("/api/config").then(r=>r.json())}catch{}}
function pfc17Headers(){return PFC17.token?{"Authorization":"Bearer "+PFC17.token,"Content-Type":"application/json"}:{"Content-Type":"application/json"}}
async function pfc17Me(){if(!PFC17.token)return null;const r=await fetch("/api/me",{headers:pfc17Headers()});if(!r.ok){PFC17.token="";localStorage.removeItem("pfc_token");return null}return (await r.json()).profile}
async function pfc17GoogleCredential(credential){const r=await fetch("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential})});const j=await r.json();if(!r.ok)throw Error(j.error||"login failed");PFC17.token=j.token;localStorage.setItem("pfc_token",PFC17.token);return j.profile}
async function pfc17SaveResult(home,away,penalties=0){if(!PFC17.token)return;return fetch("/api/match/result",{method:"POST",headers:pfc17Headers(),body:JSON.stringify({homeScore:home,awayScore:away,penalties})}).then(r=>r.json())}
async function pfc17Leaderboard(){return fetch("/api/leaderboard",{headers:pfc17Headers()}).then(r=>r.json())}
function pfc17LoginDemo(){pfc16Toast(PFC17.config?.googleEnabled?"Use o botão Google para entrar.":"Backend pronto: configure GOOGLE_CLIENT_ID no .env para ativar Google.");}
window.pfc17Init=pfc17Init;window.pfc17GoogleCredential=pfc17GoogleCredential;window.pfc17SaveResult=pfc17SaveResult;window.pfc17Leaderboard=pfc17Leaderboard;
document.addEventListener("DOMContentLoaded",pfc17Init);

/* ===== FINAL ADMIN + SHOP SPACE ===== */
function pfcFinalShop(){
 const m=document.createElement("div");m.className="dashModal";
 m.innerHTML=`<div class="dashPanel shopBlank"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button><small>MARKETPLACE</small><h2>🛒 LOJA</h2><div class="shopEmpty"><strong>EM BREVE</strong><span>Este espaço já está reservado para packs, cartas, uniformes, estádios e itens cosméticos.</span></div></div>`;
 document.body.appendChild(m)
}
async function pfcFinalAdmin(){
 try{
  const r=await fetch("/api/admin/overview",{headers:pfc17Headers()});if(!r.ok){pfc16Toast("Acesso ADM negado");return}
  const o=await r.json(),u=await fetch("/api/admin/users",{headers:pfc17Headers()}).then(x=>x.json());
  const m=document.createElement("div");m.className="adminModal";
  m.innerHTML=`<div class="adminPanel"><button class="closeProfile" onclick="this.closest('.adminModal').remove()">×</button>
  <div class="adminHead"><div><small>PRIVATE CONTROL CENTER</small><h1>🛡️ PAINEL ADM</h1><span>Controle central do jogo</span></div><div class="adminBadges"><b>${o.users}</b><small>USUÁRIOS</small><b>${o.activeUsers}</b><small>ONLINE</small></div></div>
  <div class="adminCards"><div><b>${o.users}</b><span>CONTAS</span></div><div><b>${o.banned}</b><span>BANIDOS</span></div><div><b>${o.matches}</b><span>PARTIDAS</span></div><div><b>${o.config.maintenance}</b><span>MANUTENÇÃO</span></div></div>
  <div class="adminTabs"><button onclick="pfcFinalAdminConfig()">⚙️ CONFIG</button><button onclick="pfcFinalAdminUsers()">👥 USUÁRIOS</button><button onclick="pfcFinalAdminAnnounce()">📢 AVISOS</button><button onclick="pfcFinalAdminAudit()">📜 LOGS</button></div>
  <div id="adminContent"><h3>CONTROLES RÁPIDOS</h3><p>Use as abas para administrar economia, acesso, usuários e eventos.</p></div></div>`;
  document.body.appendChild(m);
 }catch(e){pfc16Toast("Não foi possível abrir o ADM")}
}
function pfcFinalAdminConfig(){
 const c=document.getElementById("adminContent");if(!c)return;
 c.innerHTML=`<h3>⚙️ CONFIGURAÇÕES</h3><label><input id="admMaint" type="checkbox"> Modo manutenção</label><label><input id="admMatch" type="checkbox" checked> Matchmaking</label><label><input id="admShop" type="checkbox"> Loja ativa</label><button class="adminSave" onclick="pfcFinalSaveConfig()">SALVAR</button>`;
}
async function pfcFinalSaveConfig(){
 const body={maintenance:document.getElementById("admMaint").checked,matchmaking:document.getElementById("admMatch").checked,shop:document.getElementById("admShop").checked};
 const r=await fetch("/api/admin/config",{method:"POST",headers:pfc17Headers(),body:JSON.stringify(body)});pfc16Toast(r.ok?"Configuração salva ✓":"Falha ao salvar")
}
function pfcFinalAdminUsers(){
 const c=document.getElementById("adminContent");if(!c)return;
 fetch("/api/admin/users",{headers:pfc17Headers()}).then(r=>r.json()).then(j=>{
  c.innerHTML="<h3>👥 USUÁRIOS</h3><div class='adminUserList'>"+j.rows.slice(0,80).map(u=>`<div><b>${escapeHtml(u.name||"Player")}</b><span>${u.id} • 🏆${u.wins} • ⚽${u.goals}</span><button onclick="pfcFinalBan('${u.id}',${u.banned?0:1})">${u.banned?"DESBANIR":"BANIR"}</button></div>`).join("")+"</div>"
 })
}
async function pfcFinalBan(id,banned){const r=await fetch("/api/admin/user/"+encodeURIComponent(id),{method:"POST",headers:pfc17Headers(),body:JSON.stringify({banned:!!banned})});pfc16Toast(r.ok?"Alterado ✓":"Falha");if(r.ok)pfcFinalAdminUsers()}
function pfcFinalAdminAnnounce(){
 const c=document.getElementById("adminContent");if(!c)return;
 c.innerHTML=`<h3>📢 AVISO GLOBAL</h3><input id="admTitle" placeholder="Título"><textarea id="admBody" placeholder="Mensagem para todos os jogadores"></textarea><button class="adminSave" onclick="pfcFinalSendAnnouncement()">PUBLICAR</button>`
}
async function pfcFinalSendAnnouncement(){const r=await fetch("/api/admin/announcement",{method:"POST",headers:pfc17Headers(),body:JSON.stringify({title:document.getElementById("admTitle").value,body:document.getElementById("admBody").value})});pfc16Toast(r.ok?"Aviso publicado ✓":"Falha")}
async function pfcFinalAdminAudit(){const c=document.getElementById("adminContent");if(!c)return;const j=await fetch("/api/admin/audit",{headers:pfc17Headers()}).then(r=>r.json());c.innerHTML="<h3>📜 AUDITORIA</h3><div class='adminUserList'>"+j.rows.map(x=>`<div><b>${escapeHtml(x.action)}</b><span>${escapeHtml(x.actor_name||x.actor_id||"system")} • ${escapeHtml(x.detail||"")}</span></div>`).join("")+"</div>"}
window.pfcFinalShop=pfcFinalShop;window.pfcFinalAdmin=pfcFinalAdmin;window.pfcFinalAdminConfig=pfcFinalAdminConfig;window.pfcFinalAdminUsers=pfcFinalAdminUsers;window.pfcFinalAdminAnnounce=pfcFinalAdminAnnounce;window.pfcFinalAdminAudit=pfcFinalAdminAudit;window.pfcFinalSaveConfig=pfcFinalSaveConfig;window.pfcFinalSendAnnouncement=pfcFinalSendAnnouncement;window.pfcFinalBan=pfcFinalBan;

/* ===== V18 FULL MATCH HUD ===== */
const PFC18={match:null,score:[0,0],minute:0,paused:false,weather:"night",difficulty:"pro",camera:"broadcast"};
function pfc18OpenMatch(){
 const m=document.createElement("div");m.className="matchModal";
 m.innerHTML=`<div class="matchShell"><div class="stadiumTop"><span>🏟️ PFC STADIUM</span><span id="matchClock">00:00</span><span>DIVISION RIVALS</span></div>
 <div class="fullPitch"><div class="centerCircle"></div><div class="goal g1"></div><div class="goal g2"></div>
 ${Array.from({length:22},(_,i)=>`<div class="matchPlayer team${i<11?1:2} p${i}"><i>${i<11?(i+1):"AI"}</i></div>`).join("")}
 <div class="ball" id="matchBall"></div><div class="scoreboard"><b id="homeScore">0</b><span>—</span><b id="awayScore">0</b></div></div>
 <div class="matchBottom"><div class="miniInfo">⚡ STAMINA <b id="stamina">100%</b> &nbsp; 🔗 CHEM <b>92</b></div>
 <div class="matchControls"><button onclick="pfc18Action('pass')">PASS</button><button onclick="pfc18Action('shoot')">CHUTE</button><button onclick="pfc18Action('sprint')">SPRINT</button><button onclick="pfc18Action('skill')">DRIBLE</button><button onclick="pfc18Pause()">Ⅱ</button></div></div></div>`;
 document.body.appendChild(m);pfc18Start();pfc16Toast("🎮 PARTIDA INICIADA");
}
async function pfc18Start(){try{PFC18.match=(await fetch("/api/match/start",{method:"POST",headers:pfc17Headers()}).then(r=>r.json())).matchId}catch{};PFC18.minute=0;PFC18.score=[0,0];clearInterval(PFC18.timer);PFC18.timer=setInterval(()=>{if(!PFC18.paused){PFC18.minute++;document.getElementById("matchClock").textContent=String(Math.floor(PFC18.minute/60)).padStart(2,"0")+":"+String(PFC18.minute%60).padStart(2,"0");if(PFC18.minute>=90)pfc18Finish()}},1000)}
async function pfc18Action(type){
 if(PFC18.paused)return;
 const actions={pass:"🎯 Passe preciso",shoot:"💥 Finalização",sprint:"⚡ Sprint",skill:"✨ Drible"};
 pfc16Toast(actions[type]||type);
 if(type==="shoot"&&Math.random()<.18){PFC18.score[0]++;document.getElementById("homeScore").textContent=PFC18.score[0];pfc16Toast("⚽ GOOOOOOL!");}
 if(PFC18.match)fetch("/api/match/event",{method:"POST",headers:pfc17Headers(),body:JSON.stringify({matchId:PFC18.match,type:type==="shoot"?"shot":type,minute:PFC18.minute})}).catch(()=>{});
}
function pfc18Pause(){PFC18.paused=!PFC18.paused;pfc16Toast(PFC18.paused?"⏸️ Pausado":"▶️ Continuando")}
async function pfc18Finish(){
 clearInterval(PFC18.timer);if(PFC18.match)await fetch("/api/match/finish",{method:"POST",headers:pfc17Headers(),body:JSON.stringify({matchId:PFC18.match,homeScore:PFC18.score[0],awayScore:PFC18.score[1]})}).catch(()=>{});
 pfc16AddStats(PFC18.score[0]>PFC18.score[1],PFC18.score[0],0);pfc16Toast("🏁 FIM DE JOGO");
}
function pfc18Hub(){
 const m=document.createElement("div");m.className="dashModal";m.innerHTML=`<div class="dashPanel"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button><small>FULL GAME SYSTEM</small><h2>🔥 CENTRAL DO CLUBE</h2>
 <div class="v18Tiles"><button onclick="pfc18OpenMatch()">⚽ DIVISION RIVALS</button><button onclick="pfc16Squad()">👕 ELENCO</button><button onclick="pfcFinalShop()">🛒 LOJA</button><button onclick="pfc16OpenTop()">🌎 RANKING</button><button onclick="pfc18Missions()">🎯 MISSÕES</button><button onclick="pfc18Season()">🏆 TEMPORADA</button></div></div>`;document.body.appendChild(m)
}
async function pfc18Missions(){
 const j=await fetch("/api/missions",{headers:pfc17Headers()}).then(r=>r.json());const m=document.createElement("div");m.className="dashModal";m.innerHTML=`<div class="dashPanel"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button><small>LIVE OBJECTIVES</small><h2>🎯 MISSÕES</h2><div class="missionList">${j.rows.map(x=>`<div><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.description)} • ${x.progress}/${x.target}</span><strong>${x.claimed?"✓":x.progress>=x.target?"PRONTO":"EM ANDAMENTO"}</strong></div>`).join("")}</div></div>`;document.body.appendChild(m)
}
async function pfc18Season(){
 const j=await fetch("/api/season",{headers:pfc17Headers()}).then(r=>r.json());const s=j.season||{};const r=j.ranking||{};const m=document.createElement("div");m.className="dashModal";m.innerHTML=`<div class="dashPanel"><button class="closeProfile" onclick="this.closest('.dashModal').remove()">×</button><small>COMPETITIVE SEASON</small><h2>🏆 ${escapeHtml(s.name||"Temporada")}</h2><div class="seasonBox"><b>DIVISÃO ${r.division||10}</b><strong>${r.points||0} PTS</strong><span>${r.wins||0}V • ${r.draws||0}E • ${r.losses||0}D • ${r.goals_for||0} GF</span></div></div>`;document.body.appendChild(m)
}
window.pfc18OpenMatch=pfc18OpenMatch;window.pfc18Hub=pfc18Hub;window.pfc18Action=pfc18Action;window.pfc18Pause=pfc18Pause;window.pfc18Missions=pfc18Missions;window.pfc18Season=pfc18Season;
