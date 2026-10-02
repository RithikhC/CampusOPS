/** Idempotent schema; applied on every boot. Plain Postgres so it runs on PGlite and hosted Postgres alike. */
export const SCHEMA_SQL = /* sql */ `
create table if not exists students (
  id          text primary key,              -- university ID, e.g. 2024A7PS0112U
  name        text not null,
  email       text not null unique,
  hostel      text not null,
  room        text not null,
  active      boolean not null default true, -- inactive = graduated / withdrawn; their passes stop working
  created_at  timestamptz not null default now()
);

create table if not exists staff (
  id     text primary key,
  name   text not null,
  email  text not null unique,
  role   text not null check (role in ('guard', 'admin')),
  title  text not null default ''
);

create table if not exists checkpoints (
  id      text primary key,
  name    text not null,
  hostel  text
);

-- One row per night. Scans belong to the roll call that was active when they happened.
create table if not exists roll_calls (
  id          integer generated always as identity primary key,
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  curfew_at   timestamptz not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- Every scan attempt is kept, including rejected ones: that is the audit trail.
create table if not exists scans (
  id               integer generated always as identity primary key,
  client_id        text not null unique,        -- generated on the scanner; makes offline sync idempotent
  roll_call_id     integer not null references roll_calls(id) on delete cascade,
  student_id       text references students(id) on delete set null,
  claimed_id       text,                        -- ID read from the code, kept even if not on the roster
  checkpoint_id    text references checkpoints(id),
  scanned_by       text not null,
  method           text not null check (method in ('qr', 'manual', 'self', 'round')),
  result           text not null check (result in ('valid', 'late', 'manual', 'duplicate', 'expired', 'invalid', 'unknown', 'absent')),
  reason           text not null,
  scanned_at       timestamptz not null,        -- when the guard scanned (device time)
  received_at      timestamptz not null default now(),
  offline          boolean not null default false,
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text,
  device_id        text                         -- phone used for a room check-in
);

-- Upgrades for databases created before room check-ins and rounds existed.
alter table scans add column if not exists device_id text;
alter table scans drop constraint if exists scans_method_check;
alter table scans add constraint scans_method_check check (method in ('qr', 'manual', 'self', 'round'));
alter table scans drop constraint if exists scans_result_check;
alter table scans add constraint scans_result_check
  check (result in ('valid', 'late', 'manual', 'duplicate', 'expired', 'invalid', 'unknown', 'absent'));

-- The one phone each student may check in from. Registered on first use; the hostel office can reset it.
create table if not exists student_devices (
  student_id     text primary key references students(id) on delete cascade,
  device_id      text not null,
  registered_at  timestamptz not null default now()
);

-- What the warden found at the door during rounds: one row per student per night.
create table if not exists room_visits (
  roll_call_id  integer not null references roll_calls(id) on delete cascade,
  student_id    text not null references students(id) on delete cascade,
  outcome       text not null check (outcome in ('present', 'absent')),
  visited_by    text not null,
  visited_at    timestamptz not null,
  primary key (roll_call_id, student_id)
);

-- A student can be marked present at most once per roll call, even if two gates scan at the same instant.
create unique index if not exists scans_one_presence
  on scans (roll_call_id, student_id) where result in ('valid', 'late', 'manual');
create index if not exists scans_by_roll_call on scans (roll_call_id, scanned_at desc);
create index if not exists scans_by_student on scans (student_id, roll_call_id);

create table if not exists audit_log (
  id      integer generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  detail  text not null default ''
);
`;
