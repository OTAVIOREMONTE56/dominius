const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
test('two DOM clients: local/BOT preserved, online preparation, chat, movement and restoration',async()=>{
  const db=new PGlite(),pages=[],subscriptions=[];let queue=Promise.resolve();
  const uids=['20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'];
  const execute=(uid,sql,params=[])=>{
    const work=queue.then(async()=>{
      await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
      return db.query(sql,params);
    });queue=work.catch(()=>{});return work;
  };
  const keys={dominius_create_room:['p_faction'],dominius_join_room:['p_code','p_faction'],dominius_wager_offer:['p_code'],dominius_snapshot:['p_room'],
    dominius_confirm_army:['p_room','p_pieces'],dominius_move:['p_room','p_piece','p_x','p_y','p_version','p_request'],
    dominius_chat:['p_room','p_body','p_request'],dominius_heartbeat:['p_room'],dominius_leave:['p_room']};
  const until=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error(label);};
  const errors=[];
  async function page(index) {
    const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
    const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace(/<script[^>]*src=[^>]+><\/script>/g,''),{url:'http://localhost:8000/',runScripts:'dangerously',virtualConsole:console});
    pages.push(dom);const w=dom.window;
    // Nenhum timer periódico roda: movimento/chat precisam chegar por eventos.
    const intervals=new Map();let timerId=0,snapshots=0;
    w.setInterval=(callback,delay)=>{intervals.set(++timerId,{callback,delay});return timerId;};
    w.clearInterval=id=>intervals.delete(id);
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
    w.audioManager={unlock(){},playAmbient(){},stopAmbient(){},playPassos(){},playEspadas(){},playVitoria(){},playDerrota(){},playDesarme(){},playExplosao(){}};
    w.matchMedia=()=>({matches:true});
    const user={id:uids[index],email:`player${index}@example.test`};
    const mock={
      channel(){const callbacks=[];const channel={on(type,filter,callback){callbacks.push({filter,callback});return channel;},subscribe(callback){subscriptions.push({channel,callbacks,status:callback,owner:w});setTimeout(()=>callback('SUBSCRIBED'),0);return channel;}};return channel;},
      removeChannel(channel){const i=subscriptions.findIndex(s=>s.channel===channel);if(i>=0)subscriptions.splice(i,1);return Promise.resolve();},
      from(){let room;const query={select(){return query;},eq(k,v){room=v;return query;},order(){return query;},limit(){return execute(user.id,'select id,user_id,body,created_at from public.chat_messages where room_id=$1 order by id desc limit 100',[room]).then(r=>({data:r.rows,error:null}));}};return query;},
    };
    w.DominiusCloud={configured:true,session:async()=>({user}),client:async()=>mock,rpc:async(name,args)=>{
      if(name==='dominius_snapshot')snapshots++;
      assert(keys[name],name);const values=keys[name].map(k=>k==='p_pieces'?JSON.stringify(args[k]):args[k]);
      const r=await execute(user.id,`select public.${name}(${values.map((v,i)=>'$'+(i+1)).join(',')}) as data`,values);
      if(name!=='dominius_snapshot') {
        const table=name==='dominius_chat'?'chat_messages':name==='dominius_move'?'match_moves':name==='dominius_heartbeat'?'room_players':'matches';
        setTimeout(()=>subscriptions.forEach(s=>{
          if(name==='dominius_move'){
            const version=args.p_version+1;
            s.callbacks.filter(c=>c.filter.table==='matches').forEach(c=>c.callback({new:{version}}));
            s.callbacks.filter(c=>c.filter.table==='match_moves').forEach(c=>c.callback({new:{turn_number:version}}));
          }else {
            const event=table==='matches'||name==='dominius_heartbeat'?'UPDATE':'INSERT';
            s.callbacks.filter(c=>c.filter.table===table&&(c.filter.event==='*'||c.filter.event===event))
              .forEach(c=>c.callback({eventType:event,new:{}}));
          }
        }),0);
      }
      return r.rows[0].data;
    }};
    for(const file of ['bot.js','game-rules.js','app.js','supabase-online.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(file,'utf8');w.document.body.append(script);}
    const click=selector=>w.document.querySelector(selector).click();
    return {w,dom,click,q:s=>w.document.querySelector(s),intervals,get snapshots(){return snapshots;}};
  }
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(fs.readFileSync('supabase-setup.sql','utf8'));
    for(const id of uids)await db.query('insert into auth.users(id) values($1)',[id]);
    const a=await page(0),b=await page(1);
    a.w.eval("els.gameMode.value='bot';startGame();confirmArmy();");
    assert.equal(a.w.eval('state.phase'),'battle');assert.equal(a.q('#board').children.length,100);assert.equal(a.q('#board').querySelectorAll('.blocked').length,8);
    assert.equal(a.w.eval('state.players[1].pieces.length'),40);
    a.w.eval("restartGame();els.gameMode.value='pvp';startGame();confirmArmy();continueToNextPlayer();confirmArmy();");
    assert.equal(a.w.eval('state.phase'),'battle');a.w.eval('restartGame()');
    a.click('#online-entry');await until(()=>a.q('#online-notice').textContent.includes('Escolha'),'authenticated lobby');
    a.click('#online-create');await until(()=>a.q('#online-room-code').textContent.includes('Código'),'create');
    const code=a.q('#online-room-code').textContent.split(': ')[1];
    b.click('#online-entry');await until(()=>b.q('#online-notice').textContent.includes('Escolha'),'second lobby');
    b.q('#online-code').value=code;b.q('#online-faction').value='orcs';b.q('#online-join-form').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>!a.q('#online-prepare').disabled&&!b.q('#online-prepare').disabled,'both connected');
    a.click('#online-prepare');b.click('#online-prepare');
    assert.equal(a.w.eval('state.players[0].pieces.length'),40);assert.equal(a.w.eval('state.players[1].pieces.length'),0);
    a.click('[data-x="0"][data-y="0"]');a.click('[data-x="1"][data-y="0"]');
    assert.equal(a.w.eval('state.board[0][1].piece.roleKey'),'objective');
    a.click('#confirm-army-btn');await until(()=>a.q('#online-battle-status').textContent==='Aguardando adversário','first confirmation');
    assert.equal(b.w.eval('state.players[0].pieces.length'),0,'no enemy preparation after ready');
    b.click('#confirm-army-btn');await until(()=>a.w.eval('state.phase')==='battle'&&b.w.eval('state.phase')==='battle','battle starts');
    assert.equal(a.w.eval('state.players[1].pieces.length'),40);assert.equal(a.w.eval('state.players[1].pieces.some(p=>p.roleKey)'),false);
    a.click('[data-x="0"][data-y="3"]');assert(a.w.eval('state.selectedPiece'));
    a.q('#online-message').value='<img src=x onerror=alert(1)>';a.q('#online-chat-form').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>b.q('#online-messages').textContent.includes('<img'),'chat delivery');
    assert.equal(b.q('#online-messages img'),null,'untrusted text never becomes HTML');
    assert(a.w.eval('state.selectedPiece'),'chat preserves selection');
    await queue;await new Promise(r=>setTimeout(r,20));
    const snapshotsBeforeMove=[a.snapshots,b.snapshots];
    a.click('[data-x="0"][data-y="4"]');await until(()=>b.w.eval('state.currentTurn')===1,'turn synchronized');
    await queue;await new Promise(r=>setTimeout(r,20));
    assert.deepEqual([a.snapshots-snapshotsBeforeMove[0],b.snapshots-snapshotsBeforeMove[1]],[1,1],
      'RPC e dois eventos Realtime da mesma versao exigem um snapshot por cliente');
    assert.equal(b.w.eval('state.board[4][0].piece.playerIndex'),0);
    // Authenticated rejoin from a fresh page restores confirmed pieces and history.
    const restored=await page(0);restored.click('#online-entry');await until(()=>restored.q('#online-notice').textContent.includes('Escolha'),'restore lobby');
    restored.q('#online-code').value=code;restored.q('#online-join-form').dispatchEvent(new restored.w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>!restored.q('#online-room-info').hidden,'restored room');restored.click('#online-prepare');
    assert.equal(restored.w.eval('state.board[4][0].piece.roleKey'),'rank3');
    for(const p of [a,b,restored]) {
      assert.equal(p.q('#battle-log'),null);
      const panel=p.q('#lost-pieces-panel');
      assert.equal(panel.open,false);
      assert.equal(panel.previousElementSibling.id,'board');
      assert.equal(p.q('.right-panel #lost-pieces'),null);
      assert(p.q('.right-panel #online-chat #online-chat-form'));
      panel.querySelector('summary').click();assert.equal(panel.open,true);
      assert.deepEqual([...p.w.document.querySelectorAll('.banner-counter')].map(el=>el.textContent),['40 / 40','40 / 40']);
      assert.equal(p.w.document.querySelectorAll('.lost-piece-list .empty').length,2);
    }
    // Snapshot após perdas de ambos os exércitos: entrega somente por Realtime.
    await queue;await db.exec('reset role');
    await db.query(`update public.match_pieces set lost=true,x=-1,y=-1 where id in
      (select id from public.match_pieces where owner_id=$1 and role='rank3' limit 3)`,[uids[0]]);
    await db.query(`update public.match_pieces set lost=true,x=-1,y=-1 where id in
      (select id from public.match_pieces where owner_id=$1 and role='trap' limit 1)`,[uids[1]]);
    await db.exec('update public.matches set version=version+1');
    subscriptions.forEach(s=>s.callbacks.filter(c=>c.filter.table==='matches').forEach(c=>c.callback()));
    await until(()=>[a,b,restored].every(p=>p.q('.banner-counter').textContent==='37 / 40'),'loss counters synchronized');
    for(const p of [a,b,restored]) {
      assert.deepEqual([...p.w.document.querySelectorAll('.banner-counter')].map(el=>el.textContent),['37 / 40','39 / 40']);
      const cards=p.w.document.querySelectorAll('.player-card');
      assert.deepEqual([...cards[0].querySelectorAll('li strong')].map(el=>el.textContent),['37 / 40','3','Confirmado']);
      assert.deepEqual([...cards[1].querySelectorAll('li strong')].map(el=>el.textContent),['39 / 40','1','Confirmado']);
      assert.deepEqual([...cards[0].querySelectorAll('li > span')].map(el=>el.textContent),['Peças','Perdidas','Status']);
      assert.equal(p.q('#lost-pieces-panel').open,true,'snapshot preserves expanded panel');
      p.q('#lost-pieces-panel summary').click();assert.equal(p.q('#lost-pieces-panel').open,false);
      const groups=p.w.document.querySelectorAll('.lost-piece-list');
      assert.deepEqual([...groups[0].children].map(el=>el.textContent),['Legionário x3']);
      assert.deepEqual([...groups[1].children].map(el=>el.textContent),[p.w.eval("FACTIONS.orcs.names.trap")+' x1']);
      assert(p.w.eval('state.log.length')>0,'internal logs preserved');
    }
    await queue;await new Promise(r=>setTimeout(r,20));
    assert.equal(subscriptions.filter(s=>s.owner===restored.w).length,1);
    const sub=subscriptions.find(s=>s.owner===restored.w);
    assert(!sub.callbacks.some(c=>c.filter.table==='match_pieces'),'secret pieces never subscribed');
    assert(restored.intervals.size===2);
    assert([...restored.intervals.values()].some(t=>t.delay===60000));
    sub.status('CHANNEL_ERROR',new Error('simulated disconnect'));
    assert([...restored.intervals.values()].some(t=>t.delay===3000));
    assert(![...restored.intervals.values()].some(t=>t.delay===60000));
    sub.status('SUBSCRIBED');
    assert.equal(restored.intervals.size,2,'reconnect replaces fallback without duplicate timers');
    await queue;await new Promise(r=>setTimeout(r,20));
    const beforeResume=restored.snapshots;
    restored.w.dispatchEvent(new restored.w.Event('online'));
    await until(()=>restored.snapshots>beforeResume,'network return synchronizes immediately');
    await restored.w.dominiusMultiplayer.leave();
    await queue;await new Promise(r=>setTimeout(r,20));
    assert.equal(restored.intervals.size,0);
    assert.equal(subscriptions.filter(s=>s.owner===restored.w).length,0);
    const afterLeave=restored.snapshots;
    sub.callbacks.forEach(c=>c.callback());sub.status('SUBSCRIBED');
    restored.w.dispatchEvent(new restored.w.Event('online'));
    await new Promise(r=>setTimeout(r,20));
    assert.equal(restored.snapshots,afterLeave,'late callbacks cannot resurrect a departed room');
    assert.equal(restored.intervals.size,0);
    assert.deepEqual(errors,[]);
  } finally {pages.forEach(p=>p.window.close());await queue;await db.close();}
});
