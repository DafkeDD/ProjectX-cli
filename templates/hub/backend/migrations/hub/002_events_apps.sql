-- Fase 3: apps halen hun events op (alles na id X) en de hub stuurt ze op.
create index events_app_idx on events (app_id, id) where app_id is not null;
create index events_pending_idx on events ((delivery ->> 'state')) where delivery is not null;
