const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

async function scenario({wager=0,winner=0,seat=0,amount=null,refund=false,reduced=false,seen=false,flightWidth=null,holdIntro=false,manualTimeline=false,geometry=false,factions=['romanos','orcs']}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script[^>]*src=[^>]+><\/script>/g,''),
    {url:'http://localhost:8000/',runScripts:'dangerously'});
  const w=dom.window;w.matchMedia=()=>({matches:reduced});w.audioManager={};
  const schedule=w.setTimeout.bind(w);
  const timeline=[];
  w.setTimeout=(fn,delay,...args)=>{
    if(manualTimeline&&(delay===2500||delay===3500)){timeline.push({delay,run:()=>fn(...args)});return 900000+timeline.length;}
    return schedule(fn,!holdIntro&&delay===2500?0:delay,...args);
  };
  if(flightWidth!==null||geometry)Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList?.contains('online-reward-flight')?(geometry?1000:flightWidth):0;}});
  if(geometry){
    Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return this.classList?.contains('online-reward-flight')?500:0;}});
    w.Element.prototype.getBoundingClientRect=function(){
      if(this.classList?.contains('online-reward-flight'))return {left:0,top:100,width:1000,height:500};
      if(this.classList?.contains('online-reward-vessel'))return {left:550,top:430,width:180,height:120};
      if(this.tagName==='IMG'&&this.closest('.online-reward-banner'))return this.closest('.online-reward-banner').classList.contains('victor')?{left:150,top:200,width:220,height:260}:{left:750,top:200,width:220,height:260};
      return {left:0,top:0,width:0,height:0};
    };
  }
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const user={id:`user-${seat}`},calls=[];let walletReads=0,snapshots=0;
  if(seen)w.sessionStorage.setItem(`dominius-reward:${user.id}:match-1`,'1');
  const match={id:'match-1',room_id:'room-1',phase:'finished',winner,version:1,turn:0,wager_amount:wager,
    pot_amount:wager*2,wager_status:wager?winner===null?'refunded':'settled':'none'};
  const snapshot={room:{id:'room-1',code:'ABCDEF',status:'finished'},match,
    players:[0,1].map(n=>({user_id:`user-${n}`,seat:n,faction:factions[n],ready:true,last_seen:new Date().toISOString()})),pieces:[],moves:[]};
  const ledger=winner===seat||refund?[{amount:amount??(wager?wager*2:1),type:refund?'wager_refund':wager?'wager_win':'online_win_reward',balance_after:120}]:[];
  const db={
    from(table){
      if(table==='chat_messages')return {select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[],error:null})};
      assert.equal(table,'coin_transactions');
      const query={select(){return query;},eq(){return query;},in(){return query;},then(resolve,reject){return Promise.resolve({data:ledger,error:null}).then(resolve,reject);}};
      return query;
    },
    channel(){const channel={on(){return channel;},subscribe(){return channel;}};return channel;},
    removeChannel:async()=>{},
  };
  w.DominiusCloud={configured:false,session:async()=>({user}),client:async()=>db,
    rpc:async(name)=>{calls.push(name);if(name==='dominius_create_room')return 'room-1';
      if(name==='dominius_snapshot'){snapshots++;return snapshot;}
      if(name==='dominius_my_stats')return {current_win_streak:winner===seat?2:0};
      if(name==='dominius_ranking')return {top:[{user_id:'user-0',name:'Áureo',patent:'Soldado',streak:3,wins:6,losses:2,win_rate:75},{user_id:'user-1',name:'Brutus',patent:'Recruta',streak:0,wins:1,losses:4,win_rate:20}],me:null};return null;}};
  w.DominiusEconomy={wallet:async()=>{walletReads++;return 120;},format:n=>String(n),balance:120};
  for(const file of ['bot.js','game-rules.js','app.js','supabase-online.js']){
    const script=w.document.createElement('script');script.textContent=fs.readFileSync(file,'utf8');w.document.body.append(script);
  }
  w.document.getElementById('online-entry').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  w.document.getElementById('online-create').click();
  for(let i=0;i<100&&w.document.getElementById('online-room-info').hidden;i++)await new Promise(resolve=>setTimeout(resolve,10));
  w.document.getElementById('online-prepare').click();
  for(let i=0;i<100&&!(holdIntro?w.document.querySelector('#online-reward.intro'): /POTE DA BATALHA|BATALHA LIVRE|Coroas indisponíveis/.test(w.document.querySelector('#online-reward .online-reward-label')?.textContent||''));i++)
    await new Promise(resolve=>setTimeout(resolve,10));
  return {dom,w,calls,match,timeline,get walletReads(){return walletReads;},get snapshots(){return snapshots;},
    q:selector=>w.document.querySelector(selector)};
}

