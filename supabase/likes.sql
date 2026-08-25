-- Anonymous, one-vote-per-browser likes for Phor3nsic posts.
-- Run this in Supabase Dashboard -> SQL Editor.

create table if not exists public.post_like_votes (
  post_slug text not null check (char_length(post_slug) between 1 and 240),
  post_title text,
  visitor_id text not null check (char_length(visitor_id) between 16 and 128),
  created_at timestamptz not null default now(),
  primary key (post_slug, visitor_id)
);

-- Safe migration for tables created before readable post titles were added.
alter table public.post_like_votes add column if not exists post_title text;

create index if not exists post_like_votes_post_slug_idx
  on public.post_like_votes (post_slug);

alter table public.post_like_votes enable row level security;

create or replace function public.get_post_like_count(p_post_slug text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.post_like_votes
  where post_slug = p_post_slug;
$$;

create or replace function public.toggle_post_like(
  p_post_slug text,
  p_visitor_id text
)
returns table(liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(p_post_slug) not between 1 and 240
     or char_length(p_visitor_id) not between 16 and 128 then
    raise exception 'Invalid like payload';
  end if;

  insert into public.post_like_votes (post_slug, visitor_id)
  values (p_post_slug, p_visitor_id)
  on conflict (post_slug, visitor_id) do nothing;

  if found then
    liked := true;
  else
    delete from public.post_like_votes
    where post_slug = p_post_slug and visitor_id = p_visitor_id;
    liked := false;
  end if;

  select count(*)::bigint into like_count
  from public.post_like_votes
  where post_slug = p_post_slug;

  return next;
end;
$$;

revoke all on table public.post_like_votes from anon, authenticated;
grant execute on function public.get_post_like_count(text) to anon, authenticated;
grant execute on function public.toggle_post_like(text, text) to anon, authenticated;

-- New clients also store the readable title alongside the stable post URL/slug.
create or replace function public.toggle_post_like(
  p_post_slug text,
  p_visitor_id text,
  p_post_title text default null
)
returns table(liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(p_post_slug) not between 1 and 240
     or char_length(p_visitor_id) not between 16 and 128 then
    raise exception 'Invalid like payload';
  end if;

  if exists (
    select 1 from public.post_like_votes
    where post_slug = p_post_slug and visitor_id = p_visitor_id
  ) then
    delete from public.post_like_votes
    where post_slug = p_post_slug and visitor_id = p_visitor_id;
    liked := false;
  else
    insert into public.post_like_votes (post_slug, post_title, visitor_id)
    values (p_post_slug, nullif(p_post_title, ''), p_visitor_id);
    liked := true;
  end if;

  select count(*)::bigint into like_count
  from public.post_like_votes
  where post_slug = p_post_slug;

  return next;
end;
$$;

grant execute on function public.toggle_post_like(text, text, text) to anon, authenticated;

-- Dashboard-friendly aggregate: one row per post with its title and total likes.
drop view if exists public.post_like_summary;
create view public.post_like_summary as
select post_slug,
       max(post_title) as post_title,
       count(*)::bigint as like_count,
       max(created_at) as last_like_at
from public.post_like_votes
group by post_slug;
