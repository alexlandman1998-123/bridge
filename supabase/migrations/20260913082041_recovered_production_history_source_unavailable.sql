begin;

-- Recovery marker: this version existed in the linked production migration
-- ledger, but its original source was unavailable in accessible Git history.
-- The already-existing production schema was not replayed or reconstructed.

commit;
