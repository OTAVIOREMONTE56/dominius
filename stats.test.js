const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');

test('estatísticas oficiais, patentes, ranking, RLS e migração reexecutável',async()=>{
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const setup=fs.readFileSync('supabase-setup.sql','utf8');
  const stats=fs.readFileSync('supabase-stats.sql','utf8');
  await db.exec(setup);
  const freeFix=fs.readFileSync('supabase-free-battle-fix.sql','utf8');
  await db.exec(freeFix);await db.exec(freeFix);
  const users=['00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012'];
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const admin=()=>db.exec('reset role');
  const as=async id=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const state=async id=>{await admin();return (await db.query('select matches_played,wins,losses,draws,current_win_streak,best_win_streak from public.player_stats where user_id=$1',[id])).rows[0];};
  const balance=async id=>{await admin();return one('select balance from public.wallets where user_id=$1',[id]);};
  try{
    await db.query('insert into auth.users(id) values($1)',[users[0]]);
    await db.exec(stats);
    await db.query('insert into auth.users(id) values($1)',[users[1]]);
    assert.deepEqual(await state(users[0]),{matches_played:0,wins:0,losses:0,draws:0,current_win_streak:0,best_win_streak:0});
    assert.equal(await balance(users[0]),100);
    await db.exec(stats);
    const play=async winner=>{
      await admin();const room=await one("insert into public.rooms(code,host_id) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),$1) returning id",[users[0]]);
      await db.query("insert into public.room_players(room_id,user_id,seat,faction) values($1,$2,0,'romanos'),($1,$3,1,'orcs')",[room,users[0],users[1]]);
      const match=await one('insert into public.matches(room_id) values($1) returning id',[room]);
      await db.query("update public.matches set phase='battle' where id=$1",[match]);
      await db.query("update public.matches set phase='finished',winner=$2::smallint where id=$1",[match,winner]);
      await db.query('update public.matches set version=version+1 where id=$1',[match]);
      return match;
    };
    await admin();await db.query('delete from public.player_stats where user_id=$1',[users[0]]);
    await as(users[0]);const repaired=await one('select public.dominius_my_stats()');
    assert.equal(repaired.patent,'Recruta');assert.equal(repaired.matches_played,0);
    assert.equal(await balance(users[0]),100);
    await admin();await db.query('delete from public.player_stats where user_id=$1',[users[1]]);
    const free=await play(0);
    assert.equal(await balance(users[0]),101,'free winner receives exactly one Crown');
    assert.equal(await balance(users[1]),100,'free loser receives none');
    assert.equal(await one("select amount from public.coin_transactions where match_id=$1 and type='online_win_reward'",[free]),1);
    assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=$1 and type='wager_lock'",[free])),0);
    assert.equal(await one('select wager_amount from public.matches where id=$1',[free]),0);
    assert.equal((await state(users[1])).losses,1,'missing stats row is repaired during official result');
    await play(0);await play(1);
    const beforeTie=[await balance(users[0]),await balance(users[1])];
    const tied=await play(null);
    assert.deepEqual([await balance(users[0]),await balance(users[1])],beforeTie,'draw pays nobody');
    assert.equal(Number(await one('select count(*) from public.coin_transactions where match_id=$1',[tied])),0);
    await play(0);
    assert.deepEqual(await state(users[0]),{matches_played:5,wins:3,losses:1,draws:1,current_win_streak:1,best_win_streak:2});
    assert.deepEqual(await state(users[1]),{matches_played:5,wins:1,losses:3,draws:1,current_win_streak:0,best_win_streak:1});
    const cancel=await one("insert into public.rooms(code,host_id) values('ABCDEF',$1) returning id",[users[0]]);
    await db.query('insert into public.matches(room_id) values($1)',[cancel]);
    await db.query("update public.matches set phase='closed' where room_id=$1",[cancel]);
    assert.equal((await state(users[0])).matches_played,5);
    for(const [wins,patent] of [[0,'Recruta'],[3,'Soldado'],[10,'Guerreiro'],[20,'Sargento'],[35,'Capitão'],[55,'Comandante'],[80,'General'],[120,'Marechal'],[200,'Lenda dos Reinos']])
      assert.equal(await one('select dominius_private.patent($1)',[wins]),patent);
    await as(users[0]);
    const mine=await one('select public.dominius_my_stats()');assert.equal(mine.patent,'Soldado');assert.equal(mine.win_rate,60);
    assert.equal(await one('select count(*) from public.player_stats'),1);
    await assert.rejects(db.query('update public.player_stats set wins=999'));
    await assert.rejects(db.query('delete from public.player_stats'));
    await admin();
    for(const action of ['INSERT','UPDATE','DELETE'])assert.equal(await one('select has_table_privilege($1,$2,$3)',['authenticated','public.player_stats',action]),false);
    for(let n=20;n<72;n++){
      const id=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
      await db.query("insert into auth.users(id,raw_user_meta_data) values($1,jsonb_build_object('display_name',$2::text))",[id,`Jogador ${n}`]);
      await db.query('update public.player_stats set wins=10,matches_played=10 where user_id=$1',[id]);
    }
    await as(users[1]);const ranking=await one('select public.dominius_ranking()');
    assert.equal(ranking.top.length,50);assert.equal(ranking.me.position,54);
    assert.equal(ranking.top[0].name,'Jogador 20');
    assert.equal(ranking.top[49].name,'Jogador 69');
    assert.equal(ranking.top[0].matches_played,10);
    assert.equal(ranking.top[0].losses,0);
    assert.equal(ranking.top[0].best_win_streak,0);
    assert.equal(ranking.top[0].win_rate,100);
    assert.equal(JSON.stringify(ranking).includes('@'),false,'ranking does not expose email');
    await admin();
    for(const [n,wins,matches,streak,best] of [[20,20,20,2,2],[21,20,20,3,3],[22,20,25,2,5],[23,20,20,2,5],[24,21,30,0,0]]){
      const id=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
      await db.query('update public.player_stats set wins=$2::integer,matches_played=$3::integer,losses=$3::integer-$2::integer,current_win_streak=$4::integer,best_win_streak=$5::integer where user_id=$1',[id,wins,matches,streak,best]);
    }
    await as(users[1]);const sorted=await one('select public.dominius_ranking()');
    assert.deepEqual(sorted.top.slice(0,5).map(row=>row.name),['Jogador 24','Jogador 21','Jogador 23','Jogador 22','Jogador 20']);
    assert.equal(sorted.top.length,50);
    await admin();await db.query('delete from public.profiles where id=$1',['00000000-0000-0000-0000-000000000024']);
    await as(users[1]);const fallback=await one('select public.dominius_ranking()');
    assert.equal(fallback.top[0].name,'Comandante');
    await admin();await db.exec(stats);
    assert.equal((await state(users[0])).wins,3);
  }finally{await db.close();}
});

