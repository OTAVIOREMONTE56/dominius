const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

async function fixture(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  return db;
}

test('100 Coroas, 0 Gemas, apostas, pote, reembolso e idempotência',async()=>{
  const db=await fixture();
  const users=['00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012'];
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const admin=()=>db.exec('reset role');
  const wallet=async id=>{await admin();return (await db.query('select balance,gem_balance from public.wallets where user_id=$1',[id])).rows[0];};
  const code=async room=>{await admin();return one('select code from public.rooms where id=$1',[room]);};
  const roles={objective:1,trap:6,rank10:1,rank9:1,rank8:2,rank7:3,rank6:4,rank5:4,rank4:4,rank3:5,rank2:8,rank1:1};
  const army=seat=>Object.entries(roles).flatMap(([role,n])=>Array(n).fill(role)).map((role,i)=>({role,x:i%10,y:Math.floor(i/10)+seat*6}));
  const confirm=async(room,seat,id)=>{await as(id);await db.query('select public.dominius_confirm_army($1,$2::jsonb)',[room,JSON.stringify(army(seat))]);};
  const room=async(wager=20,accept=true)=>{await as(users[0]);const r=await one("select public.dominius_create_wager_room('romanos',$1)",[wager]);
    if(accept){const c=await code(r);await as(users[1]);await db.query("select public.dominius_accept_wager($1,'orcs',$2)",[c,wager]);}return r;};
  const finish=async(room,winner,phase='finished')=>{await admin();await db.query('update public.matches set phase=$2,winner=$3 where room_id=$1',[room,phase,winner]);};
  try{
    const sql=fs.readFileSync('supabase-setup.sql','utf8');await db.exec(sql);await db.exec(sql);
    for(const id of users)await db.query('insert into auth.users(id) values($1)',[id]);
    for(const id of users)assert.deepEqual(await wallet(id),{balance:100,gem_balance:0});
    await as(users[0]);assert.equal(await one('select count(*) from public.wallets'),1);
    await assert.rejects(db.query('update public.wallets set balance=9999'));
    await assert.rejects(db.query('update public.wallets set gem_balance=9999'));
    await assert.rejects(db.query("insert into public.coin_transactions(user_id,amount,type,balance_after) values($1,900,'admin_adjustment',1000)",[users[0]]));
    await admin();
    for(const table of ['matches','wallets','coin_transactions'])for(const action of ['INSERT','UPDATE','DELETE'])
      assert.equal(await one('select has_table_privilege($1,$2,$3)',['authenticated',`public.${table}`,action]),false);
    assert.equal(await one("select has_function_privilege('authenticated','dominius_private.change_coins(uuid,bigint,text,uuid,jsonb)','EXECUTE')"),false);
    assert.equal(await one("select has_function_privilege('authenticated','dominius_private.join_room_core(text,text,integer)','EXECUTE')"),false);
    assert.equal(await one("select has_function_privilege('authenticated','public.dominius_accept_wager(text,text,integer)','EXECUTE')"),true);
    for(const amount of [5,10,20,50,100]){
      await as(users[0]);const r=await one("select public.dominius_create_wager_room('romanos',$1)",[amount]);
      const c=await code(r);await as(users[1]);await one("select public.dominius_accept_wager($1,'orcs',$2)",[c,amount]);
      assert.equal((await wallet(users[0])).balance,100-amount);
      assert.equal((await wallet(users[1])).balance,100-amount);
      await admin();assert.equal(Number(await one('select pot_amount from public.matches where room_id=$1',[r])),amount*2);
      await as(users[0]);await db.query('select public.dominius_leave($1)',[r]);
      assert.equal((await wallet(users[0])).balance,100);assert.equal((await wallet(users[1])).balance,100);
    }
    for(const amount of [0,250,500]){await as(users[0]);await assert.rejects(db.query("select public.dominius_create_wager_room('romanos',$1)",[amount]),/Aposta inválida/);}
    const pending=await room(20,false);
    const pendingCode=await code(pending);
    await as(users[1]);const offer=await one('select public.dominius_wager_offer($1)',[pendingCode]);
    assert.equal(offer.wager_amount,20);assert.equal(offer.pot_amount,40);assert.equal(offer.opponent,'Comandante');
    await as(users[1]);await assert.rejects(db.query("select public.dominius_join_room($1,'orcs')",[pendingCode]),/Aceite a aposta/);
    await assert.rejects(db.query("select public.dominius_accept_wager($1,'orcs',50)",[pendingCode]),/A aposta mudou/);
    assert.equal((await wallet(users[0])).balance,100);assert.equal((await wallet(users[1])).balance,100);
    await as(users[0]);await db.query('select public.dominius_leave($1)',[pending]);
    assert.equal((await wallet(users[0])).balance,100);assert.equal((await wallet(users[1])).balance,100);
    const win=await room();
    assert.equal((await wallet(users[0])).balance,80);assert.equal((await wallet(users[1])).balance,80,'acceptance locks both stakes');
    await admin();assert.equal(await one('select wager_status from public.matches where room_id=$1',[win]),'locked');
    assert.equal(Number(await one('select pot_amount from public.matches where room_id=$1',[win])),40);
    const winCode=await code(win);
    await as(users[1]);assert.equal(await one("select public.dominius_accept_wager($1,'orcs',20)",[winCode]),win,'duplicate acceptance reconnects');
    assert.equal((await wallet(users[1])).balance,80,'duplicate acceptance does not debit again');
    await as(users[0]);await assert.rejects(db.query('update public.matches set wager_amount=100 where room_id=$1',[win]));
    await confirm(win,0,users[0]);await confirm(win,1,users[1]);
    assert.equal((await wallet(users[0])).balance,80);assert.equal((await wallet(users[1])).balance,80);
    await admin();assert.equal(Number(await one('select pot_amount from public.matches where room_id=$1',[win])),40);
    await finish(win,0);
    assert.equal((await wallet(users[0])).balance,120);assert.equal((await wallet(users[1])).balance,80);
    await admin();await db.query('update public.matches set version=version+1 where room_id=$1',[win]);
    assert.equal((await wallet(users[0])).balance,120);
    const tie=await room();await confirm(tie,0,users[0]);await confirm(tie,1,users[1]);await finish(tie,null);
    assert.equal((await wallet(users[0])).balance,120);assert.equal((await wallet(users[1])).balance,80);
    await admin();await db.query('update public.matches set version=version+1 where room_id=$1',[tie]);
    assert.equal((await wallet(users[0])).balance,120);
    const cancel=await room();await as(users[0]);await db.query('select public.dominius_leave($1)',[cancel]);
    assert.equal((await wallet(users[0])).balance,120);assert.equal((await wallet(users[1])).balance,80);
    await admin();await db.query('update public.matches set version=version+1 where room_id=$1',[cancel]);
    assert.equal((await wallet(users[1])).balance,80);
    await as(users[1]);await assert.rejects(db.query("select public.dominius_create_wager_room('orcs',100)"),/Saldo de Coroas insuficiente/);
    await as(users[0]);const expensive=await one("select public.dominius_create_wager_room('romanos',100)");
    const expensiveCode=await code(expensive);
    await as(users[1]);await assert.rejects(db.query("select public.dominius_accept_wager($1,'orcs',100)",[expensiveCode]),/Saldo de Coroas insuficiente/);
    await admin();await db.query('update public.wallets set gem_balance=1000 where user_id=$1',[users[1]]);
    await as(users[1]);await assert.rejects(db.query("select public.dominius_accept_wager($1,'orcs',100)",[expensiveCode]),/Saldo de Coroas insuficiente/);
    await admin();assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=(select id from public.matches where room_id=$1) and type='wager_win'",[win])),1);
    assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=(select id from public.matches where room_id=$1) and type='wager_refund'",[tie])),2);
    const prize=await one("select metadata from public.coin_transactions where match_id=(select id from public.matches where room_id=$1) and type='wager_win'",[win]);
    assert.equal(prize.room_code,winCode);assert.equal(prize.opponent,'Comandante');
    const request=await one('select gen_random_uuid()');
    await Promise.all(Array.from({length:3},()=>db.query("select dominius_private.change_coins($1,-5,'wager_lock',$2)",[users[0],request])));
    assert.equal((await wallet(users[0])).balance,115,'simultaneous duplicate requests debit once');
    await admin();assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=$1 and type='wager_lock'",[request])),1);
    await as(users[0]);const atomic=await one("select public.dominius_create_wager_room('romanos',100)");
    const atomicCode=await code(atomic);
    await admin();await db.query('update public.wallets set balance=0 where user_id=$1',[users[0]]);
    await db.query('update public.wallets set balance=100 where user_id=$1',[users[1]]);
    await as(users[1]);await assert.rejects(db.query("select public.dominius_accept_wager($1,'orcs',100)",[atomicCode]),/Saldo de Coroas insuficiente/);
    assert.equal((await wallet(users[1])).balance,100,'failed lock rolls back guest debit');
    await admin();assert.equal(Number(await one('select count(*) from public.room_players where room_id=$1',[atomic])),1);
    assert.equal(await one('select wager_status from public.matches where room_id=$1',[atomic]),'pending');
    assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=(select id from public.matches where room_id=$1) and type='wager_lock'",[atomic])),0);
    await as(users[1]);const partial=await one("select public.dominius_create_wager_room('orcs',100)");
    const partialCode=await code(partial);
    await admin();await db.query('update public.wallets set balance=0 where user_id=$1',[users[1]]);
    await db.query('update public.wallets set balance=100 where user_id=$1',[users[0]]);
    await as(users[0]);await assert.rejects(db.query("select public.dominius_accept_wager($1,'romanos',100)",[partialCode]),/Saldo de Coroas insuficiente/);
    assert.equal((await wallet(users[0])).balance,100,'first debit rolls back if second wallet fails');
    await admin();assert.equal(Number(await one("select count(*) from public.coin_transactions where match_id=(select id from public.matches where room_id=$1) and type='wager_lock'",[partial])),0);
  }finally{await db.close();}
});

