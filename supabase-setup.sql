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
begin
  if not dominius_private.member(p_room) then raise exception 'Acesso negado.'; end if;
  perform 1 from public.matches where room_id=p_room for update;
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
