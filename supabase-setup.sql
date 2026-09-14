-- DOMINIUS: execute o arquivo inteiro no SQL Editor do projeto Supabase.
-- Instalação transacional; não apaga partidas existentes. Reexecutável para esta versão.
begin;
create schema if not exists dominius_private;
revoke all on schema dominius_private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  created_at timestamptz not null default now()
);
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting','preparing','playing','finished','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  seat smallint not null check (seat in (0,1)),
  faction text not null check (faction in ('romanos','orcs','elfos','anoes','egipcios')),
  ready boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (room_id,user_id), unique(room_id,seat)
);
create index if not exists room_players_user_idx on public.room_players(user_id);
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  phase text not null default 'setup' check (phase in ('setup','battle','finished','closed')),
  turn smallint not null default 0 check (turn in (0,1)),
  version integer not null default 0,
  winner smallint check (winner in (0,1)),
  created_at timestamptz not null default now()
);
-- Segredos: sem publicação Realtime; SELECT direto somente das próprias peças.
create table if not exists public.match_pieces (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  seat smallint not null check (seat in (0,1)),
  role text not null check (role in ('objective','trap','rank1','rank2','rank3','rank4','rank5','rank6','rank7','rank8','rank9','rank10')),
  x smallint not null, y smallint not null,
  lost boolean not null default false,
  check ((lost and x=-1 and y=-1) or (not lost and x between 0 and 9 and y between 0 and 9)),
  check (lost or not (y in (4,5) and x in (2,3,6,7)))
);
create unique index if not exists match_pieces_cell_idx on public.match_pieces(match_id,x,y) where not lost;
create index if not exists match_pieces_owner_idx on public.match_pieces(owner_id,match_id);
create table if not exists public.match_moves (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  turn_number integer not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  unique(match_id,actor_id,request_id), unique(match_id,turn_number)
);
create index if not exists match_moves_room_idx on public.match_moves(room_id,id);
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(room_id,user_id,request_id)
);
create index if not exists chat_messages_room_idx on public.chat_messages(room_id,id desc);

create or replace function dominius_private.new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),32),''),'Comandante'))
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists dominius_new_user on auth.users;
create trigger dominius_new_user after insert on auth.users for each row execute function dominius_private.new_profile();
insert into public.profiles(id,display_name)
select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),32),''),'Comandante') from auth.users
on conflict(id) do nothing;

-- SECURITY DEFINER evita recursão de RLS. Nenhum argumento aceita identidade do cliente.
create or replace function dominius_private.member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.room_players where room_id=p_room and user_id=(select auth.uid()))
$$;
grant usage on schema dominius_private to authenticated;
grant execute on function dominius_private.member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_pieces enable row level security;
alter table public.match_moves enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.profiles,public.rooms,public.room_players,public.matches,public.match_pieces,public.match_moves,public.chat_messages from anon,authenticated;
grant select on public.profiles,public.rooms,public.room_players,public.matches,public.match_pieces,public.match_moves,public.chat_messages to authenticated;
drop policy if exists dominius_profile_self on public.profiles;
create policy dominius_profile_self on public.profiles for select to authenticated using(id=(select auth.uid()));
drop policy if exists dominius_room_member on public.rooms;
create policy dominius_room_member on public.rooms for select to authenticated using(dominius_private.member(id));
drop policy if exists dominius_players_member on public.room_players;
create policy dominius_players_member on public.room_players for select to authenticated using(dominius_private.member(room_id));
drop policy if exists dominius_match_member on public.matches;
create policy dominius_match_member on public.matches for select to authenticated using(dominius_private.member(room_id));
drop policy if exists dominius_piece_owner on public.match_pieces;
create policy dominius_piece_owner on public.match_pieces for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists dominius_moves_member on public.match_moves;
create policy dominius_moves_member on public.match_moves for select to authenticated using(dominius_private.member(room_id));
drop policy if exists dominius_chat_member on public.chat_messages;
create policy dominius_chat_member on public.chat_messages for select to authenticated using(dominius_private.member(room_id));

-- Mutação somente via RPC: valida auth.uid(), membro, turno e estado no servidor.
create or replace function public.dominius_create_room(p_faction text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r uuid; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if (select count(*) from public.rooms where host_id=uid and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Limite de salas atingido. Tente mais tarde.';
  end if;
  loop
    begin
      insert into public.rooms(code,host_id) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),uid) returning id into r;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.room_players(room_id,user_id,seat,faction) values(r,uid,0,p_faction);
  insert into public.matches(room_id) values(r);
  return r;
