const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

test('legacy cleanup closes only unpaid accepted challenges without touching wallets or finished games',async()=>{
  const db=new PGlite();
  const users=['00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000042'];
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(fs.readFileSync('supabase-setup.sql','utf8'));
    for(const id of users)await db.query('insert into auth.users(id) values($1)',[id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[0]]);
    await db.exec('set role authenticated');
    const legacy=await one("select public.dominius_create_wager_room('romanos',20)");
    const finished=await one("select public.dominius_create_room('romanos')");
    await db.exec('reset role');
    await db.query("insert into public.room_players(room_id,user_id,seat,faction) values($1,$2,1,'orcs')",[legacy,users[1]]);
    await db.query("update public.rooms set status='preparing' where id=$1",[legacy]);
    await db.query("update public.matches set phase='finished' where room_id=$1",[finished]);
    await db.query("update public.rooms set status='finished' where id=$1",[finished]);
    const balances=await db.query('select user_id,balance from public.wallets order by user_id');
    const entries=Number(await one('select count(*) from public.coin_transactions'));
    const cleanup=fs.readFileSync('supabase-close-legacy-wagers.sql','utf8');
    const matchId=await one('select id from public.matches where room_id=$1',[legacy]);
    await db.query("insert into public.coin_transactions(user_id,amount,type,match_id,balance_after) values($1,-20,'wager_lock',$2,80)",[users[0],matchId]);
    await assert.rejects(db.exec(cleanup),/movimentação financeira/);
    await db.exec('rollback');
    assert.equal(await one('select phase from public.matches where room_id=$1',[legacy]),'setup');
    await db.query("delete from public.coin_transactions where match_id=$1 and type='wager_lock'",[matchId]);
    await db.exec(cleanup);await db.exec(cleanup);
    assert.equal(await one('select phase from public.matches where room_id=$1',[legacy]),'closed');
    assert.equal(await one('select status from public.rooms where id=$1',[legacy]),'closed');
    assert.equal(await one('select wager_status from public.matches where room_id=$1',[legacy]),'pending');
    assert.equal(await one('select phase from public.matches where room_id=$1',[finished]),'finished');
    assert.equal(await one('select status from public.rooms where id=$1',[finished]),'finished');
    assert.deepEqual((await db.query('select user_id,balance from public.wallets order by user_id')).rows,balances.rows);
    assert.equal(Number(await one('select count(*) from public.coin_transactions')),entries);
    await db.exec(fs.readFileSync('supabase-economy.sql','utf8'));
  }finally{await db.close();}
});
