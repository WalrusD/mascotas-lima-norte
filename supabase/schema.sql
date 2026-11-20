-- Instalar una sola vez en un proyecto Supabase vacío.
create table public.pets (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  species text not null check (species in ('Perro','Gato','Otro')),
  district text not null check (district in ('Los Olivos','Comas','San Martín de Porres','Independencia')),
  created_at timestamptz not null default now()
);
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  district text not null check (district in ('Los Olivos','Comas','San Martín de Porres','Independencia')),
  category text not null check (category in ('Heces','Orina','Mascota suelta')),
  address text not null check (length(trim(address)) between 3 and 200),
  description text not null check (length(trim(description)) between 5 and 1000),
  latitude double precision check (latitude between -12.3 and -11.7),
  longitude double precision check (longitude between -77.3 and -76.7),
  photo_path text,
  status text not null default 'Pendiente' check (status in ('Pendiente','En atención','Resuelto')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index pets_owner_created_idx on public.pets(owner_id, created_at desc);
create index reports_reporter_created_idx on public.reports(reporter_id, created_at desc);
create index reports_district_status_created_idx on public.reports(district,status,created_at desc);
create index reports_map_idx on public.reports(latitude,longitude) where latitude is not null;
alter table public.pets enable row level security;
alter table public.reports enable row level security;

-- El rol municipal se asigna únicamente desde Auth Admin; nunca desde user_metadata del navegador.
create policy pets_read on public.pets for select to authenticated using (
  owner_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'inspector'
);
create policy pets_insert on public.pets for insert to authenticated with check (owner_id = (select auth.uid()));
create policy pets_update on public.pets for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy reports_read on public.reports for select to authenticated using (
  reporter_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'inspector'
);
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'Pendiente' and
    (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));
create policy reports_update on public.reports for update to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'inspector')
  with check ((select auth.jwt()->'app_metadata'->>'role') = 'inspector');

-- Resumen público sin datos del denunciante; no permite leer la tabla reports directamente.
create function public.public_report_points()
returns table(id bigint, district text, category text, status text, latitude double precision, longitude double precision, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id,r.district,r.category,r.status,r.latitude,r.longitude,r.created_at
  from public.reports r where r.latitude is not null and r.longitude is not null;
$$;
revoke all on function public.public_report_points() from public;
grant execute on function public.public_report_points() to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('report-photos','report-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy photo_upload on storage.objects for insert to authenticated
  with check (bucket_id='report-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy photo_read on storage.objects for select to authenticated
  using (bucket_id='report-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select auth.jwt()->'app_metadata'->>'role')='inspector'));
