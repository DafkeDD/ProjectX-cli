-- Tot waar we de events van de hub opgehaald hebben. Eén rij.
-- (processed_events zegt WELKE events al verwerkt zijn; deze teller zegt tot
--  waar we gehaald hebben, zodat een event dat even misliep opnieuw komt.)

create table event_cursor (
    id boolean primary key default true check (id),
    last_event_id text,
    updated_at timestamptz not null default now()
);

insert into event_cursor (id, last_event_id) values (true, null);
