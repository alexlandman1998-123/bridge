-- Preserve vector site plans so the availability editor can read SVG labels
-- and render the original plan without rasterising it.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml'
]::text[]
where id = 'documents';