test('migração preserva contas existentes e roda novamente sem novo bônus',async()=>{
  const db=await fixture();
  try{
    const complete=fs.readFileSync('supabase-setup.sql','utf8');
    const start=complete.indexOf('-- DOMINIUS ECONOMY / COROAS');
    const end=complete.indexOf('-- Revogar EXECUTE padrão',start);
    const migration=fs.readFileSync('supabase-economy.sql','utf8');
    assert.equal(migration,`begin;\n${complete.slice(start,end)}commit;\n`);
    await db.exec(complete.slice(0,start)+complete.slice(end));
    const old='00000000-0000-0000-0000-000000000021';
    const fresh='00000000-0000-0000-0000-000000000022';
    const legacy='00000000-0000-0000-0000-000000000023';
    await db.query('insert into auth.users(id) values($1)',[old]);
    await db.query('insert into auth.users(id) values($1)',[legacy]);
    await db.exec('create table public.wallets(user_id uuid primary key references auth.users(id),balance bigint not null default 500,created_at timestamptz not null default now(),updated_at timestamptz not null default now())');
    await db.query('insert into public.wallets(user_id,balance) values($1,500)',[legacy]);
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query('select balance,gem_balance from public.wallets where user_id=$1',[old])).rows[0],{balance:0,gem_balance:0});
    assert.deepEqual((await db.query('select balance,gem_balance from public.wallets where user_id=$1',[legacy])).rows[0],{balance:500,gem_balance:0});
    assert.equal(Number((await db.query("select count(*) from public.coin_transactions where user_id=$1 and type='initial_balance'",[old])).rows[0].count),0);
    await db.query('insert into auth.users(id) values($1)',[fresh]);
    assert.deepEqual((await db.query('select balance,gem_balance from public.wallets where user_id=$1',[fresh])).rows[0],{balance:100,gem_balance:0});
    assert.equal(Number((await db.query("select count(*) from public.coin_transactions where user_id=$1 and type='initial_balance'",[fresh])).rows[0].count),1);
    await db.exec(migration);
    assert.equal(Number((await db.query('select balance from public.wallets where user_id=$1',[fresh])).rows[0].balance),100);
    await db.query('update public.wallets set balance=500 where user_id=$1',[fresh]);
    await db.exec(migration);
    assert.equal(Number((await db.query('select balance from public.wallets where user_id=$1',[fresh])).rows[0].balance),500,'existing balance is preserved');
    assert.equal(Number((await db.query("select count(*) from public.coin_transactions where user_id=$1 and type='initial_balance'",[fresh])).rows[0].count),1);
  }finally{await db.close();}
});
