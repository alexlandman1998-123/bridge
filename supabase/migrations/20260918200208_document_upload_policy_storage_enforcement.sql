begin;

-- Enforce the shared document policy at the storage boundary. Application-side
-- validation improves feedback; these limits prevent a bypassed client from
-- storing a larger or unsupported document in either private document bucket.
update storage.buckets
set
  file_size_limit = 25 * 1024 * 1024,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]::text[]
where id = 'documents';

update storage.buckets
set
  file_size_limit = 8 * 1024 * 1024,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]::text[]
where id = 'rental-application-documents';

commit;
