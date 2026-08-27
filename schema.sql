-- Pocket Football FC V8 — Supabase/Postgres
-- Execute no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique,
  display_name text not null default 'Jogador',
  club_name text not null default 'Pocket FC',
  kit text not null default 'midnight' check (kit in ('midnight','aurora','royal','neon')),
  avatar_id text not null default 'avatar1' check (avatar_id in ('avatar1','avatar2','avatar3','avatar4','avatar5','avatar6','avatar7','avatar8')),
  ovr int not null default 84 check (ovr between 1 and 99),
  gold bigint not null default 2500 check (gold >= 0),
  gems bigint not null default 120 check (gems >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  draws int not null default 0 check (draws >= 0),
  matches int not null default 0 check (matches >= 0),
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  penalties int not null default 0 check (penalties >= 0),
  stadium_level int not null default 3 check (stadium_level between 1 and 50),
  chemistry int not null default 78 check (chemistry between 0 and 100),
  xp bigint not null default 0 check (xp >= 0),
  rank_points int not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_key text not null,
  player_name text not null,
  position text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  ovr int not null check (ovr between 1 and 99),
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(user_id, card_key)
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('ranked','friendly','cup','challenge','penalty')),
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  goals int not null default 0,
  assists int not null default 0,
  penalties int not null default 0,
  result text not null check (result in ('win','loss','draw')),
  reward_gold int not null default 0,
  reward_gems int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists profiles_rank_idx on public.profiles(rank_points desc);
