alter table public.reports
  add column assigned_to uuid references auth.users(id),
  add column attention_photo_path text;

drop policy reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'inspector'
    and (coalesce((select auth.jwt()->'app_metadata'->>'district'), district) = district))
  with check ((select auth.jwt()->'app_metadata'->>'role') = 'inspector'
    and (coalesce((select auth.jwt()->'app_metadata'->>'district'), district) = district));

create function public.check_report_workflow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.reporter_id, new.district, new.category, new.address, new.description,
      new.latitude, new.longitude, new.photo_path, new.created_at)
     is distinct from
     (old.reporter_id, old.district, old.category, old.address, old.description,
      old.latitude, old.longitude, old.photo_path, old.created_at) then
    raise exception 'No se pueden modificar los datos originales del reporte';
  end if;
  if old.status = 'Pendiente' and new.status = 'En atención' then
    if new.assigned_to is distinct from auth.uid() or new.resolution_note is not null
       or new.attention_photo_path is not null or new.resolved_at is not null then
      raise exception 'El inspector debe asignarse el reporte';
    end if;
  elsif old.status = 'En atención' and new.status = 'Resuelto' then
    if old.assigned_to is distinct from auth.uid() or new.assigned_to is distinct from old.assigned_to
       or nullif(trim(new.resolution_note), '') is null or new.attention_photo_path is null
       or split_part(new.attention_photo_path, '/', 1) <> auth.uid()::text
       or new.resolved_at is null then
      raise exception 'Se requiere inspector responsable, nota, evidencia y fecha de cierre';
    end if;
  else
    raise exception 'Transición de estado no permitida';
  end if;
  return new;
end;
$$;
create trigger check_report_workflow before update on public.reports
  for each row execute function public.check_report_workflow();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('attention-evidence','attention-evidence',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy attention_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id='attention-evidence'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and (select auth.jwt()->'app_metadata'->>'role')='inspector');
create policy attention_evidence_read on storage.objects for select to authenticated
  using (bucket_id='attention-evidence' and
    ((storage.foldername(name))[1]=(select auth.uid())::text
     or (select auth.jwt()->'app_metadata'->>'role')='inspector'));
create policy attention_evidence_delete on storage.objects for delete to authenticated
  using (bucket_id='attention-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text
    and (select auth.jwt()->'app_metadata'->>'role')='inspector');
