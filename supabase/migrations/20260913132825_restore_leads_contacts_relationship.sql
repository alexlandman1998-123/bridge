-- Restore the canonical lead-to-contact relationship used by the Data API
-- embedding syntax: leads(..., contacts(...)). Historical orphaned references
-- are retained, while new and changed links are enforced going forward.

alter table public.leads
  drop constraint if exists leads_contact_id_fkey;

alter table public.leads
  add constraint leads_contact_id_fkey
  foreign key (contact_id)
  references public.contacts(contact_id)
  on delete set null
  not valid;

comment on constraint leads_contact_id_fkey on public.leads is
  'Canonical lead-to-contact relationship. Not validated to preserve historical orphaned links.';

notify pgrst, 'reload schema';