create index if not exists profiles_gold_idx on public.profiles(gold desc);
create index if not exists profiles_wins_idx on public.profiles(wins desc);
create index if not exists profiles_goals_idx on public.profiles(goals desc);
create index if not exists profiles_penalties_idx on public.profiles(penalties desc);
create index if not exists matches_user_idx on public.match_results(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.player_cards enable row level security;
alter table public.match_results enable row level security;

-- Perfil: o usuário pode ler/editar apenas o próprio registro.
create policy "profile_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profile_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profile_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "cards_select_own" on public.player_cards for select to authenticated using (auth.uid() = user_id);
create policy "matches_select_own" on public.match_results for select to authenticated using (auth.uid() = user_id);

-- Ranking público: somente campos não sensíveis.
create or replace view public.global_leaderboard as
select public_id, display_name, club_name, kit, avatar_id, ovr, gold, wins, goals, penalties, rank_points
from public.profiles;

grant select on public.global_leaderboard to anon, authenticated;

-- Cria o perfil automaticamente no primeiro login.
create or replace function public.new_public_id() returns text language plpgsql as $$
declare candidate text;
begin
  loop
    candidate := 'PF-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
    exit when not exists(select 1 from public.profiles where public_id=candidate);
  end loop;
  return candidate;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, public_id, display_name)
  values (
    new.id,
    public.new_public_id(),
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Jogador'), 18)
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Operação autoritativa: o cliente envia o resultado, mas o banco calcula recompensas e contadores.
create or replace function public.record_match(
  p_mode text,
  p_home int,
  p_away int,
  p_goals int default 0,
  p_assists int default 0,
  p_penalties int default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  result text;
  rg int := 100;
  rgem int := 0;
  new_ovr int;
  prof public.profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_home < 0 or p_away < 0 or p_goals < 0 or p_assists < 0 or p_penalties < 0 then raise exception 'invalid_stats'; end if;
  if p_home > p_away then result := 'win'; rg := case when p_mode='cup' then 1000 else 550 end; rgem := case when p_mode='cup' then 15 else 5 end;
  elsif p_home < p_away then result := 'loss';
  else result := 'draw'; rg := 250; end if;

  insert into public.match_results(user_id,mode,home_score,away_score,goals,assists,penalties,result,reward_gold,reward_gems)
  values(uid,p_mode,p_home,p_away,p_goals,p_assists,p_penalties,result,rg,rgem);

  update public.profiles p set
    matches = p.matches + 1,
    wins = p.wins + case when result='win' then 1 else 0 end,
    losses = p.losses + case when result='loss' then 1 else 0 end,
    draws = p.draws + case when result='draw' then 1 else 0 end,
    goals = p.goals + p_goals,
    assists = p.assists + p_assists,
    penalties = p.penalties + p_penalties,
    gold = p.gold + rg,
    gems = p.gems + rgem,
    xp = p.xp + case when result='win' then 100 else 35 end,
    rank_points = greatest(0, p.rank_points + case when result='win' then 30 when result='loss' then -10 else 5 end),
    updated_at = now()
  where p.id=uid returning * into prof;

  return jsonb_build_object('result',result,'reward_gold',rg,'reward_gems',rgem,'profile',to_jsonb(prof));
end; $$;

grant execute on function public.record_match(text,int,int,int,int,int) to authenticated;

-- O cliente não recebe permissão direta para alterar Gold/Gems/estatísticas via Data API.
revoke update(gold,gems,wins,losses,draws,matches,goals,assists,penalties,xp,rank_points) on public.profiles from authenticated;


-- Cartas iniciais + packs server-side (economia não fica confiável no navegador).
create or replace function public.seed_starter_cards()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.player_cards(user_id,card_key,player_name,position,rarity,ovr) values
  (new.id,'striker','STRIKER','CF','legendary',94),
  (new.id,'flash','FLASH','LW','rare',88),
  (new.id,'maestro','MAESTRO','CM','rare',87),
  (new.id,'anchor','ANCHOR','DM','legendary',93),
  (new.id,'keeper','KEEPER','GK','legendary',92)
  on conflict(user_id,card_key) do nothing;
  return new;
end; $$;

drop trigger if exists on_profile_created_seed_cards on public.profiles;
create trigger on_profile_created_seed_cards after insert on public.profiles
for each row execute procedure public.seed_starter_cards();

create or replace function public.open_pack(p_cost int)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p public.profiles; n int; i int; r numeric; rarity text; rec record; result jsonb:='[]'::jsonb;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_cost not in (650,1200) then raise exception 'invalid_pack'; end if;
 select * into p from public.profiles where id=uid for update;
 if p.gold < p_cost then raise exception 'insufficient_gold'; end if;
 n:=case when p_cost=1200 then 5 else 3 end;
 update public.profiles set gold=gold-p_cost, updated_at=now() where id=uid;
 for i in 1..n loop
   r:=random();
   rarity:=case when r>.96 then 'legendary' when r>.70 then 'epic' when r>.30 then 'rare' else 'common' end;
   select * into rec from (values
    ('volt','VOLT','CF','legendary',93),('phantom','PHANTOM','RW','epic',91),('ice','ICE','CB','epic',90),('nova','NOVA','LW','rare',89),('bolt','BOLT','CM','rare',86),('guard','GUARD','CB','common',85),('finisher','FINISHER','CF','epic',91),('rocket','ROCKET','RW','rare',88)
   ) as x(card_key,player_name,position,rarity,ovr) where x.rarity=rarity order by random() limit 1;
   insert into public.player_cards(user_id,card_key,player_name,position,rarity,ovr) values(uid,rec.card_key,rec.player_name,rec.position,rec.rarity,rec.ovr)
   on conflict(user_id,card_key) do update set quantity=player_cards.quantity+1;
   result:=result || jsonb_build_object('card_key',rec.card_key,'player_name',rec.player_name,'position',rec.position,'rarity',rec.rarity,'ovr',rec.ovr);
 end loop;
 return result;
end; $$;
grant execute on function public.open_pack(int) to authenticated;
revoke all on public.player_cards from anon;

-- ===== V9 REAL-PLAYER CARD CATALOG =====
create table if not exists public.player_catalog (
  card_key text primary key,
  player_name text not null,
  position text not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  ovr int not null check (ovr between 1 and 99),
  active boolean not null default true
);

insert into public.player_catalog(card_key,player_name,position,rarity,ovr) values
('messi','Lionel Messi','RW','legendary',97),
('cr7','Cristiano Ronaldo','ST','legendary',96),
('mbappe','Kylian Mbappé','ST','legendary',97),
('vinicius','Vinícius Jr.','LW','legendary',96),
('haaland','Erling Haaland','ST','legendary',97),
('bellingham','Jude Bellingham','CM','legendary',95),
('rodri','Rodri','DM','legendary',96),
('salah','Mohamed Salah','RW','epic',94),
('debruyne','Kevin De Bruyne','CM','epic',93),
('vander','Virgil van Dijk','CB','epic',93),
('alisson','Alisson','GK','epic',91),
('hakimi','Achraf Hakimi','RB','rare',91),
('theo','Theo Hernández','LB','rare',90),
('kane','Harry Kane','ST','epic',93),
('lautaro','Lautaro Martínez','ST','epic',91),
('pedri','Pedri','CM','rare',91),
('musiala','Jamal Musiala','CAM','rare',91),
('saliba','William Saliba','CB','rare',90),
('courtois','Thibaut Courtois','GK','rare',90),
('saka','Bukayo Saka','RW','rare',90),
('foden','Phil Foden','CAM','rare',90),
('wirtz','Florian Wirtz','CAM','epic',91),
('dias','Rúben Dias','CB','rare',90)
on conflict(card_key) do update set player_name=excluded.player_name,position=excluded.position,rarity=excluded.rarity,ovr=excluded.ovr,active=true;

grant select on public.player_catalog to anon, authenticated;

-- Profile edits: only cosmetic identity fields may be changed directly by the client.
revoke update on public.profiles from authenticated;
grant update(display_name,club_name,kit,avatar_id,updated_at) on public.profiles to authenticated;

-- Replace generic starter cards with real-player catalog cards for new accounts.
create or replace function public.seed_starter_cards()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.player_cards(user_id,card_key,player_name,position,rarity,ovr) values
  (new.id,'mbappe','Kylian Mbappé','ST','legendary',97),
  (new.id,'vinicius','Vinícius Jr.','LW','legendary',96),
  (new.id,'bellingham','Jude Bellingham','CM','legendary',95),
  (new.id,'rodri','Rodri','DM','legendary',96),
  (new.id,'alisson','Alisson','GK','epic',91)
  on conflict(user_id,card_key) do nothing;
  return new;
end; $$;

-- Server-side pack pool from the catalog. No client can choose the card.
create or replace function public.open_pack(p_cost int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid:=auth.uid(); p public.profiles; n int; i int; r numeric; want_rarity text; rec public.player_catalog; result jsonb:='[]'::jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_cost not in (650,1200) then raise exception 'invalid_pack'; end if;
  select * into p from public.profiles where id=uid for update;
  if p.gold < p_cost then raise exception 'insufficient_gold'; end if;
  n:=case when p_cost=1200 then 5 else 3 end;
  update public.profiles set gold=gold-p_cost, updated_at=now() where id=uid;
  for i in 1..n loop
    r:=random();
    want_rarity:=case when r>.96 then 'legendary' when r>.70 then 'epic' when r>.30 then 'rare' else 'common' end;
    select * into rec from public.player_catalog where active and rarity=want_rarity order by random() limit 1;
    if rec.card_key is null then select * into rec from public.player_catalog where active order by random() limit 1; end if;
    insert into public.player_cards(user_id,card_key,player_name,position,rarity,ovr)
    values(uid,rec.card_key,rec.player_name,rec.position,rec.rarity,rec.ovr)
    on conflict(user_id,card_key) do update set quantity=player_cards.quantity+1;
    result:=result || jsonb_build_object('card_key',rec.card_key,'player_name',rec.player_name,'position',rec.position,'rarity',rec.rarity,'ovr',rec.ovr);
  end loop;
  return result;
end; $$;
grant execute on function public.open_pack(int) to authenticated;
