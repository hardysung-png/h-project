-- 가족 & 지인 이벤트 관리 웹앱 — V0.1

create extension if not exists "pgcrypto";

-- 이벤트 (최상위 단위)
create table events (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  invite_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz not null default now()
);

-- 세부 일정 (이벤트 안에 여러 개)
create table schedules (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  title       text not null,
  starts_at   timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 참석자 (닉네임만, 가입 불필요)
create table attendees (
  id                          uuid primary key default gen_random_uuid(),
  event_id                    uuid not null references events(id) on delete cascade,
  nickname                    text not null,
  is_adult                    boolean not null default true,
  is_excluded_from_settlement boolean not null default false,
  created_at                  timestamptz not null default now()
);

-- 일정별 참석 응답
create table attendance_responses (
  id           uuid primary key default gen_random_uuid(),
  attendee_id  uuid not null references attendees(id) on delete cascade,
  schedule_id  uuid not null references schedules(id) on delete cascade,
  attending    boolean not null,
  unique (attendee_id, schedule_id)
);

-- 비용 항목
create table cost_items (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,
  amount      int not null check (amount >= 0),
  child_ratio real not null default 0.5 check (child_ratio >= 0 and child_ratio <= 1)
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table events enable row level security;
alter table schedules enable row level security;
alter table attendees enable row level security;
alter table attendance_responses enable row level security;
alter table cost_items enable row level security;

-- 이벤트: 호스트만 CRUD
create policy "호스트 이벤트 select"  on events for select using (host_id = auth.uid());
create policy "호스트 이벤트 insert"  on events for insert with check (host_id = auth.uid());
create policy "호스트 이벤트 update"  on events for update using (host_id = auth.uid());
create policy "호스트 이벤트 delete"  on events for delete using (host_id = auth.uid());

-- 일정: 이벤트 호스트만
create policy "호스트 일정 select"  on schedules for select
  using (exists (select 1 from events where events.id = schedules.event_id and events.host_id = auth.uid()));
create policy "호스트 일정 insert"  on schedules for insert
  with check (exists (select 1 from events where events.id = event_id and events.host_id = auth.uid()));
create policy "호스트 일정 update"  on schedules for update
  using (exists (select 1 from events where events.id = schedules.event_id and events.host_id = auth.uid()));
create policy "호스트 일정 delete"  on schedules for delete
  using (exists (select 1 from events where events.id = schedules.event_id and events.host_id = auth.uid()));

-- 비용 항목: 이벤트 호스트만
create policy "호스트 비용 select"  on cost_items for select
  using (exists (select 1 from events where events.id = cost_items.event_id and events.host_id = auth.uid()));
create policy "호스트 비용 insert"  on cost_items for insert
  with check (exists (select 1 from events where events.id = event_id and events.host_id = auth.uid()));
create policy "호스트 비용 update"  on cost_items for update
  using (exists (select 1 from events where events.id = cost_items.event_id and events.host_id = auth.uid()));
create policy "호스트 비용 delete"  on cost_items for delete
  using (exists (select 1 from events where events.id = cost_items.event_id and events.host_id = auth.uid()));

-- 참석자/응답: 호스트 + 비로그인 참석자(anon) 모두 허용 (V0.1 — invite_token은 앱 레이어 검증)
-- NOTE V0.2에서 참석자별 개인 토큰 방식으로 강화 예정
create policy "호스트 참석자 select"  on attendees for select
  using (exists (select 1 from events where events.id = attendees.event_id and events.host_id = auth.uid()));
create policy "anon 참석자 insert"    on attendees for insert with check (true);
create policy "anon 참석자 update"    on attendees for update using (true);
create policy "anon 참석자 select"    on attendees for select using (true);

create policy "호스트 응답 select"  on attendance_responses for select
  using (exists (
    select 1 from attendees
    join events on events.id = attendees.event_id
    where attendees.id = attendance_responses.attendee_id
      and events.host_id = auth.uid()
  ));
create policy "anon 응답 insert"  on attendance_responses for insert with check (true);
create policy "anon 응답 upsert"  on attendance_responses for update using (true);

-- 초대 링크 페이지용: 이벤트/일정 비로그인 select (invite_token 알아야만 조회 가능하도록 앱에서 제어)
create policy "anon 이벤트 select" on events for select using (true);
create policy "anon 일정 select"   on schedules for select using (true);
