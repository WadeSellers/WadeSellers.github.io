# Backend setup (Supabase)

Everything the site needs from a server is "keep a little bit of what visitors
leave behind." Supabase gives us that with no server to run, and the whole
setup is doable from a phone because it is mostly tapping plus one paste.

## Why this is safe to ship in a public repo

The `anon` key is *designed* to be public. It goes in the browser, anyone can
read it, and that is fine. Security comes from Row Level Security policies on
the table, not from hiding the key. The policies below allow reading and
appending, and nothing else. Nobody can edit or delete another person's stroke,
because no policy grants it.

The honest caveat: a public insert policy means a determined person could spam
rows. The size limits in the schema cap the damage per row, and the 24-hour
fade means anything ugly clears itself out. If it ever becomes a real problem,
the fix is a rate limit in an edge function, not a redesign.

## Steps

1. **supabase.com** in your phone browser, sign in with GitHub.
2. **New project.** Name it `wadesellers-site`. Generate the database password
   and save it in your password manager. Region: `East US (North Virginia)`.
3. Wait about two minutes while it provisions.
4. **SQL Editor** in the left nav, paste everything in the block below, **Run**.
5. **Project Settings → API.** Supabase has moved this around between redesigns,
   so it may be labeled "API Keys." You want two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon / public** key (a long string starting `eyJ`)
6. Send both back and they get wired into the site.

Do not send the database password, the `service_role` key, or anything labeled
secret. Those never touch the browser.

## The SQL to paste

```sql
-- One finger-stroke on the wall.
create table public.strokes (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  color      text  not null,
  width      real  not null,
  points     jsonb not null,

  -- Caps so one request cannot dump a novel into the table.
  constraint color_is_hex   check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint width_sane     check (width between 1 and 48),
  constraint points_sane    check (jsonb_array_length(points) between 2 and 600)
);

-- The wall reads "newest first," so index that.
create index strokes_created_at_idx on public.strokes (created_at desc);

alter table public.strokes enable row level security;

-- Anyone may read the wall.
create policy "wall is public"
  on public.strokes for select
  using (true);

-- Anyone may add to the wall.
create policy "anyone may draw"
  on public.strokes for insert
  with check (true);

-- Deliberately no update or delete policy: strokes are append-only,
-- and nobody can touch someone else's.

-- Live updates, so a stroke appears for everyone already on the page.
alter publication supabase_realtime add table public.strokes;
```

## Wet paint

Strokes fade after 24 hours. The page only ever asks for recent ones:

```sql
select color, width, points
from public.strokes
where created_at > now() - interval '24 hours'
order by created_at asc
limit 400;
```

Old rows can be swept later with a scheduled job. They cost nothing sitting
there, so this is not urgent.

## Optional: the visitor counter

The homepage shows a "hands so far" chip when this table exists, and simply
leaves the chip out when it does not, so there is no rush. Paste this whenever
you want the counter to switch on:

```sql
create table public.visits (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create index visits_created_at_idx on public.visits (created_at desc);

alter table public.visits enable row level security;

create policy "count is public"
  on public.visits for select
  using (true);

create policy "anyone may arrive"
  on public.visits for insert
  with check (true);

grant select, insert on public.visits to anon;
```

Worth saying plainly: anyone could pad this number by reloading, and there is
no attempt to stop them. It is a counter on a toy, not an analytics product.
If it ever matters, the fix is to record a coarse fingerprint and count
distinct ones, but that is a different and more invasive thing.

## The rest of the tables

Two more small tables. Paste the whole block at once; neither depends on the
other, and the site works without both, it just quietly leaves out the parts
they power.

```sql
-- Powers "visitor #N" on the homepage. The id is the visitor number: the
-- page inserts a row and reads back the id it was given.
create table public.visits (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
create index visits_created_at_idx on public.visits (created_at desc);
alter table public.visits enable row level security;
create policy "count is public" on public.visits for select using (true);
create policy "anyone may arrive" on public.visits for insert with check (true);
grant select, insert on public.visits to anon;

-- Powers the Wipe button on the wall. A wipe records a moment, it does not
-- delete anything: the live wall shows marks made since the last wipe, and
-- the time-lapse replays every mark ever made, clearing at each wipe so the
-- history reads as chapters instead of one pile.
create table public.wipes (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
create index wipes_created_at_idx on public.wipes (created_at desc);
alter table public.wipes enable row level security;
create policy "wipes are public" on public.wipes for select using (true);
create policy "anyone may wipe" on public.wipes for insert with check (true);
grant select, insert on public.wipes to anon;
```

The Wipe button stays hidden until the `wipes` table exists, so nothing looks
broken in the meantime.

Anyone can wipe, and no attempt is made to stop them. On a toy that is the
right trade: the marks are never destroyed, so the worst a bad actor achieves
is starting a new chapter, and the time-lapse still shows everything they tried
to hide.
