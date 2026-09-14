-- Execute este arquivo inteiro no SQL Editor antes de supabase-economy.sql.
-- Fecha somente desafios antigos aceitos, ainda em preparação e sem débito.
begin;
do $$
declare
  item record;
  room_state text;
  before_balances bigint[];
  after_balances bigint[];
  wallet_count integer;
  before_entries bigint;
  after_entries bigint;
  closed_count integer := 0;
begin
  for item in
    select m.id, m.room_id, m.pot_amount
      from public.matches m
     where m.phase = 'setup' and m.wager_status = 'pending' and m.wager_amount > 0
       and (select count(*) from public.room_players p where p.room_id = m.room_id) = 2
     order by m.id for update of m
  loop
    select r.status into room_state from public.rooms r where r.id = item.room_id for update;
    if room_state is null or room_state not in ('waiting','preparing','closed') or item.pot_amount <> 0 then
      raise exception 'Partida % tem estado incompatível; nada foi encerrado.', item.id;
    end if;
    if exists (select 1 from public.coin_transactions t where t.match_id = item.id) then
      raise exception 'Partida % tem movimentação financeira; nada foi encerrado.', item.id;
    end if;
    perform 1 from public.wallets w join public.room_players p on p.user_id = w.user_id
      where p.room_id = item.room_id order by w.user_id for update of w;
    select array_agg(w.balance order by w.user_id), count(*) into before_balances, wallet_count
      from public.wallets w join public.room_players p on p.user_id = w.user_id
      where p.room_id = item.room_id;
    if wallet_count <> 2 then raise exception 'Partida % não tem duas carteiras; nada foi encerrado.', item.id; end if;
    select count(*) into before_entries from public.coin_transactions where match_id = item.id;

    update public.matches set phase = 'closed', version = version + 1 where id = item.id;
    update public.rooms set status = 'closed' where id = item.room_id and status <> 'closed';

    select array_agg(w.balance order by w.user_id) into after_balances
      from public.wallets w join public.room_players p on p.user_id = w.user_id
      where p.room_id = item.room_id;
    select count(*) into after_entries from public.coin_transactions where match_id = item.id;
    if before_balances is distinct from after_balances or before_entries <> after_entries then
      raise exception 'Movimentação financeira inesperada na partida %; tudo foi revertido.', item.id;
    end if;
    closed_count := closed_count + 1;
  end loop;
  raise notice '% desafio(s) antigo(s) encerrado(s); nenhum saldo foi alterado.', closed_count;
end $$;
commit;