test('pote oficial anima para o vencedor, sem conceder saldo pelo visual, e permite pular',async t=>{
  const p=await scenario({wager:5,amount:10});t.after(()=>p.dom.window.close());
  assert.equal(p.q('.online-reward-pot').textContent,'10 COROAS');
  assert.equal(p.q('.online-reward-coin').textContent,'♛');
  assert.equal(p.w.document.querySelectorAll('.online-reward-coin').length,8,'compact flight uses eight visual coins');
  assert.equal(p.q('.online-reward-coin').style.getPropertyValue('--reward-delay'),'700ms');
  assert.equal(p.w.document.querySelectorAll('.online-reward-coin')[7].style.getPropertyValue('--reward-delay'),'1120ms');
  assert.notEqual(p.w.document.querySelectorAll('.online-reward-coin')[0].style.getPropertyValue('--reward-mid-y'),p.w.document.querySelectorAll('.online-reward-coin')[1].style.getPropertyValue('--reward-mid-y'));
  assert.match(p.q('.online-reward-coin').style.getPropertyValue('--reward-end-x'),/px$/);
  assert.equal(p.q('.online-reward').classList.contains('playing'),true);
  assert.equal(p.walletReads,1,'only the lobby read the wallet before the animation');
  p.q('.online-reward-continue').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(p.q('.online-reward').classList.contains('complete'),true);
  assert.equal(p.q('.online-reward-gain').textContent,'+10 COROAS');
  assert.equal(p.calls.includes('dominius_leave'),false,'first Continue only skips the animation');
  assert.equal(p.q('.online-reward-balance').textContent,'SALDO ATUAL: 120 COROAS');
  assert.equal(p.walletReads,2,'wallet is reread after the final coin or skip');
  assert(!p.calls.some(name=>/change_coins|wager_win|online_win_reward/.test(name)));
  p.q('.online-reward-continue').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert(p.calls.includes('dominius_leave'),'Continue leaves the finished room after the animation');
});

