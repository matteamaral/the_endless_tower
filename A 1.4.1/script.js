// Realmspace Update 2 - Implements floor sequencing, Swan intro, energy scaling, boons as per Reacher, and lobby behavior.
// NOTE: This file is a prototype — balance numbers are initial and can be tuned.
(() => {
  const STORAGE_KEY = 'realmspace_save_v2';

  function randInt(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function now(){return new Date().toLocaleTimeString();}

  // Reachers & boon pools (same as before, kept for continuity)
  const REACHERS = {
    krisset: {label:'Krisset ❄️', theme:'cold'},
    marihj: {label:'Marihj Robin 🔥', theme:'fire'},
    darui: {label:'Darui 🛡️', theme:'def'},
    wuku: {label:'Dr. Wuku 💀', theme:'vamp'},
    elina: {label:'Elina 🕊️', theme:'self'},
    joshir: {label:'Joshir 💚', theme:'corrosion'},
    claire: {label:'Claïre ☀️', theme:'light'},
    swan: {label:'Swan ⏳', theme:'mentor'}
  };

  const BOON_POOLS = { /*
    trimmed version — same semantics as before, but ensure stacking works and idempotent apply (applies modifiers on RUN.modifiers)
  */ };

  // We'll define pools in code below to keep file size manageable.
  const BOON_POOLS_DEFS = (()=>{
    const pools = {};
    pools.krisset = [
      {id:'k1',title:'Frost Edge',desc:'Enemies -10% ATK for 3 rooms',apply:run=>{run.modifiers.enemyAtkMul*=0.90}},
      {id:'k2',title:'Icy Snare',desc:'Enemies -10 Speed for 3 rooms',apply:run=>{run.modifiers.enemySpeed-=10}},
      {id:'k3',title:'Cold Shield',desc:'+12 DEF',apply:run=>{run.hero.def+=12}},
      {id:'k4',title:'Frostbite',desc:'Attacks add 2 slow stacks',apply:run=>{run.modifiers.addSlow=true}}
    ];
    pools.marihj = [
      {id:'m1',title:'Ember Strike',desc:'+8 ATK',apply:run=>{run.hero.atk+=8}},
      {id:'m2',title:'Lingering Burn',desc:'Attacks apply burn stack (3 damage)',apply:run=>{run.modifiers.burnOnHit+=1}},
      {id:'m3',title:'War Cry',desc:'First hit +20% dmg once per combat',apply:run=>{run.modifiers.firstHitMul*=1.20}},
      {id:'m4',title:'Flame Gift',desc:'+10 Max HP',apply:run=>{run.hero.maxHp+=10; run.hero.hp+=10}}
    ];
    pools.darui = [
      {id:'d1',title:'Ironheart',desc:'+20 Max HP',apply:run=>{run.hero.maxHp+=20; run.hero.hp+=20}},
      {id:'d2',title:'Bulwark',desc:'+6 DEF',apply:run=>{run.hero.def+=6}},
      {id:'d3',title:'Noble Mend',desc:'Heal 25 HP now',apply:run=>{run.hero.hp=clamp(run.hero.hp+25,0,run.hero.maxHp)}},
      {id:'d4',title:'Stalwart',desc:'Reduce incoming damage by 6 flat',apply:run=>{run.modifiers.flatDamageReduction+=6}}
    ];
    pools.wuku = [
      {id:'w1',title:'Vampiric Edge',desc:'Heal 10% of damage dealt',apply:run=>{run.modifiers.lifeSteal+=0.10}},
      {id:'w2',title:'Playful Hex',desc:'Every 3rd hit restores 8 HP',apply:run=>{run.modifiers.everyThirdHeal+=8}},
      {id:'w3',title:'Lingering Vitality',desc:'Heal +3 HP per turn',apply:run=>{run.hero.hpRegen+=3}},
      {id:'w4',title:'Strange Resonance',desc:'Chance to charm (skip enemy turn)',apply:run=>{run.modifiers.charmChance+=0.08}}
    ];
    pools.elina = [
      {id:'e1',title:'Focused Might',desc:'+15% ATK multiplier',apply:run=>{run.modifiers.heroAtkMul*=1.15}},
      {id:'e2',title:'Swiftstep',desc:'+10 Speed',apply:run=>{run.hero.speed+=10}},
      {id:'e3',title:'Grace',desc:'10% evasion',apply:run=>{run.modifiers.heroEvasion+=0.10}},
      {id:'e4',title:'Judgment',desc:'+1 starting energy each combat',apply:run=>{run.modifiers.startEnergy+=1}}
    ];
    pools.joshir = [
      {id:'j1',title:'Crush Corrosion',desc:'Enemies -8 DEF',apply:run=>{run.modifiers.enemyDefSub+=8}},
      {id:'j2',title:'Weaken',desc:'Enemies -6 ATK',apply:run=>{run.modifiers.enemyAtkSub+=6}},
      {id:'j3',title:'Slow Rot',desc:'Enemies take 3 dmg per turn for 3 turns',apply:run=>{run.modifiers.weakDoT+=3}},
      {id:'j4',title:'Bleak Whisper',desc:'Enemies -10% damage',apply:run=>{run.modifiers.enemyAtkMul*=0.90}}
    ];
    pools.claire = [
      {id:'c1',title:'Blinding Light',desc:'Enemies +12% miss chance',apply:run=>{run.modifiers.enemyMiss+=(0.12)}},
      {id:'c2',title:'Purity',desc:'+5 DEF and remove one negative effect',apply:run=>{run.hero.def+=5}},
      {id:'c3',title:'Sharp Sight',desc:'Small crit chance',apply:run=>{run.modifiers.critChance+=0.05}},
      {id:'c4',title:'Radiant Heal',desc:'Heal 12 HP',apply:run=>{run.hero.hp=clamp(run.hero.hp+12,0,run.hero.maxHp)}}
    ];
    pools.swan = [
      {id:'s1',title:'Fated Boon',desc:'+20 ATK (first-run special)',apply:run=>{run.hero.atk+=20}},
      {id:'s2',title:'Destined Armor',desc:'+25 Max HP',apply:run=>{run.hero.maxHp+=25; run.hero.hp+=25}},
      {id:'s3',title:'Weave of Fate',desc:'Negate one fatal blow this run',apply:run=>{run.modifiers.ghostSave=true}},
      {id:'s4',title:'Guiding Spark',desc:'+2 starting energy each combat',apply:run=>{run.modifiers.startEnergy+=2}}
    ];
    return pools;
  })();

  // Save
  const DEFAULT_SAVE = {firstDeath:false,temples:0,pearls:0,unlocks:{},stats:{} };
  let SAVE = loadSave();

  function loadSave(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){console.warn('load failed',e)}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SAVE));
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }
  function saveGame(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(SAVE)); }

  // Runtime run
  let RUN = null; // run state

  // DOM refs
  const $ = id => document.getElementById(id);
  let els = {};

  function init(){
    els.startRunBtn = $('startRunBtn');
    els.toLobbyBtn = $('toLobbyBtn');
    els.hudHeroName = $('heroName');
    els.hudHP = $('hudHP');
    els.hudEnergy = $('hudEnergy');
    els.hudFloor = $('hudFloor');
    els.hudRoom = $('hudRoom');
    els.hudTemples = $('hudTemples');
    els.hudTemplesRight = $('hudTemplesRight');
    els.partyList = $('partyList');
    els.monsterGrid = $('monsterGrid');
    els.turnOrder = $('turnOrder');
    els.logArea = $('logArea');
    els.actionsArea = $('actionsArea');
    els.nextRoomBtn = $('nextRoomBtn'); if(els.nextRoomBtn) { els.nextRoomBtn.onclick = ()=>{}; }
    els.endTurnBtn = $('endTurnBtn');
    els.abortRunBtn = $('abortRunBtn');
    els.lobbyModal = $('lobbyModal');
    els.lobbyTemples = $('lobbyTemples');
    const openLobbyBtn = $('openLobbyBtn'); if(openLobbyBtn) openLobbyBtn.onclick = ()=> openLobby();
    els.buyMaxHp = $('buyMaxHp');
    els.buyAtk = $('buyAtk');
    els.lobbyClose = $('lobbyClose');

    // Bindings
    els.startRunBtn.onclick = ()=> beginRunClicked();
    els.toLobbyBtn.onclick = ()=> openLobby();
    els.nextRoomBtn.onclick = ()=> advanceToNextRoom();
    els.endTurnBtn.onclick = ()=> forceNextTurn();
    els.abortRunBtn.onclick = ()=> abortRun();
    els.buyMaxHp.onclick = ()=> buyMaxHp();
    els.buyAtk.onclick = ()=> buyAtk();
    els.lobbyClose.onclick = ()=> { els.lobbyModal.style.display='none'; }

    // initial UI state
    updateTempleDisplays();
    showMain();

    // Swan intro if first run ever (only once before first run)
    if(!SAVE.firstDeath && !localStorage.getItem('swan_seen')){
      setTimeout(()=> showSwanIntro(), 300);
    }

    window._realm = {SAVE, beginRunClicked, openLobby, RUN};
  }

  // Helpers for placeholders
  function placeholderSVG(name,size=128){
    const label = String(name||'P').split(' ')[0].slice(0,10);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><rect width='100%' height='100%' fill='%23071a2a'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' fill='%23b7c6da' font-size='${Math.floor(size/6)}'>${label}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // Hero creation considers lobby unlocks (instant apply)
  
function newHero(){
    const baseMaxEnergy = 100; // energy scale
    const hero = {
      id:'hero',
      name:'Hero',
      hp: 140 + (SAVE.unlocks.maxHp || 0),
      maxHp: 140 + (SAVE.unlocks.maxHp || 0),
      atk: 16 + (SAVE.unlocks.atk || 0),
      def: 6 + (SAVE.unlocks.def || 0),
      energy: Math.floor(baseMaxEnergy*0.2),
      maxEnergy: baseMaxEnergy,
      speed: 20,
      hpRegen:0,
      portrait: placeholderSVG('Hero',128)
    };
    return hero;
  }

  function fileExists(path){ return false; }



  // Start run flow with Swan influence only if swan_seen not in localStorage
  function beginRunClicked(){ try{ if(RUN) return; document.getElementById('startRunBtn').disabled = false; if(!localStorage.getItem('swan_seen')){ showSwanIntro(true, function(){ startRun(); }); } else { startRun(); } }catch(e){ console.warn('beginRunClicked error',e); } }

  
  // Room sequencing per floor (10 rooms per floor including boss at pos 10)
  function generateFloorSequence(floor){
    const seq = new Array(10).fill(null);
    for(let i=0;i<9;i++){
      const r = Math.random();
      let type;
      if(r <= 0.05){
        type = 'choice_all';
      } else if(r <= 0.15){
        type = 'choice_two';
      } else {
        const x = randInt(1,100);
        if(x <= 55) type = 'fight';
        else if(x <= 80) type = 'happening';
        else type = 'puzzle';
      }
      seq[i] = type;
    }
    seq[9] = 'boss';
    // ensure at least one fight in first 9 rooms
    if(!seq.slice(0,9).some(t=>t==='fight')){
      const idx = randInt(0,8);
      seq[idx] = 'fight';
    }
    return seq;
  }


function startRun(){
    RUN = {
      floor:1, roomIndex:1, sequence: generateFloorSequence(1), currentRoom:null,
      hero:newHero(), party:[], boons:[], modifiers:{
        enemyAtkMul:1, enemyAtkSub:0, enemyDefSub:0, enemySpeed:0,
        heroAtkMul:1, heroEvasion:0, startEnergy:0,
        flatDamageReduction:0, lifeSteal:0, burnOnHit:0, firstHitMul:1,
        enemyMiss:0, addSlow:false, everyThirdHeal:0, weakDoT:0, charmChance:0, critChance:0, ghostSave:false
      },
      inCombat:false, fightsThisFloor:0, roomsCleared:0
    };
    log('Run started — Floor 1');
    renderHUD();
    renderParty();
    generateAndEnterRoom();
    showMain();
    saveGame();
  }

  
  // Show a room preview modal and require player to confirm entering the room.
  function showRoomPreview(type, isBoss){
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h3>Approach the door</h3>
      <p class="small">You see: <strong>${type.toUpperCase()}${isBoss? ' (Boss)':''}</strong></p>
      <p class="small">Enter the room when ready.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
        <button id="enterRoomBtn" class="btn primary">Enter</button>
      </div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    modal.querySelector('#enterRoomBtn').onclick = ()=>{ try{ document.body.removeChild(backdrop); enterRoom(type); }catch(e){ console.warn('enterRoom failed',e);} };
    
  }


function generateAndEnterRoom(){ if(!RUN) return; const idx = RUN.roomIndex - 1; let rtype = RUN.sequence[idx]; if(rtype === 'choice_two' || rtype === 'choice_all'){ showRoomChoice(rtype); } else if(rtype === 'boss'){ showRoomPreview('boss', true); } else { showRoomPreview(rtype, false); } }

  function showRoomChoice(kind){
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h3>Choice Room</h3><p class="small">Choose your room type</p><div style="display:flex;gap:8px;margin-top:12px"><button id="opt1" class="btn"></button><button id="opt2" class="btn"></button>${kind==='choice_all'?'<button id="opt3" class="btn"></button>':''}</div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    const types = ['fight','puzzle','happening'];
    const options = kind==='choice_all' ? types : [types[randInt(0,2)], types[randInt(0,2)]];
    // dedupe
    const uniq = [...new Set(options)];
    modal.querySelector('#opt1').innerText = uniq[0].toUpperCase();
    modal.querySelector('#opt1').onclick = ()=>{ document.body.removeChild(backdrop); enterRoom(uniq[0]); };
    modal.querySelector('#opt2').innerText = uniq[1] ? uniq[1].toUpperCase() : types[0].toUpperCase();
    modal.querySelector('#opt2').onclick = ()=>{ document.body.removeChild(backdrop); enterRoom(uniq[1] || uniq[0]); };
    if(kind==='choice_all'){
      modal.querySelector('#opt3').innerText = types[2].toUpperCase();
      modal.querySelector('#opt3').onclick = ()=>{ document.body.removeChild(backdrop); enterRoom(types[2]); };
    }
  }

  function enterRoom(type){
    RUN.currentRoom = {type, cleared:false, isBoss:(type==='boss')};
    renderRoomHeader();
    // heal at fountains every 5 and 10 rooms
    if(RUN.roomIndex % 5 === 0){
      const heal = Math.floor(RUN.hero.maxHp * 0.2);
      RUN.hero.hp = clamp(RUN.hero.hp + heal, 0, RUN.hero.maxHp);
      log(`A fountain heals Hero for ${heal} HP.`);
    }
    if(type === 'fight' || type === 'boss'){
      startCombat(type === 'boss');
    } else if(type === 'puzzle'){
      showPuzzle();
    } else if(type === 'happening'){
      showHappening();
    }
  }

  // Combat system (improved)
  function makeEnemy(name, floor, scale=1){
    // tougher scaling: base HP and ATK scale more aggressively with floor
    const baseHp = 40 + floor*18;
    const baseAtk = 10 + Math.floor(floor*3);
    const baseDef = Math.floor(floor/2);
    return { id: 'm'+Date.now()+Math.floor(Math.random()*999), name, hp:Math.round(baseHp*scale), maxHp:Math.round(baseHp*scale), atk:Math.max(1,Math.round(baseAtk*scale)), def:baseDef, speed: randInt(8,18), portrait: placeholderSVG(name,128) };
  }

  function startCombat(isBoss){
    const enemies = [];
    const floor = RUN.floor;
    if(isBoss){
      enemies.push(makeEnemy('Floor Boss', floor, 3.8));
    } else {
      // determine count based on floor and proximity to boss
      let minCount = 1;
      if(RUN.roomIndex >= 7) minCount = 2; // tougher late-floor rooms
      const maxCount = Math.min(5, Math.max(minCount, Math.floor(1 + RUN.floor + RUN.roomIndex/2)));
      let count = randInt(minCount, maxCount);
      // first room of first floor stays light
      if(RUN.floor === 1 && RUN.roomIndex === 1) count = 1;
      const names = ['Crypt Warden','Fanged Wisp','Gloom Bat','Rotted Guard','Shard Spider'];
      for(let i=0;i<count;i++) enemies.push(makeEnemy(names[i%names.length], floor, 1 + Math.random()*0.9));
    }
    RUN.combat = { enemies, turnQueue:[], activeIndex:0, logs:[], round:1, inAction:false, selectedTargetId: null };
    RUN.inCombat = true;
    RUN.fightsThisFloor++;
    applyStartModifiers();
    rebuildQueue();
    renderCombat();
    log(`Combat started: ${enemies.length} enemy(ies)`);
  }

  function applyStartModifiers(){
    RUN.hero.energy = Math.min(RUN.hero.maxEnergy, RUN.hero.energy + (RUN.modifiers.startEnergy || 0));
  }

  function rebuildQueue(){
    const q = [];
    q.push({type:'ally', id:RUN.hero.id, speed:RUN.hero.speed});
    RUN.combat.enemies.forEach(e=> q.push({type:'monster', id:e.id, speed:e.speed}));
    q.sort((a,b)=> b.speed - a.speed);
    RUN.combat.turnQueue = q;
    if(RUN.combat.activeIndex >= RUN.combat.turnQueue.length) RUN.combat.activeIndex = 0;
  }

  function renderCombat(){
    renderMonsters();
    renderTurnOrder();
    renderHUD();
    renderActions();
    renderLog();
  }

  function getEnemyById(id){ return RUN.combat.enemies.find(e=>e.id===id); }

  function renderMonsters(){
    els.monsterGrid.innerHTML = '';
    RUN.combat.enemies.forEach(m=>{
      const d = document.createElement('div'); d.className='monster';
      d.innerHTML = `<div class="m-portrait"><img src="${m.portrait}" width="64" height="64"/></div><div style="flex:1"><div class="m-name">${m.name}</div><div class="m-attr">HP ${Math.round(m.hp)} / ${Math.round(m.maxHp)} • ATK ${m.atk} • DEF ${m.def}</div></div>`;
      els.monsterGrid.appendChild(d);
    });
  }

  function renderTurnOrder(){
    els.turnOrder.innerHTML = '';
    RUN.combat.turnQueue.forEach((t,idx)=>{
      const tok = document.createElement('div'); tok.className = 'turn-token' + (idx===RUN.combat.activeIndex ? ' active' : '');
      const label = t.type==='ally' ? RUN.hero.name : getEnemyById(t.id).name;
      const portrait = t.type==='ally' ? RUN.hero.portrait : getEnemyById(t.id).portrait;
      tok.innerHTML = `<img src="${portrait}" width="46" height="46" style="border-radius:8px"/><div class="small">${label}</div>`;
      tok.onclick = ()=>{ if(!RUN.combat.inAction){ RUN.combat.activeIndex = idx; renderCombat(); } };
      els.turnOrder.appendChild(tok);
    });
  }

  function renderActions(){
    els.actionsArea.innerHTML = '';
    const active = RUN.combat.turnQueue[RUN.combat.activeIndex];
    if(!active) return;
    if(active.type==='ally'){
      if(RUN.combat.inAction) return; // prevent double clicks
      const wrap = document.createElement('div'); wrap.className='center';
      const atkBtn = document.createElement('button'); atkBtn.className='btn primary'; atkBtn.innerText='Attack'; atkBtn.onclick = ()=> { disableActionButtons(); playerAttack(); };
      const ultBtn = document.createElement('button'); ultBtn.className='btn'; ultBtn.innerText='Ultimate'; ultBtn.onclick = ()=> { disableActionButtons(); playerUltimate(); };
      const guardBtn = document.createElement('button'); guardBtn.className='btn'; guardBtn.innerText='Guard'; guardBtn.onclick = ()=> { disableActionButtons(); playerGuard(); };
      const chargeBtn = document.createElement('button'); chargeBtn.className='btn'; chargeBtn.innerText='Charge'; chargeBtn.onclick = ()=> { disableActionButtons(); playerCharge(); };
      // disable buttons for locked skills (future)
      // Ultimate availability based on energy
      if(RUN.hero.energy < 60) ultBtn.disabled = true;
      wrap.appendChild(atkBtn); wrap.appendChild(ultBtn); wrap.appendChild(guardBtn); wrap.appendChild(chargeBtn);
      els.actionsArea.appendChild(wrap);
    } else {
      els.actionsArea.innerHTML = '<div class="small center">Enemy acting — watch the log</div>';
      if(!RUN.combat.inAction) {
        RUN.combat.inAction = true;
        setTimeout(()=> enemyAct(active.id), 700);
      }
    }
  }

  function disableActionButtons(){
    RUN.combat.inAction = true;
  }
  function enableActionButtons(){
    RUN.combat.inAction = false;
    renderActions();
  }

  // Player actions with energy rules implemented
  function playerAttack(){
    const target = RUN.combat.enemies.find(x=>x.id === (RUN.combat.selectedTargetId || (RUN.combat.enemies[0] && RUN.combat.enemies[0].id)));
    if(!target) { enableActionButtons(); return; }
    const base = Math.round(RUN.hero.atk * (RUN.modifiers.heroAtkMul || 1) * (RUN.modifiers.firstHitMul || 1));
    const damage = Math.max(1, base - Math.max(0, target.def - (RUN.modifiers.enemyDefSub||0)));
    target.hp -= damage;
    RUN.combat.logs.unshift(`[${now()}] Hero attacks ${target.name} for ${damage} dmg`);
    // energy regen +10
    RUN.hero.energy = Math.min(RUN.hero.maxEnergy, RUN.hero.energy + 10);
    // life steal
    if(RUN.modifiers.lifeSteal){
      const heal = Math.round(damage * RUN.modifiers.lifeSteal);
      RUN.hero.hp = clamp(RUN.hero.hp + heal, 0, RUN.hero.maxHp);
      RUN.combat.logs.unshift(`[${now()}] Hero heals ${heal} via lifesteal`);
    }
    // burn on hit
    if(RUN.modifiers.burnOnHit){
      target._burn = (target._burn||0) + RUN.modifiers.burnOnHit;
      RUN.combat.logs.unshift(`[${now()}] ${target.name} gains ${RUN.modifiers.burnOnHit} burn stacks`);
    }
    RUN.modifiers.firstHitMul = 1;
    setTimeout(()=> { advanceTurn(); enableActionButtons(); renderCombat(); checkCombatEnd(); }, 260);
  }

  function playerUltimate(){
    const cost = 60;
    if(RUN.hero.energy < cost){ RUN.combat.logs.unshift(`[${now()}] Not enough energy for Ultimate`); enableActionButtons(); renderCombat(); return; }
    const target = RUN.combat.enemies.find(x=>x.id === (RUN.combat.selectedTargetId || (RUN.combat.enemies[0] && RUN.combat.enemies[0].id)));
    if(!target){ enableActionButtons(); return; }
    const dmg = Math.round(RUN.hero.atk * 3.5 * (RUN.modifiers.heroAtkMul||1));
    target.hp -= dmg;
    RUN.hero.energy = Math.max(0, RUN.hero.energy - cost);
    RUN.combat.logs.unshift(`[${now()}] Hero uses ULTIMATE on ${target.name} for ${dmg} dmg`);
    // ultimate might heal or apply effects per boons
    setTimeout(()=> { advanceTurn(); enableActionButtons(); renderCombat(); checkCombatEnd(); }, 300);
  }

  function playerGuard(){
    RUN.hero._guard = (RUN.hero._guard||0) + 1;
    RUN.hero.energy = Math.min(RUN.hero.maxEnergy, RUN.hero.energy + 5); // guard regen 5
    RUN.combat.logs.unshift(`[${now()}] Hero guards, reducing next damage and gaining 5 energy`);
    setTimeout(()=> { advanceTurn(); enableActionButtons(); renderCombat(); }, 180);
  }

  function playerCharge(){
    RUN.hero.energy = Math.min(RUN.hero.maxEnergy, RUN.hero.energy + Math.floor(RUN.hero.maxEnergy * 0.5)); // restore 50% max energy
    RUN.combat.logs.unshift(`[${now()}] Hero charges and restores energy`);
    setTimeout(()=> { advanceTurn(); enableActionButtons(); renderCombat(); }, 240);
  }

  function enemyAct(id){
    const e = getEnemyById(id);
    if(!e){ RUN.combat.inAction=false; renderCombat(); return; }
    // always attack
    if(Math.random() < (RUN.modifiers.enemyMiss || 0)){
      RUN.combat.logs.unshift(`[${now()}] ${e.name} misses due to blindness`);
    } else {
      let dmg = Math.max(1, Math.round(e.atk * (RUN.modifiers.enemyAtkMul||1) - Math.max(0, RUN.hero.def - (RUN.modifiers.enemyDefSub||0)) - (RUN.modifiers.flatDamageReduction||0)));
      if(RUN.hero._guard && RUN.hero._guard>0){
        dmg = Math.max(0, dmg - 8);
        RUN.hero._guard--;
      }
      RUN.hero.hp = clamp(RUN.hero.hp - dmg, 0, RUN.hero.maxHp);
      RUN.combat.logs.unshift(`[${now()}] ${e.name} hits Hero for ${dmg} dmg`);
    }
    // Immediate death check before end-of-turn effects/regen
    if(RUN.hero.hp <= 0){
      if(RUN.modifiers.ghostSave){ RUN.modifiers.ghostSave = false; RUN.hero.hp = Math.max(1, Math.floor(RUN.hero.maxHp * 0.2)); RUN.combat.logs.unshift(`[${now()}] Ghost Save prevented death!`); renderCombat(); RUN.combat.inAction=false; return; }
      // hero is dead
      RUN.combat.inAction=false; renderCombat(); checkCombatEnd(); return;
    }
    // end-of-turn effects applied below
    setTimeout(()=> { advanceTurn(); RUN.combat.inAction=false; renderCombat(); checkCombatEnd(); }, 260);
  }

  function advanceTurn(){
    if(!RUN || !RUN.inCombat) return;
    applyEndOfTurn();
    RUN.combat.activeIndex = (RUN.combat.activeIndex + 1) % (RUN.combat.turnQueue.length || 1);
    // remove dead
    RUN.combat.enemies = RUN.combat.enemies.filter(m=>m.hp>0);
    if(RUN.combat.enemies.length === 0){
      checkCombatEnd();
      return;
    }
    rebuildQueue();
    renderCombat();
  }

  function applyEndOfTurn(){
    RUN.combat.enemies.forEach(m=>{
      if(m._burn && m._burn>0){
        const dmg = 3 * m._burn;
        m.hp -= dmg;
        RUN.combat.logs.unshift(`[${now()}] ${m.name} suffers ${dmg} burn damage`);
        m._burn = Math.max(0, m._burn-1);
      }
      if(RUN.modifiers.weakDoT){
        m.hp -= RUN.modifiers.weakDoT;
        RUN.combat.logs.unshift(`[${now()}] ${m.name} suffers ${RUN.modifiers.weakDoT} corrosion damage`);
      }
    });
    if(RUN.hero.hp > 0 && RUN.hero.hpRegen && RUN.hero.hpRegen>0){
      RUN.hero.hp = clamp(RUN.hero.hp + RUN.hero.hpRegen, 0, RUN.hero.maxHp);
      RUN.combat.logs.unshift(`[${now()}] Hero regenerates ${RUN.hero.hpRegen} HP`);
    }
  }

  function checkCombatEnd(){
    if(RUN.hero.hp <= 0){
      // death -> show death screen then lobby
      SAVE.firstDeath = true; saveGame();
      const cb = ()=>{ showPampashaDialog(); };
      RUN = null; // clear run state
      showDeathScreen(cb);
      return;
    }
    if(RUN.combat.enemies.length === 0){
      RUN.inCombat = false;
      const reward = RUN.currentRoom.isBoss ? randInt(8,14) : randInt(2,5);
      SAVE.temples += reward; saveGame();
      log(`Combat won. Gained ${reward} Temples.`);
      // immediately show boons from same Reacher (3 choices)
      showReacherChoice();
    }
  }

  function showDeathScreen(callback){
    // clear combat UI
    els.monsterGrid.innerHTML = '';
    els.actionsArea.innerHTML = '';
    els.turnOrder.innerHTML = '';
    // show full modal
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h2>You Died</h2><p class="small">Your run has ended. The Tower claims another.</p><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="deathCont" class="btn primary">Continue</button></div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    modal.querySelector('#deathCont').onclick = ()=>{ document.body.removeChild(backdrop); if(typeof callback === 'function') callback(); };
  }



  // Reacher choice: pick a single Reacher and present 3 options from its pool
  function pickRandomReacher(){ const keys = Object.keys(REACHERS).filter(k=>k!=='swan'); return keys[randInt(0, keys.length-1)]; }

  function showReacherChoice(){
    const rKey = pickRandomReacher();
    const pool = BOON_POOLS_DEFS[rKey] || [];
    const shuffled = pool.slice().sort(()=>Math.random()-0.5);
    const options = shuffled.slice(0,3);
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div><img src="${placeholderSVG(REACHERS[rKey].label,80)}" width="80" height="80" style="border-radius:8px"/></div><div><h3>${REACHERS[rKey].label}</h3><p class="small">"${getReacherLine(rKey)}"</p></div></div><p class="small">Choose one boon:</p><div id="boonOptions" style="display:flex;gap:8px;margin-top:12px"></div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    const root = modal.querySelector('#boonOptions');
    options.forEach(opt=>{
      const card = document.createElement('div'); card.className='panel'; card.style.flex='1';
      card.innerHTML = `<strong>${opt.title}</strong><div class="small" style="margin-top:6px">${opt.desc}</div><div style="margin-top:8px" class="center"><button class="btn primary">Take</button></div>`;
      card.querySelector('button').onclick = ()=>{
        // apply immediately and add to RUN.boons
        opt.apply(RUN);
        RUN.boons.push(opt.id);
        document.body.removeChild(backdrop);
        log(`Took boon: ${opt.title}`);
        renderHUD(); renderParty(); // update instant
        // proceed to next room
        setTimeout(()=> { advanceRoomAfterBoon(); }, 600);
      };
      root.appendChild(card);
    });
  }

  function getReacherLine(key){
    const lines = {
      krisset:"Observation: the cold refines.",
      marihj:"Stand firm, soldier. Burn brighter.",
      darui:"You are permitted another breath.",
      wuku:"Curious... your wounds sing oddly.",
      elina:"I watch. You either measure up or you do not.",
      joshir:"Sorrow leaves marks, but... it can teach.",
      claire:"Light separates the worthy.",
      swan:"Fate leans close. Choose as destiny whispers."
    };
    return lines[key] || '';
  }

  function advanceRoomAfterBoon(){
    // clear current room and advance index
    RUN.roomsCleared++;
    if(RUN.currentRoom.isBoss){
      // after boss, proceed to next floor unless last floor
      if(RUN.floor >= 3){
        // final boss? if floor 3 and boss beaten, show final? For now, end run as victory
        log('You cleared the final boss for this alpha. Run complete.');
        RUN = null; showMain(); return;
      } else {
        RUN.floor++;
        RUN.roomIndex = 1;
        RUN.sequence = generateFloorSequence(RUN.floor);
        generateAndEnterRoom();
        return;
      }
    } else {
      RUN.roomIndex++;
      if(RUN.roomIndex > 10){
        // next floor
        RUN.floor++;
        RUN.roomIndex = 1;
        RUN.sequence = generateFloorSequence(RUN.floor);
      }
      generateAndEnterRoom();
    }
  }

  // Puzzle
  function showPuzzle(){
    const a = randInt(2,9), b = randInt(2,9), correct = a*b;
    const wrong1 = correct + randInt(1,6), wrong2 = Math.max(1, correct - randInt(1,6));
    const choices = [correct, wrong1, wrong2].sort(()=>Math.random()-0.5);
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h3>Puzzle Room</h3><p class="small">Solve: ${a} × ${b} = ?</p><div style="display:flex;gap:8px;margin-top:12px" id="pChoices"></div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    const root = modal.querySelector('#pChoices');
    choices.forEach(c=>{
      const btt = document.createElement('button'); btt.className='btn'; btt.innerText = c;
      btt.onclick = ()=>{
        document.body.removeChild(backdrop);
        if(c === correct){
          const reward = randInt(1,3); SAVE.temples += reward; saveGame(); log(`Puzzle solved. Gained ${reward} Temples.`);
        } else {
          RUN.hero.hp = clamp(RUN.hero.hp - 12, 0, RUN.hero.maxHp); log(`Puzzle failed. Took 12 damage.`);
          if(RUN.hero.hp <= 0){ RUN = null; SAVE.firstDeath = true; saveGame(); showPampashaDialog(); return; }
        }
        // show boon afterwards always
        showReacherChoice();
      };
      root.appendChild(btt);
    });
  }

  // Happening
  function showHappening(){
    const r = randInt(1,100);
    if(r<=50){
      const heal = randInt(6,14); RUN.hero.hp = clamp(RUN.hero.hp + heal,0,RUN.hero.maxHp); log(`A calming fountain heals Hero for ${heal} HP.`);
    } else {
      if(r<=80){ RUN.hero.energy = Math.min(RUN.hero.maxEnergy, RUN.hero.energy + 10); log(`A strange altar restores 10 Energy.`); } 
      else { RUN.hero.atk += 2; log(`You feel a surge of strength (+2 ATK).`); }
    }
    // always show boon after happenings too
    setTimeout(()=> showReacherChoice(), 600);
  }

  // Lobby and Pampasha dialogs
  function showPampashaDialog(){
    // unskippable first death dialog if first time
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h3>Pampasha</h3><p class="small">"You have returned. The Lobby is a small mercy. Spend your Temples."</p><div style="display:flex;gap:8px;margin-top:10px"><button id="pContinue" class="btn primary">Continue</button></div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    modal.querySelector('#pContinue').onclick = ()=>{ document.body.removeChild(backdrop); openLobby(true); };
  }

  function openLobby(force=false){
    if(!SAVE.firstDeath && !force){
      alert('The Lobby unlocks after your first death.');
      return;
    }
    els.lobbyTemples.innerText = SAVE.temples;
    els.lobbyModal.style.display = 'block';
  }

  function buyMaxHp(){
    if(SAVE.temples >=5){ SAVE.temples -=5; SAVE.unlocks.maxHp = (SAVE.unlocks.maxHp||0)+5; saveGame(); updateTempleDisplays(); log('Purchased +5 Max HP (permanent)'); } else alert('Not enough Temples'); 
  }
  function buyAtk(){
    if(SAVE.temples >=6){ SAVE.temples -=6; SAVE.unlocks.atk = (SAVE.unlocks.atk||0)+2; saveGame(); updateTempleDisplays(); log('Purchased +2 ATK (permanent)'); } else alert('Not enough Temples');
  }

  // Rebuild HUD/Party/Log
  function renderHUD(){
    if(!RUN){
      els.hudHeroName.innerText = '-'; els.hudHP.innerText='-'; els.hudEnergy.innerText='-'; els.hudFloor.innerText='-'; els.hudRoom.innerText='-';
    } else {
      els.hudHeroName.innerText = RUN.hero.name;
      els.hudHP.innerText = `${Math.round(RUN.hero.hp)} / ${Math.round(RUN.hero.maxHp)}`;
      els.hudEnergy.innerText = `${RUN.hero.energy} / ${RUN.hero.maxEnergy}`;
      els.hudFloor.innerText = `Floor ${RUN.floor}`;
      els.hudRoom.innerText = `Room ${RUN.roomIndex}`;
    }
  }

  function renderParty(){
    els.partyList.innerHTML = '';
    const hero = RUN ? RUN.hero : null;
    for(let i=0;i<4;i++){
      const slot = document.createElement('div'); slot.className='party-slot';
      if(i===0 && hero){
        slot.innerHTML = `<div class="portrait"><img src="${hero.portrait}" width="56" height="56" style="border-radius:6px"/></div><div class="p-meta"><div class="p-name">${hero.name}</div><div class="p-sub">ATK ${hero.atk} • HP ${Math.round(hero.hp)} • DEF ${hero.def} • EN ${hero.energy}</div><div class="hp-bar"><div class="hp-fill" style="width:${(hero.hp/hero.maxHp)*100}%"></div></div></div>`;
      } else {
        slot.innerHTML = `<div class="portrait">${placeholderSVG('Empty',56)}</div><div class="p-meta"><div class="p-name small" style="color:var(--muted)">Empty Slot</div><div class="p-sub small">Locked</div></div>`;
      }
      els.partyList.appendChild(slot);
    }
  }

  function renderRoomHeader(){ if(!RUN) return; const type = RUN.currentRoom.type; $('roomTitle').innerText = type.toUpperCase() + (RUN.currentRoom.isBoss? ' (Boss)':''); $('roomSub').innerText = `Floor ${RUN.floor} — Room ${RUN.roomIndex}`; }

  function renderLog(){ els.logArea.innerHTML = RUN && RUN.combat ? RUN.combat.logs.slice(0,80).map(l=>`<div style="margin-bottom:6px">${l}</div>`).join('') : 'Explore the Tower.'; }

  function renderMonsters(){ /* handled in renderCombat */ }

  function renderTurnOrder(){ /* handled in renderCombat */ }

  function renderCombat(){ renderMonsters(); renderTurnOrder(); renderHUD(); renderActions(); renderLog(); }

  function renderMonsters(){ els.monsterGrid.innerHTML=''; if(RUN && RUN.combat) RUN.combat.enemies.forEach(m=>{ const d=document.createElement('div'); d.className='monster'; if(RUN.combat.selectedTargetId===m.id) d.style.boxShadow='0 6px 20px rgba(124,58,237,0.18)'; d.innerHTML=`<div class="m-portrait"><img src="${m.portrait}" width="64" height="64"/></div><div style="flex:1"><div class="m-name">${m.name}</div><div class="m-attr">HP ${Math.round(m.hp)} / ${Math.round(m.maxHp)} • ATK ${m.atk} • DEF ${m.def}</div></div>`; d.onclick = ()=>{ if(RUN && RUN.combat) { RUN.combat.selectedTargetId = m.id; renderCombat(); } }; els.monsterGrid.appendChild(d); }); }

  function renderTurnOrder(){ els.turnOrder.innerHTML=''; if(RUN && RUN.combat) RUN.combat.turnQueue.forEach((t,idx)=>{ const tok=document.createElement('div'); tok.className='turn-token'+(idx===RUN.combat.activeIndex?' active':''); const label = t.type==='ally' ? RUN.hero.name : getEnemyById(t.id).name; const portrait = t.type==='ally' ? RUN.hero.portrait : getEnemyById(t.id).portrait; tok.innerHTML = `<img src="${portrait}" width="46" height="46" style="border-radius:8px"/><div class="small">${label}</div>`; tok.onclick = ()=>{ if(!RUN.combat.inAction) { RUN.combat.activeIndex = idx; renderCombat(); } }; els.turnOrder.appendChild(tok); }); }

  function log(msg){
    try{
      const t = new Date().toLocaleTimeString();
      if(!RUN || !RUN.combat){
        if(els && els.logArea) els.logArea.innerHTML = `<div style="margin-bottom:6px">[${t}] ${msg}</div>` + (els.logArea.innerHTML || '');
      } else {
        RUN.combat.logs = RUN.combat.logs || [];
        RUN.combat.logs.unshift(`[${t}] ${msg}`);
        if(els && els.logArea) els.logArea.innerHTML = RUN.combat.logs.slice(0,80).map(l=>`<div style="margin-bottom:6px">${l}</div>`).join('');
      }
    }catch(e){ console.warn('log failed',e); }
  }
  // Room navigation controls
  function advanceToNextRoom(){ if(!RUN) { alert('No active run'); return; } // disabled during combat
    if(RUN.inCombat) { alert('Finish combat first'); return; }
    RUN.roomIndex++; if(RUN.roomIndex > 10){ RUN.floor++; RUN.roomIndex = 1; RUN.sequence = generateFloorSequence(RUN.floor); }
    generateAndEnterRoom();
  }
  function forceNextTurn(){ if(RUN && RUN.combat) { advanceTurn(); } }
  function abortRun(){ if(confirm('Abort run?')) { RUN = null; showMain(); } }

  // Paw helpers
  function getEnemyById(id){ return RUN.combat.enemies.find(e=>e.id===id); }

  // Swan intro only once before first run; can optionally prompt for boon selection
  function showSwanIntro(requireChoice=false, afterCallback=null){
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `<h3>Swan ⏳</h3><p class="small">"I have watched the pattern of your steps... For the first of your kind, destiny permits a gift."</p><p class="small">Choose one powerful boon:</p><div style="display:flex;gap:8px;margin-top:12px" id="swanChoices"></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="swanClose" class="btn ghost">Skip</button></div>`;
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    const root = modal.querySelector('#swanChoices');
    const pool = BOON_POOLS_DEFS.swan;
    const opts = pool.slice(0,3);
    opts.forEach(opt=>{ const card=document.createElement('div'); card.className='panel'; card.style.flex='1'; card.innerHTML=`<strong>${opt.title}</strong><div class="small">${opt.desc}</div><div class="center" style="margin-top:8px"><button class="btn primary">Take</button></div>`; card.querySelector('button').onclick = ()=>{ opt.apply({hero:newHero(), modifiers: {}}); /* we only want to persist effect to next run, store in localStorage flag */ localStorage.setItem('swan_chosen', opt.id); localStorage.setItem('swan_seen','1'); localStorage.setItem('swan_seen','1'); localStorage.setItem('swan_seen','1'); document.body.removeChild(backdrop); if(typeof afterCallback === 'function'){ afterCallback(); } else { startRun(); } }; root.appendChild(card); });
    modal.querySelector('#swanClose').onclick = ()=>{ localStorage.setItem('swan_seen','1'); localStorage.setItem('swan_seen','1'); document.body.removeChild(backdrop); if(typeof afterCallback === 'function'){ afterCallback(); } else { startRun(); } };
  }

  // UI helpers
  function showMain(){ if(RUN){ renderHUD(); renderParty(); } else { renderHUD(); renderParty(); } updateTempleDisplays(); }

  function updateTempleDisplays(){ els.hudTemples.innerText = SAVE.temples; els.hudTemplesRight.innerText = SAVE.temples; }

  // Init
  window.addEventListener('load', ()=>{ init(); });

})();
