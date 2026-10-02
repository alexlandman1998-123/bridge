begin;

-- Match the primary app's document upload policy, including large OTP PDFs.
-- Preserve document types and the separate rental application upload policy.
update storage.buckets
set file_size_limit = 35 * 1024 * 1024
where id = 'documents';

commit;
