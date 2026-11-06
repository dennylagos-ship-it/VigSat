-- VigSat: esquema inicial del MVP
-- Cuentas (flota o particular), miembros, vehículos/dispositivos y posiciones GPS.

-- ============================================================
-- Tipos
-- ============================================================
create type public.account_kind as enum ('fleet', 'personal');
create type public.member_role  as enum ('owner', 'admin', 'viewer', 'driver');
create type public.device_kind  as enum ('phone', 'gps_tracker');

-- ============================================================
-- Cuentas: una empresa con flota o un particular
-- ============================================================
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  kind        public.account_kind not null default 'personal',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Miembros de cada cuenta
-- ============================================================
create table public.account_members (
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id);

-- ============================================================
-- Dispositivos: un celular con la app o un rastreador GPS físico,
-- normalmente instalado en un vehículo.
-- ============================================================
create table public.devices (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  plate              text,                       -- placa del vehículo
  kind               public.device_kind not null default 'phone',
  imei               text unique,                -- solo rastreadores físicos
  assigned_user_id   uuid references auth.users(id) on delete set null, -- quién transmite desde su celular
  last_lat           double precision,
  last_lng           double precision,
  last_speed_kmh     real,
  last_heading       real,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index devices_account_idx on public.devices (account_id);
create index devices_assigned_user_idx on public.devices (assigned_user_id);

-- ============================================================
-- Posiciones GPS
-- ============================================================
create table public.positions (
  id            bigint generated always as identity primary key,
  device_id     uuid not null references public.devices(id) on delete cascade,
  recorded_at   timestamptz not null,           -- hora en que el GPS tomó el punto
  received_at   timestamptz not null default now(),
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  speed_kmh     real check (speed_kmh >= 0),
  heading       real check (heading >= 0 and heading < 360),
  accuracy_m    real check (accuracy_m >= 0),
  battery_pct   smallint check (battery_pct between 0 and 100)
);
create index positions_device_time_idx on public.positions (device_id, recorded_at desc);

-- ============================================================
-- Funciones auxiliares para RLS (security definer evita recursión)
-- ============================================================
create or replace function public.is_account_member(p_account_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_account_admin(p_account_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

-- Crea una cuenta y deja al usuario actual como dueño.
create or replace function public.create_account(p_name text, p_kind public.account_kind)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.accounts (name, kind) values (p_name, p_kind) returning id into v_id;
  insert into public.account_members (account_id, user_id, role)
    values (v_id, (select auth.uid()), 'owner');
  return v_id;
end;
$$;

-- Al recibir una posición, actualiza la "última posición" del dispositivo.
create or replace function public.update_device_last_position()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.devices d
     set last_lat       = new.lat,
         last_lng       = new.lng,
         last_speed_kmh = new.speed_kmh,
         last_heading   = new.heading,
         last_seen_at   = new.recorded_at
   where d.id = new.device_id
     and (d.last_seen_at is null or d.last_seen_at <= new.recorded_at);
  return new;
end;
$$;

create trigger positions_update_device
after insert on public.positions
for each row execute function public.update_device_last_position();

revoke execute on function public.update_device_last_position() from public, anon, authenticated;
revoke execute on function public.create_account(text, public.account_kind) from public, anon;
grant  execute on function public.create_account(text, public.account_kind) to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.accounts        enable row level security;
alter table public.account_members enable row level security;
alter table public.devices         enable row level security;
alter table public.positions       enable row level security;

-- accounts
create policy "members read account" on public.accounts
  for select to authenticated using (public.is_account_member(id));
create policy "admins update account" on public.accounts
  for update to authenticated using (public.is_account_admin(id)) with check (public.is_account_admin(id));

-- account_members
create policy "members read members" on public.account_members
  for select to authenticated using (public.is_account_member(account_id));
create policy "admins manage members" on public.account_members
  for all to authenticated using (public.is_account_admin(account_id)) with check (public.is_account_admin(account_id));

-- devices
create policy "members read devices" on public.devices
  for select to authenticated using (public.is_account_member(account_id));
create policy "admins manage devices" on public.devices
  for all to authenticated using (public.is_account_admin(account_id)) with check (public.is_account_admin(account_id));

-- positions
create policy "members read positions" on public.positions
  for select to authenticated
  using (exists (
    select 1 from public.devices d
    where d.id = positions.device_id and public.is_account_member(d.account_id)
  ));
-- El celular solo puede enviar posiciones del dispositivo que tiene asignado.
-- Los rastreadores físicos enviarán por una Edge Function con la service key.
create policy "assigned phone inserts positions" on public.positions
  for insert to authenticated
  with check (exists (
    select 1 from public.devices d
    where d.id = positions.device_id
      and d.kind = 'phone'
      and d.assigned_user_id = (select auth.uid())
  ));

-- ============================================================
-- Tiempo real: el panel escucha cambios en devices
-- ============================================================
alter publication supabase_realtime add table public.devices;