end $$;

-- A sala exige código aleatório, não pode ser enumerada pelo REST.
create table if not exists dominius_private.join_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
revoke all on dominius_private.join_limits from public,anon,authenticated;
create or replace function public.dominius_join_room(p_code text,p_faction text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; uid uuid:=auth.uid(); n integer;
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  insert into dominius_private.join_limits(user_id) values(uid) on conflict do nothing;
  update dominius_private.join_limits set
    attempts=case when window_start<now()-interval '1 minute' then 1 else attempts+1 end,
    window_start=case when window_start<now()-interval '1 minute' then now() else window_start end
    where user_id=uid returning attempts into n;
  -- Retornar NULL mantém o contador de tentativas; RAISE desfaria a transação.
  if n>12 then return null; end if;
  select * into r from public.rooms where code=upper(btrim(p_code));
  if not found then return null; end if;
  perform 1 from public.matches where room_id=r.id for update;
  select * into r from public.rooms where id=r.id for update;
  if exists(select 1 from public.room_players where room_id=r.id and user_id=uid) then return r.id; end if;
  if r.status<>'waiting' or (select count(*) from public.room_players where room_id=r.id)>=2 then
    raise exception 'Esta sala não está disponível.';
  end if;
  insert into public.room_players(room_id,user_id,seat,faction) values(r.id,uid,1,p_faction);
  update public.rooms set status='preparing' where id=r.id;
  update public.matches set version=version+1 where room_id=r.id;
  return r.id;
end $$;

create or replace function public.dominius_confirm_army(p_room uuid,p_pieces jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; me public.room_players; e jsonb; counts jsonb;
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  select * into m from public.matches where room_id=p_room for update;
  select * into me from public.room_players where room_id=p_room and user_id=auth.uid();
  if m.phase<>'setup' then raise exception 'A preparação terminou.'; end if;
  if me.ready then return; end if; -- Confirmação repetida após perda da resposta.
  if jsonb_typeof(p_pieces) is distinct from 'array' then raise exception 'Exército inválido.'; end if;
  if jsonb_array_length(p_pieces)<>40 then raise exception 'São necessárias 40 peças.'; end if;
  select jsonb_object_agg(role,n) into counts from
    (select value->>'role' role,count(*) n from jsonb_array_elements(p_pieces) group by value->>'role') c;
  if counts is distinct from '{"objective":1,"trap":6,"rank10":1,"rank9":1,"rank8":2,"rank7":3,"rank6":4,"rank5":4,"rank4":4,"rank3":5,"rank2":8,"rank1":1}'::jsonb then
    raise exception 'Composição do exército inválida.';
  end if;
  for e in select value from jsonb_array_elements(p_pieces) loop
    if jsonb_typeof(e->'x') is distinct from 'number' or jsonb_typeof(e->'y') is distinct from 'number'
      or (e->>'x') !~ '^[0-9]$' or (e->>'y') !~ '^[0-9]$'
      or not ((me.seat=0 and (e->>'y')::int between 0 and 3) or (me.seat=1 and (e->>'y')::int between 6 and 9)) then
      raise exception 'Use as quatro linhas do seu lado.';
    end if;
    insert into public.match_pieces(match_id,owner_id,seat,role,x,y)
      values(m.id,auth.uid(),me.seat,e->>'role',(e->>'x')::smallint,(e->>'y')::smallint);
  end loop;
  update public.room_players set ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.room_players where room_id=p_room and ready)=2 then
    update public.matches set phase='battle',turn=0,version=version+1 where id=m.id;
    update public.rooms set status='playing' where id=p_room;
  else
    update public.matches set version=version+1 where id=m.id;
  end if;
end $$;

-- Mesma ordem de regras de resolveBattle em game-rules.js.
create or replace function dominius_private.combat(a text,d text) returns text
language plpgsql immutable set search_path = '' as $$
declare ar int; dr int;
begin
  if d='objective' then return 'attacker'; end if;
  if d='trap' then return case when a='rank3' then 'attacker' else 'defender' end; end if;
  if a='rank1' and d='rank10' then return 'attacker'; end if;
  ar:=substr(a,5)::int; dr:=substr(d,5)::int;
  return case when ar=dr then 'tie' when ar>dr then 'attacker' else 'defender' end;
end $$;

create or replace function public.dominius_move(p_room uuid,p_piece uuid,p_x integer,p_y integer,p_version integer,p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; a public.match_pieces; d public.match_pieces; me smallint;
  dx int; dy int; step int; distance int; cx int; cy int; result text; ev jsonb;
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  select * into m from public.matches where room_id=p_room for update;
  if exists(select 1 from public.match_moves where match_id=m.id and actor_id=auth.uid() and request_id=p_request) then return; end if;
  select seat into me from public.room_players where room_id=p_room and user_id=auth.uid();
  if m.phase<>'battle' then raise exception 'A partida não está em andamento.'; end if;
  if m.turn<>me then raise exception 'Aguarde sua vez.'; end if;
  if p_version is distinct from m.version then raise exception 'O tabuleiro mudou. Atualize e tente novamente.'; end if;
  if p_request is null or p_x is null or p_y is null or p_x not between 0 and 9 or p_y not between 0 and 9
    or (p_y in (4,5) and p_x in (2,3,6,7)) then raise exception 'Destino inválido.'; end if;
  select * into a from public.match_pieces where id=p_piece and match_id=m.id and owner_id=auth.uid() and not lost;
  if not found or a.role in ('objective','trap') then raise exception 'Esta peça não pode se mover.'; end if;
  dx:=p_x-a.x; dy:=p_y-a.y; distance:=abs(dx)+abs(dy);
  if distance=0 or (dx<>0 and dy<>0) or (a.role<>'rank2' and distance<>1) then raise exception 'Movimento inválido.'; end if;
  for step in 1..distance loop
    cx:=a.x+sign(dx)::int*step; cy:=a.y+sign(dy)::int*step;
    if (cy in (4,5) and cx in (2,3,6,7)) or (step<distance and exists(select 1 from public.match_pieces where match_id=m.id and x=cx and y=cy and not lost)) then
      raise exception 'Caminho bloqueado.';
    end if;
  end loop;
  select * into d from public.match_pieces where match_id=m.id and x=p_x and y=p_y and not lost;
  if found and d.seat=me then raise exception 'Casa ocupada pelo seu exército.'; end if;
  ev:=jsonb_build_object('seat',me,'fromX',a.x,'fromY',a.y,'x',p_x,'y',p_y,'piece',a.id,'kind','move');
  if d.id is null then
    update public.match_pieces set x=p_x,y=p_y where id=a.id;
  else
    result:=dominius_private.combat(a.role,d.role);
    ev:=ev||jsonb_build_object('kind','combat','attackerRole',a.role,'defenderRole',d.role,'defender',d.id,'outcome',result,'captureObjective',d.role='objective');
    -- Remover antes de ocupar, respeitando o índice único de casas vivas.
    if result in ('attacker','tie') then update public.match_pieces set lost=true,x=-1,y=-1 where id=d.id; end if;
    if result in ('defender','tie') then update public.match_pieces set lost=true,x=-1,y=-1 where id=a.id;
    else update public.match_pieces set x=p_x,y=p_y where id=a.id; end if;
    if d.role='objective' then
      update public.matches set winner=me,phase='finished' where id=m.id;
      update public.rooms set status='finished' where id=p_room;
    end if;
  end if;
  -- Vitória somente pela captura do objetivo, como no jogo local atual.
  update public.matches set turn=1-turn,version=version+1 where id=m.id;
  insert into public.match_moves(match_id,room_id,actor_id,request_id,turn_number,event)
    values(m.id,p_room,auth.uid(),p_request,m.version+1,ev);
end $$;

create or replace function public.dominius_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.matches; result jsonb;
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  -- Bloqueio compartilhado: uma única visão coerente, sem ler meia jogada.
  select * into m from public.matches where room_id=p_room for share;
  select jsonb_build_object('room',to_jsonb(r),'match',to_jsonb(m),
    'players',(select jsonb_agg(to_jsonb(rp) order by rp.seat) from public.room_players rp where rp.room_id=p_room),
    'pieces',coalesce((select jsonb_agg(
      case when p.owner_id=auth.uid() then jsonb_build_object('id',p.id,'seat',p.seat,'role',p.role,'x',p.x,'y',p.y,'lost',p.lost)
      else jsonb_build_object('id',p.id,'seat',p.seat,'x',p.x,'y',p.y,'lost',p.lost)||
        case when p.lost then jsonb_build_object('role',p.role) else '{}'::jsonb end end order by p.id)
      from public.match_pieces p where p.match_id=m.id and (p.owner_id=auth.uid() or m.phase in ('battle','finished'))),'[]'::jsonb),
    'moves',coalesce((select jsonb_agg(to_jsonb(mm) order by mm.id) from
      (select id,turn_number,event,created_at from public.match_moves where match_id=m.id order by id desc limit 10) mm),'[]'::jsonb))
    into result from public.rooms r where r.id=p_room;
  return result;
end $$;

create or replace function public.dominius_chat(p_room uuid,p_body text,p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  perform 1 from public.rooms where id=p_room and status<>'closed' for share;
  if not found then raise exception 'Sala encerrada.'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 or p_request is null then raise exception 'Use de 1 a 500 caracteres.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  if exists(select 1 from public.chat_messages where room_id=p_room and user_id=auth.uid() and request_id=p_request) then return; end if;
  if (select count(*) from public.chat_messages where user_id=auth.uid() and created_at>now()-interval '10 seconds')>=10 then raise exception 'Aguarde alguns segundos antes de enviar mais mensagens.'; end if;
  insert into public.chat_messages(room_id,user_id,request_id,body) values(p_room,auth.uid(),p_request,btrim(p_body));
end $$;
create index if not exists chat_messages_rate_idx on public.chat_messages(user_id,created_at desc);

create or replace function public.dominius_heartbeat(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  update public.room_players set last_seen=now() where room_id=p_room and user_id=auth.uid();
end $$;

create or replace function public.dominius_leave(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; other_seat smallint;
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  select * into m from public.matches where room_id=p_room for update;
  if m.phase='battle' and m.wager_amount>0 then
    select seat into other_seat from public.room_players where room_id=p_room and user_id<>auth.uid();
    update public.matches set phase='finished',winner=other_seat,version=version+1 where id=m.id;
    update public.rooms set status='finished' where id=p_room;
    return;
  end if;
  update public.rooms set status='closed' where id=p_room;
  update public.matches set phase=case when phase='finished' then phase else 'closed' end,version=version+1 where room_id=p_room;
end $$;

-- DOMINIUS ECONOMY / COROAS -- Execute esta seção inteira, de BEGIN a COMMIT.
-- Coroas não têm compra, saque ou conversão. Apenas partidas online autenticadas.
alter table public.matches add column if not exists wager_amount integer not null default 0;
alter table public.matches add column if not exists pot_amount integer not null default 0;
alter table public.matches add column if not exists wager_status text not null default 'none';
alter table public.matches drop constraint if exists dominius_wager_amount_check;
do $$ begin
  if exists(select 1 from public.matches where wager_amount in (250,500) and phase in ('setup','battle')) then
    raise exception 'Existem partidas abertas com apostas antigas. Encerre-as antes de aplicar a migração.';
  end if;
  if exists(select 1 from public.matches m where m.phase='setup' and m.wager_status='pending' and m.wager_amount>0
    and (select count(*) from public.room_players where room_id=m.room_id)=2) then
    raise exception 'Existem desafios apostados antigos já aceitos. Encerre-os antes de aplicar a migração.';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='dominius_wager_status_check') then
    alter table public.matches add constraint dominius_wager_status_check
      check (wager_status in ('none','pending','locked','settled','refunded'));
  end if;
end $$;
alter table public.matches add constraint dominius_wager_amount_check
  check ((wager_amount in (0,5,10,20,50,100) or
          (wager_amount in (250,500) and phase in ('finished','closed'))) and
    ((wager_amount=0 and pot_amount=0 and wager_status='none') or
     (wager_amount>0 and ((wager_status='pending' and pot_amount=0) or
      (wager_status in ('locked','settled','refunded') and pot_amount=wager_amount*2)))));
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 100 check(balance>=0),
  gem_balance bigint not null default 0 check(gem_balance>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wallets add column if not exists gem_balance bigint not null default 0;
alter table public.wallets alter column balance set default 100;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.wallets'::regclass and conname='dominius_gem_balance_nonnegative') then
    alter table public.wallets add constraint dominius_gem_balance_nonnegative check(gem_balance>=0);
  end if;
end $$;
create table if not exists public.coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check(amount<>0),
  type text not null check(type in ('initial_balance','online_win_reward','wager_lock','wager_win','wager_refund','admin_adjustment')),
  match_id uuid,
  balance_after bigint not null check(balance_after>=0),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists coin_transaction_match_once on public.coin_transactions(match_id,user_id,type) where match_id is not null;
create unique index if not exists coin_transaction_initial_once on public.coin_transactions(user_id) where type='initial_balance';
create index if not exists coin_transaction_recent on public.coin_transactions(user_id,id desc);
create or replace function dominius_private.new_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wallets(user_id,balance,gem_balance) values(new.id,100,0) on conflict do nothing;
  insert into public.coin_transactions(user_id,amount,type,balance_after)
    values(new.id,100,'initial_balance',100) on conflict do nothing;
  return new;
end $$;
drop trigger if exists dominius_new_wallet on auth.users;
create trigger dominius_new_wallet after insert on auth.users for each row execute function dominius_private.new_wallet();
-- Contas anteriores à instalação não recebem bônus retroativo ao entrar.
insert into public.wallets(user_id,balance,gem_balance)
  select id,0,0 from auth.users on conflict do nothing;

-- Toda entrada em sala apostada passa por este gatilho, inclusive chamadas RPC diretas.
create or replace function dominius_private.check_wager_join() returns trigger
language plpgsql security definer set search_path = '' as $$
declare wager integer; available bigint;
begin
  if new.seat=1 then
    select wager_amount into wager from public.matches where room_id=new.room_id;
    if wager>0 then
      select balance into available from public.wallets where user_id=new.user_id;
      if available is null or available<wager then raise exception 'Saldo de Coroas insuficiente.'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists dominius_check_wager_join on public.room_players;
create trigger dominius_check_wager_join before insert on public.room_players
  for each row execute function dominius_private.check_wager_join();

-- Somente funções privadas alteram saldo; a linha é bloqueada pelo UPDATE.
create or replace function dominius_private.change_coins(p_user uuid,p_amount bigint,p_type text,p_match uuid,p_metadata jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare result bigint; context jsonb;
begin
  -- Serializa por carteira antes de consultar a chave idempotente.
  select balance into result from public.wallets where user_id=p_user for update;
  if not found then raise exception 'Carteira não encontrada.'; end if;
  if p_match is not null and exists(select 1 from public.coin_transactions where match_id=p_match and user_id=p_user and type=p_type) then
    return result;
  end if;
  update public.wallets set balance=balance+p_amount,updated_at=now()
    where user_id=p_user and balance+p_amount>=0 returning balance into result;
  if not found then raise exception 'Saldo de Coroas insuficiente.'; end if;
  if p_match is not null then
    select jsonb_build_object('room_code',r.code,'opponent',coalesce(p.display_name,'Comandante')) into context
      from public.matches m join public.rooms r on r.id=m.room_id
      left join public.room_players rival on rival.room_id=r.id and rival.user_id<>p_user
      left join public.profiles p on p.id=rival.user_id where m.id=p_match limit 1;
  end if;
  insert into public.coin_transactions(user_id,amount,type,match_id,balance_after,metadata)
    values(p_user,p_amount,p_type,p_match,result,coalesce(p_metadata,'{}'::jsonb)||coalesce(context,'{}'::jsonb));
  return result;
end $$;

-- O gatilho roda dentro da mesma transação de confirmar exército, capturar objetivo ou abandonar.
create or replace function dominius_private.match_economy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare participants uuid[]; winner_id uuid;
begin
  if old.phase='setup' and new.phase='battle' and new.wager_amount>0 then
    if old.wager_status<>'locked' or old.pot_amount<>old.wager_amount*2 then
      raise exception 'Os dois jogadores precisam aceitar a aposta antes da batalha.';
    end if;
  end if;
  if (old.phase='battle' and new.phase='finished') or (old.wager_status='locked' and new.phase='closed') then
    select array_agg(user_id order by user_id) into participants from public.room_players where room_id=new.room_id;
    if cardinality(participants)<>2 or participants[1]=participants[2] then raise exception 'Partida inválida para Coroas.'; end if;
    if new.phase='finished' and new.winner is not null then
      select user_id into winner_id from public.room_players where room_id=new.room_id and seat=new.winner;
      if winner_id is null then raise exception 'Vencedor inválido.'; end if;
    end if;
    if new.wager_amount>0 then
      if old.wager_status<>'locked' then raise exception 'Pote não travado.'; end if;
      if winner_id is null then
        perform dominius_private.change_coins(participants[1],new.wager_amount,'wager_refund',new.id);
        perform dominius_private.change_coins(participants[2],new.wager_amount,'wager_refund',new.id);
        new.wager_status:='refunded';
      else
        perform dominius_private.change_coins(winner_id,new.pot_amount,'wager_win',new.id);
        new.wager_status:='settled';
      end if;
    elsif winner_id is not null then
      perform dominius_private.change_coins(winner_id,50,'online_win_reward',new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists dominius_match_economy on public.matches;
create trigger dominius_match_economy before update on public.matches
  for each row execute function dominius_private.match_economy();

create or replace function public.dominius_create_wager_room(p_faction text,p_wager integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  if p_wager is null or p_wager not in (5,10,20,50,100) then raise exception 'Aposta inválida.'; end if;
  if not exists(select 1 from public.wallets where user_id=auth.uid() and balance>=p_wager) then
    raise exception 'Saldo de Coroas insuficiente.';
  end if;
  r:=public.dominius_create_room(p_faction);
  update public.matches set wager_amount=p_wager,wager_status='pending' where room_id=r;
  return r;
end $$;

-- A RPC comum entra apenas em salas livres. Aceitar aposta exige valor esperado e
-- trava as duas carteiras antes de admitir o segundo jogador, numa transação só.
create or replace function dominius_private.join_room_core(p_code text,p_faction text,p_expected_wager integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; m public.matches; uid uuid:=auth.uid(); n integer; participants uuid[];
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  insert into dominius_private.join_limits(user_id) values(uid) on conflict do nothing;
  update dominius_private.join_limits set
    attempts=case when window_start<now()-interval '1 minute' then 1 else attempts+1 end,
    window_start=case when window_start<now()-interval '1 minute' then now() else window_start end
    where user_id=uid returning attempts into n;
  if n>12 then return null; end if;
  select * into r from public.rooms where code=upper(btrim(p_code));
  if not found then return null; end if;
  select * into m from public.matches where room_id=r.id for update;
  select * into r from public.rooms where id=r.id for update;
  if exists(select 1 from public.room_players where room_id=r.id and user_id=uid) then return r.id; end if;
  if r.status<>'waiting' or m.phase<>'setup' or (select count(*) from public.room_players where room_id=r.id)<>1 then
    raise exception 'Esta sala não está disponível.';
  end if;
  if p_expected_wager is null then
    if m.wager_amount<>0 then raise exception 'Aceite a aposta antes de entrar na sala.'; end if;
  elsif p_expected_wager not in (5,10,20,50,100) or m.wager_amount<>p_expected_wager or m.wager_status<>'pending' then
    raise exception 'A aposta mudou ou não está disponível.';
  end if;
  insert into public.room_players(room_id,user_id,seat,faction) values(r.id,uid,1,p_faction);
  if p_expected_wager is not null then
    select array_agg(user_id order by user_id) into participants from public.room_players where room_id=r.id;
    if cardinality(participants)<>2 or participants[1]=participants[2] then raise exception 'São necessárias duas contas diferentes.'; end if;
    perform dominius_private.change_coins(participants[1],-m.wager_amount,'wager_lock',m.id);
    perform dominius_private.change_coins(participants[2],-m.wager_amount,'wager_lock',m.id);
    update public.matches set wager_status='locked',pot_amount=m.wager_amount*2,version=version+1 where id=m.id;
  else
    update public.matches set version=version+1 where id=m.id;
  end if;
  update public.rooms set status='preparing' where id=r.id;
  return r.id;
end $$;
create or replace function public.dominius_join_room(p_code text,p_faction text) returns uuid
language sql security definer set search_path = '' as $$
  select dominius_private.join_room_core(p_code,p_faction,null)
$$;
create or replace function public.dominius_accept_wager(p_code text,p_faction text,p_wager integer) returns uuid
language sql security definer set search_path = '' as $$
  select dominius_private.join_room_core(p_code,p_faction,p_wager)
$$;

-- Consulta limitada pelo mesmo contador de tentativas do código da sala.
create or replace function public.dominius_wager_offer(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer; offer jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
  insert into dominius_private.join_limits(user_id) values(auth.uid()) on conflict do nothing;
  update dominius_private.join_limits set
    attempts=case when window_start<now()-interval '1 minute' then 1 else attempts+1 end,
    window_start=case when window_start<now()-interval '1 minute' then now() else window_start end
    where user_id=auth.uid() returning attempts into n;
  if n>12 then return null; end if;
  select jsonb_build_object('wager_amount',m.wager_amount,'pot_amount',m.wager_amount*2,
    'opponent',coalesce(p.display_name,'Comandante'))
    into offer from public.rooms r join public.matches m on m.room_id=r.id
    left join public.profiles p on p.id=r.host_id
    where r.code=upper(btrim(p_code)) and r.status='waiting';
  return offer;
end $$;

alter table public.wallets enable row level security;
alter table public.coin_transactions enable row level security;
-- Fecha inclusive concessões antigas feitas a PUBLIC na tabela financeira da partida.
revoke all on public.matches from public,anon,authenticated;
grant select on public.matches to authenticated;
alter table public.matches enable row level security;
revoke all on public.wallets,public.coin_transactions from public,anon,authenticated;
grant select on public.wallets,public.coin_transactions to authenticated;
drop policy if exists dominius_wallet_self on public.wallets;
create policy dominius_wallet_self on public.wallets for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists dominius_coin_history_self on public.coin_transactions;
create policy dominius_coin_history_self on public.coin_transactions for select to authenticated using(user_id=(select auth.uid()));
revoke all on function dominius_private.new_wallet(),dominius_private.check_wager_join(),dominius_private.change_coins(uuid,bigint,text,uuid,jsonb),dominius_private.match_economy(),dominius_private.join_room_core(text,text,integer) from public,anon,authenticated;
revoke all on function public.dominius_create_wager_room(text,integer),public.dominius_wager_offer(text),public.dominius_join_room(text,text),public.dominius_accept_wager(text,text,integer) from public,anon,authenticated;
grant execute on function public.dominius_create_wager_room(text,integer),public.dominius_wager_offer(text),public.dominius_join_room(text,text),public.dominius_accept_wager(text,text,integer) to authenticated;

-- Abandono oficial após o início: somente o desafio apostado paga o pote ao adversário.
create or replace function public.dominius_leave(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; other_seat smallint;
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  select * into m from public.matches where room_id=p_room for update;
  if m.phase='battle' and m.wager_amount>0 then
    select seat into other_seat from public.room_players where room_id=p_room and user_id<>auth.uid();
    update public.matches set phase='finished',winner=other_seat,version=version+1 where id=m.id;
    update public.rooms set status='finished' where id=p_room;
    return;
  end if;
  update public.rooms set status='closed' where id=p_room;
  update public.matches set phase=case when phase='finished' then phase else 'closed' end,version=version+1 where room_id=p_room;
end $$;

-- Revogar EXECUTE padrão (PUBLIC) de TODAS as funções desta integração.
revoke all on function dominius_private.new_profile(),dominius_private.member(uuid),dominius_private.combat(text,text) from public,anon,authenticated;
grant execute on function dominius_private.member(uuid) to authenticated;
revoke all on function public.dominius_create_room(text),public.dominius_join_room(text,text),public.dominius_confirm_army(uuid,jsonb),public.dominius_move(uuid,uuid,integer,integer,integer,uuid),public.dominius_snapshot(uuid),public.dominius_chat(uuid,text,uuid),public.dominius_heartbeat(uuid),public.dominius_leave(uuid) from public,anon,authenticated;
grant execute on function public.dominius_create_room(text),public.dominius_join_room(text,text),public.dominius_confirm_army(uuid,jsonb),public.dominius_move(uuid,uuid,integer,integer,integer,uuid),public.dominius_snapshot(uuid),public.dominius_chat(uuid,text,uuid),public.dominius_heartbeat(uuid),public.dominius_leave(uuid) to authenticated;

-- Só dados públicos para membros. Segredos nunca entram no fluxo Realtime.
do $$ declare t text; begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['rooms','room_players','matches','match_moves','chat_messages'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_pieces') then
    alter publication supabase_realtime drop table public.match_pieces;
  end if;
end $$;
commit;
