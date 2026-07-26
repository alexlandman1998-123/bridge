begin;

alter table public.canvassing_prospects
  drop constraint if exists canvassing_prospects_status_check;

alter table public.canvassing_prospects
  add constraint canvassing_prospects_status_check
  check (status in (
    'New',
    'Contacted',
    'Interested',
    'Qualified',
    'Viewing Scheduled',
    'Offer Potential',
    'Not Ready',
    'Follow-Up Later',
    'Not Interested',
    'Converted to Lead',
    'Lost',
    'Archived'
  ));

commit;
