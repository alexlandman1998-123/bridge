begin;

-- Most source events resolve to one or two client anchors. The default SRF
-- estimate of 1000 makes PostgreSQL hash-scan the entire client-link journal
-- for every source event. A small estimate favours the existing identity index.
-- ROWS is a planner hint: it does not limit results or change authorization.
alter function arch9_client_private.activity_anchors(text,jsonb) rows 4;

commit;
