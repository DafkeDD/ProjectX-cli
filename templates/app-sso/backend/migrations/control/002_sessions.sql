-- Sessies van deze app: wie is ingelogd, voor welke organisatie, met welke tokens.
-- De cookie bevat enkel een toevalsgetal; hier staat de sha256 ervan.

create table sessions (
    id text primary key,                 -- sha256 van de cookie-waarde
    account_id uuid not null,            -- account in de hub (sub)
    org_id uuid not null,                -- organisatie in de hub
    tenant_key text not null,            -- database van die organisatie
    org_name text not null,
    org_role text not null check (org_role in ('owner', 'admin', 'member')),
    email text not null,
    name text not null,
    id_token text not null,              -- nodig om af te melden bij de hub
    refresh_token text,                  -- versleuteld met DB_SECRET_KEY
    access_token text,                   -- versleuteld met DB_SECRET_KEY
    access_expires_at timestamptz,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index sessions_account_idx on sessions (account_id);
create index sessions_org_idx on sessions (org_id);