test('reconexão e duas abas reutilizam o pagamento oficial sem nova animação ou escrita',async t=>{
  const a=await scenario({wager:5,seen:true});const b=await scenario({wager:5,seen:true});
  t.after(()=>{a.dom.window.close();b.dom.window.close();});
  for(const p of [a,b]){
    for(let i=0;i<50&&!p.q('.online-reward').classList.contains('complete');i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(p.q('.online-reward').classList.contains('complete'),true);
    assert.equal(p.q('.online-reward-coin'),null);
    assert.equal(p.q('.online-reward-gain').textContent,'+10 COROAS');
    assert(!p.calls.some(name=>/change_coins|wager_win|online_win_reward/.test(name)));
  }
});

test('espaço amplo distribui dez moedas visuais com atraso gradual',async t=>{
  const p=await scenario({wager:5,flightWidth:500});t.after(()=>p.dom.window.close());
  const coins=[...p.w.document.querySelectorAll('.online-reward-coin')];
  assert.equal(coins.length,10);
  assert.equal(coins[0].style.getPropertyValue('--reward-delay'),'700ms');
  assert.equal(coins[9].style.getPropertyValue('--reward-delay'),'1240ms');
  p.q('.online-reward-continue').click();
});

test('lançamento financeiro divergente não inicia animação de recompensa',async t=>{
  const p=await scenario({wager:5,amount:999});t.after(()=>p.dom.window.close());
  assert.match(p.q('.online-reward-label').textContent,/Recompensa oficial ainda não disponível/);
  assert.equal(p.q('.online-reward-coin'),null);
  assert.equal(p.q('.online-reward-gain').textContent,'');
});

test('batalha livre mostra uma Coroa sem pote; derrota não mostra ganho',async t=>{
  const free=await scenario({wager:0,amount:1,reduced:true});t.after(()=>free.dom.window.close());
  assert.equal(free.q('.online-reward-pot').textContent,'1 COROA');
  assert.equal(free.q('.online-reward-label').textContent,'BATALHA LIVRE');
  assert.equal(free.q('.online-reward-gain').textContent,'+1 COROA');
  assert.equal(free.q('.online-reward-coin'),null,'prefers-reduced-motion skips visual coins');
  const lost=await scenario({wager:5,winner:0,seat:1,reduced:true});t.after(()=>lost.dom.window.close());
  assert.equal(lost.q('.online-reward-banner.vanquished .online-reward-outcome').textContent,'DERROTA');
  assert.equal(lost.q('.online-reward-gain').textContent,'Nenhuma Coroa recebida');
  assert.equal(lost.q('.online-reward-streak').textContent,'Sequência atual: 0');
});

test('empate confirmado divide visualmente o pote e refresh não repete a animação',async t=>{
  const p=await scenario({wager:5,winner:null,seat:0,amount:5,refund:true,flightWidth:500});t.after(()=>p.dom.window.close());
  assert.equal(p.q('.online-reward-pot').textContent,'10 COROAS');
  assert.notEqual(p.q('.online-reward-coin').style.getPropertyValue('--reward-end-x'),p.q('.online-reward-coin:nth-of-type(2)').style.getPropertyValue('--reward-end-x'));
  p.q('.online-reward-continue').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(p.q('.online-reward-gain').textContent,'5 COROAS DEVOLVIDAS');
  const before=p.q('.online-reward');
  p.w.dispatchEvent(new p.w.Event('online'));await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(p.q('.online-reward'),before);
  assert.equal(p.w.document.querySelectorAll('.online-reward-coin').length,10);
  assert.equal(p.w.document.querySelectorAll('.online-reward-spark').length,10);
  assert(!p.calls.some(name=>/change_coins|wager_refund/.test(name)));
});

test('estandarte oficial de cada uma das cinco facções aparece antes do pote',async t=>{
  for(const key of ['romanos','orcs','elfos','anoes','egipcios']){
    const p=await scenario({wager:5,factions:[key,'orcs'],holdIntro:true});t.after(()=>p.dom.window.close());
    const flag=p.q('.online-reward-banner.victor img');
    assert.equal(flag?.getAttribute('src'),`assets/faccoes/${key}.png`);
    assert.equal(p.q('.online-reward').classList.contains('intro'),true);
    assert.equal(p.q('.online-reward').classList.contains('pot-visible'),false);
    assert.equal(p.q('.online-reward-pot').textContent,'');
    assert.equal(p.q('.online-reward-banner.victor strong').textContent,'Áureo');
    assert.equal(p.q('.online-reward-banner.victor small').textContent,'Soldado');
    p.q('.online-reward-continue').click();await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(p.q('.online-reward-gain').textContent,'+10 COROAS');
    assert.equal(p.q('.online-reward').classList.contains('complete'),true);
  }
});

test('derrotado usa estandarte discreto; empate mostra dois estandartes neutros',async t=>{
  const lost=await scenario({wager:5,seat:1,holdIntro:true});t.after(()=>lost.dom.window.close());
  assert.equal(lost.q('.online-reward-banner.victor').dataset.faction,'romanos');
  assert.equal(lost.q('.online-reward-banner.vanquished').dataset.faction,'orcs');
  lost.q('.online-reward-continue').click();
  const tie=await scenario({wager:5,winner:null,refund:true,amount:5,holdIntro:true});t.after(()=>tie.dom.window.close());
  assert.equal(tie.w.document.querySelectorAll('.online-reward-banner.neutral').length,2);
  assert.equal(tie.q('.online-reward-banner.victor'),null);
  tie.q('.online-reward-continue').click();
});

test('duas fases separadas: bandeira por 2,5 s, pote e moedas por 3,5 s, ganho somente no fim',async t=>{
  const p=await scenario({wager:5,manualTimeline:true,holdIntro:true});t.after(()=>p.dom.window.close());
  const panel=p.q('.online-reward');
  assert.equal(p.timeline[0]?.delay,2500);
  assert.equal(panel.classList.contains('intro'),true);
  assert.equal(panel.classList.contains('pot-visible'),false);
  assert.equal(p.q('.online-reward-pot').textContent,'');
  assert.equal(p.q('.online-reward-gain').textContent,'');
  p.timeline[0].run();
  assert.equal(panel.classList.contains('intro'),false);
  assert.equal(panel.classList.contains('pot-visible'),true);
  assert.equal(p.q('.online-reward-banner.victor img').getAttribute('src'),'assets/faccoes/romanos.png');
  assert.equal(p.q('.online-reward-pot').textContent,'10 COROAS');
  assert.equal(p.q('.online-reward-gain').textContent,'');
  assert.equal(p.timeline[1]?.delay,3500);
  const css=fs.readFileSync('supabase-online.css','utf8');
  assert.match(css,/reward-to-banner 2\.1s/);
  assert.match(css,/reward-banner-unfurl 1\.5s[^;]*\.5s/);
  p.timeline[1].run();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(panel.classList.contains('complete'),true);
  assert.equal(p.q('.online-reward-gain').textContent,'+10 COROAS');
  assert.equal(p.walletReads,2);
  assert(!p.calls.some(name=>/change_coins|wager_win|online_win_reward/.test(name)));
});

test('batalha livre mantém duas fases e só uma Coroa oficial',async t=>{
  const p=await scenario({wager:0,manualTimeline:true,holdIntro:true});t.after(()=>p.dom.window.close());
  assert.equal(p.q('.online-reward').classList.contains('intro'),true);
  assert.equal(p.q('.online-reward-pot').textContent,'');
  p.timeline[0].run();
  assert.equal(p.q('.online-reward-label').textContent,'BATALHA LIVRE');
  assert.equal(p.q('.online-reward-pot').textContent,'1 COROA');
  assert.equal(p.w.document.querySelectorAll('.online-reward-coin').length,1);
  assert.equal(p.q('.online-reward-gain').textContent,'');
  p.timeline[1].run();
  assert.equal(p.q('.online-reward-gain').textContent,'+1 COROA');
});

test('resultado online mantém vencedor, derrotado, dados e pote na mesma arena',async t=>{
  const p=await scenario({wager:5,geometry:true});t.after(()=>p.dom.window.close());
  const panel=p.q('#online-reward');
  assert.equal(panel.parentElement,p.q('#end-screen'));
  assert.equal(p.q('#end-screen').classList.contains('online-result-active'),true);
  assert.equal(panel.querySelectorAll('.online-reward-banner').length,2);
  assert.equal(panel.querySelector('.online-reward-banner.victor .online-reward-outcome').textContent,'VITÓRIA');
  assert.equal(panel.querySelector('.online-reward-banner.vanquished .online-reward-outcome').textContent,'DERROTA');
  assert.equal(panel.querySelector('.online-reward-banner.victor [data-stat="wins"]').textContent,'6');
  assert.equal(panel.querySelector('.online-reward-banner.vanquished [data-stat="losses"]').textContent,'4');
  assert.equal(panel.querySelector('.online-reward-pot').textContent,'10 COROAS');
  assert.equal(panel.querySelector('.online-reward-continue').closest('#online-reward'),panel);
  assert(!panel.textContent.includes('@'));
});

test('moedas partem do recipiente e terminam sobre a bandeira vencedora, inclusive se ela for do assento 1',async t=>{
  const p=await scenario({wager:5,winner:1,seat:0,geometry:true});t.after(()=>p.dom.window.close());
  const coin=p.q('.online-reward-coin');
  assert.equal(coin.style.getPropertyValue('--reward-start-x'),'640px');
  assert.equal(coin.style.getPropertyValue('--reward-start-y'),'390px');
  assert.equal(coin.style.getPropertyValue('--reward-end-x'),'260px');
  assert.equal(coin.style.getPropertyValue('--reward-end-y'),'243px');
  assert.equal(p.q('.online-reward-gain').textContent,'');
  assert.equal(p.q('.online-reward-banner.victor').dataset.seat,'1');
  p.q('.online-reward-continue').click();
});

test('composição mobile preserva ordem visual sem coluna horizontal excedente',()=>{
  const css=fs.readFileSync('supabase-online.css','utf8');
  assert(css.includes('@media (max-width: 760px)'));
  assert(css.includes('.online-reward-stage { grid-template-columns: minmax(0,1fr) minmax(0,1fr); grid-template-rows: auto auto'));
  assert.match(css,/\.online-reward-center \{ grid-column: 1 \/ -1; grid-row: 2/);
  assert.match(css,/\.online-reward \{[^}]*overflow: auto/);
});
