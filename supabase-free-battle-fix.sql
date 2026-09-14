-- Execute uma vez no SQL Editor para corrigir a recompensa da Batalha Livre.
-- Reexecutável; não ajusta saldos nem transações históricas.
begin;
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
commit;
