-- ══════════════════════════════════════════════
-- MIZAN · DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ══════════════════════════════════════════════

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  position integer default 0,
  created_at timestamptz default now(),
  archived_at timestamptz
);
alter table habits enable row level security;
create policy "users own habits" on habits for all using (auth.uid() = user_id);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  habit_id uuid references habits on delete cascade not null,
  date date not null,
  status text check (status in ('done','missed','na')) not null,
  created_at timestamptz default now(),
  unique(habit_id, date)
);
alter table habit_logs enable row level security;
create policy "users own habit_logs" on habit_logs for all using (auth.uid() = user_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  text text not null default '',
  done boolean default false,
  position integer default 0,
  created_at timestamptz default now()
);
alter table tasks enable row level security;
create policy "users own tasks" on tasks for all using (auth.uid() = user_id);

create table weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  week_start date not null,
  text text not null default '',
  done boolean default false,
  position integer default 0,
  created_at timestamptz default now()
);
alter table weekly_goals enable row level security;
create policy "users own weekly_goals" on weekly_goals for all using (auth.uid() = user_id);

create table monthly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  month text not null,
  text text not null default '',
  done boolean default false,
  position integer default 0,
  created_at timestamptz default now()
);
alter table monthly_goals enable row level security;
create policy "users own monthly_goals" on monthly_goals for all using (auth.uid() = user_id);

create table six_month_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text default '',
  category text default '',
  start_date date not null,
  end_date date not null,
  position integer default 0,
  created_at timestamptz default now()
);
alter table six_month_goals enable row level security;
create policy "users own six_month_goals" on six_month_goals for all using (auth.uid() = user_id);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references six_month_goals on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  text text not null default '',
  done boolean default false,
  position integer default 0,
  created_at timestamptz default now()
);
alter table milestones enable row level security;
create policy "users own milestones" on milestones for all using (auth.uid() = user_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  week_start date not null,
  win text default '',
  improve text default '',
  gratitude text default '',
  next_week text default '',
  updated_at timestamptz default now(),
  unique(user_id, week_start)
);
alter table reviews enable row level security;
create policy "users own reviews" on reviews for all using (auth.uid() = user_id);
