-- Performance indexes for high-traffic workspace routes.
-- Safe to run repeatedly.

DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_development_id ON public.transactions (development_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON public.transactions (buyer_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_assigned_agent_id ON public.transactions (assigned_agent_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_assigned_attorney_id ON public.transactions (assigned_attorney_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_assigned_bond_originator_id ON public.transactions (assigned_bond_originator_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_stage ON public.transactions (stage)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_current_main_stage ON public.transactions (current_main_stage)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_is_active ON public.transactions (is_active)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transactions_updated_at_desc ON public.transactions (updated_at DESC)';
  END IF;

  IF to_regclass('public.documents') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_transaction_id ON public.documents (transaction_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents (category)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_transaction_category ON public.documents (transaction_id, category)';
  END IF;

  IF to_regclass('public.transaction_comments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_comments_transaction_id ON public.transaction_comments (transaction_id)';
  END IF;

  IF to_regclass('public.transaction_events') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_events_transaction_id ON public.transaction_events (transaction_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_events_created_at_desc ON public.transaction_events (created_at DESC)';
  END IF;

  IF to_regclass('public.transaction_subprocesses') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_subprocesses_transaction_id ON public.transaction_subprocesses (transaction_id)';
  END IF;

  IF to_regclass('public.transaction_subprocess_steps') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_transaction_subprocess_steps_subprocess_id ON public.transaction_subprocess_steps (subprocess_id)';
  END IF;

  IF to_regclass('public.client_portal_links') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_portal_links_transaction_id ON public.client_portal_links (transaction_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_portal_links_token ON public.client_portal_links (token)';
  END IF;
END;
$$;
