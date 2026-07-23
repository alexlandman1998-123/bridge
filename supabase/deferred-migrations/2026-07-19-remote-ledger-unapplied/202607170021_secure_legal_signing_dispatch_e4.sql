begin;

create unique index if not exists document_packet_signers_signing_token_unique
  on public.document_packet_signers (signing_token)
  where signing_token is not null;

create or replace function public.bridge_enforce_secure_signing_dispatch_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.signing_token is null then
    if new.token_expires_at is not null then
      raise exception 'E4 token expiry cannot exist without a signing token.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.signing_token !~ '^[0-9a-f]{64}$'
    or new.token_expires_at is null
    or new.token_expires_at < now() + interval '55 minutes'
    or new.token_expires_at > now() + interval '168 hours 5 minutes'
    or coalesce(new.status, '') not in ('sent', 'viewed', 'signed') then
    raise exception 'E4 signing token must be cryptographically strong, time-bounded and attached to a dispatched signer.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE'
    and old.token_used_at is not null
    and new.signing_token is not distinct from old.signing_token then
    raise exception 'E4 a consumed signing token cannot be reissued.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_secure_legal_signing_dispatch_token on public.document_packet_signers;
create trigger trg_secure_legal_signing_dispatch_token
before insert or update of signing_token, token_expires_at on public.document_packet_signers
for each row execute function public.bridge_enforce_secure_signing_dispatch_token();

comment on function public.bridge_enforce_secure_signing_dispatch_token() is
  'E4 database backstop requiring unique 256-bit signing tokens, bounded expiry, dispatch state and rotation after consumption.';

commit;
