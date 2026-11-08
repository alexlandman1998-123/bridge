begin;

-- Keep the instruction independent of tab layout: Parties is a contact view,
-- while attorney allocation is available in the conveyancing workspace.
do $migration$
declare definition text; old_text constant text := 'Review outstanding documents and confirm the transfer attorney in Parties.';
begin
  definition:=pg_get_functiondef('handoff_private.release_reviewed_uploaded_otp()'::regprocedure);
  if position(old_text in definition)=0 then raise exception 'Unexpected uploaded OTP release definition'; end if;
  execute replace(definition,old_text,'Review outstanding documents and select the transfer attorney.');
end;
$migration$;

commit;
