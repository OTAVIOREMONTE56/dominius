const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('Coroas UI reads server balance, gates wagers and previews the join challenge',async t=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script[^>]*src=[^>]+><\/script>/g,''),
    {url:'http://localhost:8000/',runScripts:'dangerously'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.matchMedia=()=>({matches:true});w.audioManager={};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let serverBalance=120;
  const calls=[];
  const db={from(table){assert.equal(table,'wallets');const query={select(){return query;},eq(){return query;},async single(){return {data:{balance:serverBalance,gem_balance:0},error:null};}};return query;}};
  const cloud={configured:false,session:async()=>({user:{id:'11111111-1111-1111-1111-111111111111'}}),client:async()=>db,
    rpc:async(name,args)=>{calls.push({name,args});if(name==='dominius_wager_offer')return {wager_amount:100,pot_amount:200,opponent:'Comandante Rival'};return null;}};
  w.DominiusCloud=cloud;
  for(const file of ['bot.js','game-rules.js','app.js','economy.js','supabase-online.js']){
    const script=w.document.createElement('script');script.textContent=fs.readFileSync(file,'utf8');w.document.body.append(script);
  }
  const q=selector=>w.document.querySelector(selector);
  await w.DominiusEconomy.wallet();
  assert.equal(q('#coin-balance-badge strong').textContent,'120');
  assert.equal(q('#coin-balance-badge [data-gems]').textContent,'0');
  q('input[name="online-mode"][value="wager"]').click();
  q('#online-entry').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(q('#online-wager-options').hidden,false);
  assert.deepEqual([...q('#online-wager-options').querySelectorAll('input')].map(el=>el.value),['5','10','20','50','100']);
  assert.deepEqual([...q('#online-wager-options').querySelectorAll('input')].map(el=>el.disabled),[false,false,false,false,false]);
  q('input[name="wager-amount"][value="100"]').click();
  assert(q('#online-wager-terms').textContent.includes('APOSTA: 100 COROAS · POTE: 200 COROAS'));
  q('#online-create').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert(calls.some(call=>call.name==='dominius_create_wager_room'&&call.args.p_wager===100));
  assert(!calls.some(call=>call.name==='dominius_create_room'),'wager selection never creates a free room');
  calls.length=0;
  q('#online-code').value='A12B3C';q('#online-join-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert(q('#online-challenge-terms').textContent.includes('Pote: 200 Coroas'));
  assert(q('#online-challenge-terms').textContent.includes('Comandante Rival'));
  assert.equal(q('#online-wager-challenge').hidden,false);
  assert(!calls.some(call=>call.name==='dominius_join_room'),'join waits for acceptance');
  q('#online-accept-wager').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert(calls.some(call=>call.name==='dominius_accept_wager'&&call.args.p_wager===100));
  calls.length=0;
  serverBalance=40;await w.DominiusEconomy.wallet();
  q('#online-entry').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([...q('#online-wager-options').querySelectorAll('input')].map(el=>el.disabled),[false,false,false,true,true]);
  q('#online-accept-wager').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert(!calls.some(call=>call.name==='dominius_join_room'),'insufficient balance prevents acceptance');
  assert(q('#online-notice').textContent.includes('Saldo de Coroas insuficiente'));
});
