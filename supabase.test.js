const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
test('Supabase SQL: installation, RLS, secret setup, rules, chat and objective victory',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    const sql=fs.readFileSync('supabase-setup.sql','utf8');
    await db.exec(sql);await db.exec(sql); // Instalação reexecutável.
    const users=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
    for(const id of users)await db.query('insert into auth.users(id) values($1)',[id]);
    const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
    await as(users[0]);const room=await scalar("select public.dominius_create_room('romanos')");
    const code=await scalar('select code from public.rooms where id=$1',[room]);
    await as(users[2]);assert.equal(await scalar('select count(*) from public.rooms'),0);
    await assert.rejects(db.query('select public.dominius_snapshot($1)',[room]));
    await as(users[1]);await db.query("select public.dominius_join_room($1,'orcs')",[code]);
    const snap=()=>scalar('select public.dominius_snapshot($1)',[room]);
    const roles={objective:1,trap:6,rank10:1,rank9:1,rank8:2,rank7:3,rank6:4,rank5:4,rank4:4,rank3:5,rank2:8,rank1:1};
    const army=seat=>Object.entries(roles).flatMap(([role,n])=>Array(n).fill(role)).map((role,i)=>({role,x:i%10,y:Math.floor(i/10)+seat*6}));
    const confirm=pieces=>db.query('select public.dominius_confirm_army($1,$2::jsonb)',[room,JSON.stringify(pieces)]);
    const b=army(1);[b[0].role,b[1].role]=[b[1].role,b[0].role];
    await confirm(b);
    await as(users[0]);let s=await snap();assert.equal(s.pieces.length,0,'adversary setup never returned');
    assert.equal(await scalar('select count(*) from public.match_pieces'),0,'RLS hides ALL opponent rows');
    await assert.rejects(confirm(army(0).slice(1)));
    const duplicate=army(0);duplicate[1].x=duplicate[0].x;await assert.rejects(confirm(duplicate));
    await assert.rejects(db.query("update public.matches set turn=1 where room_id=$1",[room]));
    await confirm(army(0));s=await snap();assert.equal(s.match.phase,'battle');assert.equal(s.pieces.length,80);
    assert(s.pieces.filter(p=>p.seat===1).every(p=>!('role' in p)));
    const piece=s.pieces.find(p=>p.seat===0&&p.x===0&&p.y===3);
    const req='10000000-0000-0000-0000-000000000001';
    await db.query('select public.dominius_move($1,$2,0,4,$3,$4)',[room,piece.id,s.match.version,req]);
    await db.query('select public.dominius_move($1,$2,0,4,$3,$4)',[room,piece.id,s.match.version,req]);
    assert.equal((await snap()).moves.length,1,'idempotent movement');
    await assert.rejects(db.query('select public.dominius_move($1,$2,0,5,$3,gen_random_uuid())',[room,piece.id,(await snap()).match.version]));
    const version=(await snap()).match.version;
    await db.query("select public.dominius_chat($1,'<b>Olá</b>',gen_random_uuid())",[room]);
    assert.equal((await snap()).match.version,version,'chat does not change board');
    await as(users[1]);assert.equal(await scalar('select count(*) from public.chat_messages'),1);
    await as(users[2]);assert.equal(await scalar('select count(*) from public.chat_messages'),0);
    await assert.rejects(db.query("select public.dominius_chat($1,'intruso',gen_random_uuid())",[room]));
    await db.exec('reset role');
    // Compare every possible mobile attacker/defender against the existing JS rules.
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('game-rules.js','utf8')+';globalThis.rules={resolveBattle,PIECE_CONFIG};',ctx);
    for(let rank=1;rank<=10;rank++)for(const d of Object.keys(roles)) {
      const expected=ctx.rules.resolveBattle({...ctx.rules.PIECE_CONFIG[`rank${rank}`],name:'A'},{...ctx.rules.PIECE_CONFIG[d],name:'D'});
      assert.equal(await scalar('select dominius_private.combat($1,$2)',[`rank${rank}`,d]),expected.outcome);
    }
    // Arrange a capture with real database pieces, then use the public RPC.
    await db.query("update public.match_pieces set x=0,y=5 where match_id=$1 and seat=1 and role='objective'",[s.match.id]);
    await db.query('update public.matches set turn=0 where id=$1',[s.match.id]);
    await as(users[0]);s=await snap();
    await db.query('select public.dominius_move($1,$2,0,5,$3,gen_random_uuid())',[room,piece.id,s.match.version]);
    s=await snap();assert.equal(s.match.winner,0);assert.equal(s.match.phase,'finished');
    assert(s.pieces.filter(p=>p.seat===1&&!p.lost).every(p=>!('role' in p)),'unrevealed surviving pieces remain secret even at victory');
    await db.exec('reset role; set role anon');await assert.rejects(db.query('select public.dominius_snapshot($1)',[room]));
  } finally {await db.close();}
});
