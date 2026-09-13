begin;
-- DOMINIUS ECONOMY / COROAS -- Execute esta seção inteira, de BEGIN a COMMIT.
-- Coroas não têm compra, saque ou conversão. Apenas partidas online autenticadas.
alter table public.matches add column if not exists wager_amount integer not null default 0;
alter table public.matches add column if not exists pot_amount integer not null default 0;
alter table public.matches add column if not exists wager_status text not null default 'none';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='dominius_wager_amount_check') then
    alter table public.matches add constraint dominius_wager_amount_check
      check (wager_amount in (0,50,100,250,500) and
        ((wager_amount=0 and pot_amount=0 and wager_status='none') or
         (wager_amount>0 and ((wager_status='pending' and pot_amount=0) or
          (wager_status in ('locked','settled','refunded') and pot_amount=wager_amount*2)))));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='dominius_wager_status_check') then
    alter table public.matches add constraint dominius_wager_status_check
      check (wager_status in ('none','pending','locked','settled','refunded'));
  end if;
end $$;
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 500 check(balance>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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
  insert into public.wallets(user_id) values(new.id) on conflict do nothing;
  insert into public.coin_transactions(user_id,amount,type,balance_after)
    values(new.id,500,'initial_balance',500) on conflict do nothing;
  return new;
end $$;
drop trigger if exists dominius_new_wallet on auth.users;
create trigger dominius_new_wallet after insert on auth.users for each row execute function dominius_private.new_wallet();
insert into public.wallets(user_id) select id from auth.users on conflict do nothing;
insert into public.coin_transactions(user_id,amount,type,balance_after)
  select user_id,500,'initial_balance',500 from public.wallets on conflict do nothing;

-- Somente funções privadas alteram saldo; a linha é bloqueada pelo UPDATE.
create or replace function dominius_private.change_coins(p_user uuid,p_amount bigint,p_type text,p_match uuid,p_metadata jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare result bigint;
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
  insert into public.coin_transactions(user_id,amount,type,match_id,balance_after,metadata)
    values(p_user,p_amount,p_type,p_match,result,p_metadata);
  return result;
end $$;

-- O gatilho roda dentro da mesma transação de confirmar exército, capturar objetivo ou abandonar.
create or replace function dominius_private.match_economy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare participants uuid[]; winner_id uuid; wager integer;
begin
  if old.phase='setup' and new.phase='battle' and new.wager_amount>0 then
    select array_agg(user_id order by user_id) into participants from public.room_players where room_id=new.room_id;
    if cardinality(participants)<>2 or participants[1]=participants[2] then raise exception 'São necessárias duas contas diferentes.'; end if;
    wager:=new.wager_amount;
    perform dominius_private.change_coins(participants[1],-wager,'wager_lock',new.id);
    perform dominius_private.change_coins(participants[2],-wager,'wager_lock',new.id);
    new.pot_amount:=wager*2;new.wager_status:='locked';
  end if;
  if old.phase='battle' and new.phase='finished' then
    select array_agg(user_id order by user_id) into participants from public.room_players where room_id=new.room_id;
    if cardinality(participants)<>2 or participants[1]=participants[2] then raise exception 'Partida inválida para Coroas.'; end if;
    if new.winner is not null then
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
  if p_wager is null or p_wager not in (50,100,250,500) then raise exception 'Aposta inválida.'; end if;
  if not exists(select 1 from public.wallets where user_id=auth.uid() and balance>=p_wager) then
    raise exception 'Saldo de Coroas insuficiente.';
  end if;
  r:=public.dominius_create_room(p_faction);
  update public.matches set wager_amount=p_wager,wager_status='pending' where room_id=r;
  return r;
end $$;

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
  select jsonb_build_object('wager_amount',m.wager_amount,'pot_amount',m.wager_amount*2)
    into offer from public.rooms r join public.matches m on m.room_id=r.id
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
revoke all on function dominius_private.new_wallet(),dominius_private.change_coins(uuid,bigint,text,uuid,jsonb),dominius_private.match_economy() from public,anon,authenticated;
revoke all on function public.dominius_create_wager_room(text,integer),public.dominius_wager_offer(text) from public,anon,authenticated;
grant execute on function public.dominius_create_wager_room(text,integer),public.dominius_wager_offer(text) to authenticated;

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
