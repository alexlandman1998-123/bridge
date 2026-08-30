begin;

drop policy if exists rental_vacancy_media_upload on storage.objects;
create policy rental_vacancy_media_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rental-vacancy-media'
  and exists (
    select 1
    from public.rental_vacancies vacancy
    join public.rental_properties property on property.id = vacancy.property_id
    where vacancy.id::text = (storage.foldername(storage.objects.name))[2]
      and vacancy.organisation_id::text = (storage.foldername(storage.objects.name))[1]
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

commit;
