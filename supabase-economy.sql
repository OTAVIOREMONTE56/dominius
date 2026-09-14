begin;
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
      perform dominius_private.change_coins(winner_id,1,'online_win_reward',new.id);
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

commit;