test('perfil e ranking exibem dados oficiais sem duplicar elementos',async()=>{
  const page=fs.readFileSync('index.html','utf8');
  assert.match(page,/<button id="ranking-entry"[^>]*>RANKING<small>Top 50<\/small><\/button>/);
  const dom=new JSDOM('<button id="account-entry" data-account-open></button><button id="ranking-entry"></button><dialog id="account-dialog"><div id="account-view"></div></dialog>',{url:'http://localhost',runScripts:'outside-only'});
  const {window}=dom;const {document}=window;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const session={user:{id:'u1',email:'test@example.com',user_metadata:{display_name:'Teste'}}};
  const rank=(position,id,name)=>({position,user_id:id,name,patent:'Soldado',wins:3,losses:1,matches_played:4,streak:2,best_win_streak:2,win_rate:75});
  window.DominiusCloud={session:async()=>session,errorMessage:e=>e.message,rpc:async name=>name==='dominius_my_stats'
    ? {matches_played:4,wins:3,losses:1,draws:0,current_win_streak:2,best_win_streak:2,win_rate:75,patent:'Soldado'}
    : {top:[rank(1,'u2','Ouro'),rank(2,'u3','Prata'),rank(3,'u4','Bronze')],me:rank(53,'u1','Teste')}};
  window.DominiusEconomy={wallet:async()=>{},history:async()=>[{amount:1,type:'online_win_reward',match_id:null,metadata:{},created_at:'2026-01-01T00:00:00Z'}],format:n=>String(n),gems:7};
  window.eval(fs.readFileSync('account.js','utf8'));
  document.getElementById('account-entry').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(document.getElementById('profile-patent').textContent,'Soldado');
  assert.equal(document.getElementById('profile-gems').textContent,'7');
  assert.equal(document.querySelectorAll('#profile-stats dd').length,8);
  assert.equal(document.getElementById('profile-ranking-position').textContent,'#53');
  assert.match(document.querySelector('#account-coin-history').textContent,/\+1 · Vitória em Batalha Livre/);
  document.getElementById('ranking-entry').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(document.querySelectorAll('#ranking-dialog').length,1);
  assert.equal(document.querySelector('#ranking-title').textContent,'RANKING DOS REINOS');
  assert.equal(document.querySelectorAll('.ranking-list .ranking-row').length,4);
  assert.equal(document.querySelector('.ranking-own-label').textContent,'SUA POSIÇÃO');
  assert.equal(document.querySelector('.ranking-row.ranking-me .ranking-position').textContent,'53º');
  for(const place of [1,2,3])assert.equal(document.querySelectorAll(`.ranking-place-${place}`).length,1);
  assert.equal(document.querySelector('.ranking-row .ranking-losses').textContent,'DERROTAS');
  assert.equal(document.querySelector('.ranking-list .ranking-best').textContent,'2');
  assert.equal(document.querySelector('#ranking-dialog').textContent.includes('test@example.com'),false);
  dom.window.close();
});
