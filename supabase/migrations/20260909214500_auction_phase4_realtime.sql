-- Auction MVP, phase 4: broadcast bid and lifecycle changes to authorised
-- internal auction consoles. RLS continues to govern the row data clients see.

begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_bids') then
      alter publication supabase_realtime add table public.auction_bids;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auctions') then
      alter publication supabase_realtime add table public.auctions;
    end if;
  end if;
end;
$$;

commit;
