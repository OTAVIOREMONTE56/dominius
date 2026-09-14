-- DOMINIUS: execute depois de supabase-setup.sql e supabase-economy.sql.
-- Estatísticas começam em zero; partidas históricas não são inferidas.
begin;

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= current_win_streak),
  created_at timestamptz not null default now(),
  constraint dominius_stats_total check (matches_played = wins + losses + draws)
);

create or replace function dominius_private.new_player_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.player_stats(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists dominius_new_player_stats on auth.users;
create trigger dominius_new_player_stats after insert on auth.users
  for each row execute function dominius_private.new_player_stats();
insert into public.player_stats(user_id) select id from auth.users on conflict do nothing;

-- Uma chave por resultado torna o processamento idempotente, inclusive se o gatilho for reinstalado.
create table if not exists dominius_private.recorded_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
revoke all on dominius_private.recorded_results from public,anon,authenticated;

create or replace function dominius_private.record_match_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare winner_id uuid; participant_count integer; updated_count integer;
begin
  if old.phase <> 'battle' or new.phase <> 'finished' then return new; end if;
  select count(*) into participant_count from public.room_players where room_id=new.room_id;
  if participant_count <> 2 then raise exception 'Partida inválida para estatísticas.'; end if;
  if new.winner is not null then
    select user_id into winner_id from public.room_players
      where room_id=new.room_id and seat=new.winner;
    if winner_id is null then raise exception 'Vencedor inválido para estatísticas.'; end if;
  end if;
  insert into dominius_private.recorded_results(match_id) values(new.id)
    on conflict do nothing;
  if not found then return new; end if;
  -- Repara contas anteriores ou linhas ausentes sem tocar nas carteiras.
  insert into public.player_stats(user_id)
    select user_id from public.room_players where room_id=new.room_id
    on conflict do nothing;
  update public.player_stats s set
    matches_played=s.matches_played+1,
    wins=s.wins+case when s.user_id=winner_id then 1 else 0 end,
    losses=s.losses+case when winner_id is not null and s.user_id<>winner_id then 1 else 0 end,
    draws=s.draws+case when winner_id is null then 1 else 0 end,
    current_win_streak=case when s.user_id=winner_id then s.current_win_streak+1 else 0 end,
    best_win_streak=greatest(s.best_win_streak,case when s.user_id=winner_id then s.current_win_streak+1 else 0 end)
    where s.user_id in (select user_id from public.room_players where room_id=new.room_id);
  get diagnostics updated_count = row_count;
  if updated_count <> 2 then raise exception 'Estatísticas dos jogadores não encontradas.'; end if;
  return new;
end $$;
drop trigger if exists dominius_record_match_stats on public.matches;
create trigger dominius_record_match_stats after update on public.matches
  for each row when (old.phase='battle' and new.phase='finished')
  execute function dominius_private.record_match_stats();

create or replace function dominius_private.patent(p_wins integer) returns text
language sql immutable set search_path = '' as $$
  select case when p_wins >= 200 then 'Lenda dos Reinos'
    when p_wins >= 120 then 'Marechal' when p_wins >= 80 then 'General'
    when p_wins >= 55 then 'Comandante' when p_wins >= 35 then 'Capitão'
    when p_wins >= 20 then 'Sargento' when p_wins >= 10 then 'Guerreiro'
    when p_wins >= 3 then 'Soldado' else 'Recruta' end
$$;

create or replace function public.dominius_my_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  insert into public.player_stats(user_id) values(auth.uid()) on conflict do nothing;
  select jsonb_build_object('matches_played',s.matches_played,'wins',s.wins,
    'losses',s.losses,'draws',s.draws,'current_win_streak',s.current_win_streak,
    'best_win_streak',s.best_win_streak,'win_rate',
    case when s.matches_played=0 then 0 else round(100.0*s.wins/s.matches_played,1) end,
    'patent',dominius_private.patent(s.wins)) into result
    from public.player_stats s where s.user_id=auth.uid();
  return result;
end $$;

create or replace function public.dominius_ranking() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  insert into public.player_stats(user_id) values(auth.uid()) on conflict do nothing;
  with ordered as (
    select row_number() over(order by s.wins desc,s.current_win_streak desc,
      s.best_win_streak desc,case when s.matches_played=0 then 0 else 100.0*s.wins/s.matches_played end desc,
      lower(coalesce(p.display_name,'Comandante')),s.user_id) as position,
      s.user_id,coalesce(p.display_name,'Comandante') as name,
      dominius_private.patent(s.wins) as patent,s.wins,s.losses,
      s.matches_played,s.current_win_streak as streak,s.best_win_streak,
      case when s.matches_played=0 then 0 else round(100.0*s.wins/s.matches_played,1) end as win_rate
    from public.player_stats s left join public.profiles p on p.id=s.user_id
  ), rows as (
    select position,user_id,name,patent,wins,losses,matches_played,streak,best_win_streak,win_rate
      from ordered where position<=50
  )
  select jsonb_build_object('top',coalesce((select jsonb_agg(to_jsonb(rows) order by position) from rows),'[]'::jsonb),
    'me',(select to_jsonb(ordered) from ordered where user_id=auth.uid())) into result;
  return result;
end $$;

alter table public.player_stats enable row level security;
revoke all on public.player_stats from public,anon,authenticated;
grant select on public.player_stats to authenticated;
drop policy if exists dominius_player_stats_self on public.player_stats;
create policy dominius_player_stats_self on public.player_stats for select to authenticated
  using(user_id=(select auth.uid()));
revoke all on function dominius_private.new_player_stats(),dominius_private.record_match_stats(),dominius_private.patent(integer) from public,anon,authenticated;
revoke all on function public.dominius_my_stats(),public.dominius_ranking() from public,anon,authenticated;
grant execute on function public.dominius_my_stats(),public.dominius_ranking() to authenticated;
commit;
