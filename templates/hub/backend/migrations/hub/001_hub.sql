-- SSO-hub: alles in één database (projectx_hub), 9 tabellen.
-- (De tabel "migrations" maakt de migratie-runner zelf aan.)

-- Gebruikers.
create table accounts (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    password_hash text not null,
    name text not null,
    locale text,
    status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
    is_admin boolean not null default false,
    mfa jsonb,                                   -- later: versleutelde MFA-gegevens
    email_verified_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index accounts_email_key on accounts (lower(email));

-- Organisaties = tenants. Een persoon alleen is een organisatie met één lid.
create table organizations (
    id uuid primary key default gen_random_uuid(),
    tenant_key text not null unique,             -- eerste 12 hex-tekens van id
    name text not null,
    kind text not null default 'person' check (kind in ('person', 'company')),
    billing jsonb not null default '{}',         -- Mollie-klant, factuuradres, btw (fase 2b)
    settings jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Wie in welke organisatie, met welke rol, en in welke apps (= seats).
create table memberships (
    org_id uuid not null references organizations (id) on delete cascade,
    account_id uuid not null references accounts (id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'admin', 'member')),
    apps text[] not null default '{}',
    created_at timestamptz not null default now(),
    primary key (org_id, account_id)
);
create index memberships_account_idx on memberships (account_id);

-- Tokens om apps aan te sluiten (RFC 7591). Het token zelf staat versleuteld,
-- zodat een beheerder het later nog kan tonen; token_hash dient om op te zoeken.
create table registration_tokens (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    token text not null,
    token_hash text not null unique,
    hint text not null,                          -- laatste 4 tekens
    expires_at timestamptz,
    max_uses integer,
    uses integer not null default 0,
    allowed_domains text[] not null default '{}',
    status text not null default 'active' check (status in ('active', 'revoked')),
    created_by uuid references accounts (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Aangesloten apps = OIDC-clients.
create table apps (
    id text primary key,                         -- appKey = client_id
    name text not null,
    client jsonb not null,                       -- OIDC-metadata; client_secret versleuteld
    plans jsonb not null default '[]',
    webhook_url text,
    webhook_secret text,                         -- versleuteld
    registration_token_id uuid references registration_tokens (id) on delete set null,
    status text not null default 'active' check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Licentie per organisatie per app (fase 2b: kopen via Mollie).
create table licenses (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations (id) on delete cascade,
    app_id text not null references apps (id) on delete cascade,
    plan text not null,
    seats integer not null default 1,
    interval text not null default 'month' check (interval in ('month', 'year')),
    valid_until timestamptz,
    status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'revoked')),
    billing jsonb not null default '{}',
    provisioning jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (org_id, app_id)
);

-- Alles van oidc-provider (sessies, codes, tokens, grants, …) + eigen tijdelijke
-- codes: EmailVerification, PasswordReset, HubSession, GrantOrg, Invitation.
create table oidc_store (
    kind text not null,
    id text not null,
    payload jsonb not null,
    grant_id text,
    uid text,
    user_code text,
    expires_at timestamptz,
    consumed_at timestamptz,
    primary key (kind, id)
);
create index oidc_store_grant_idx on oidc_store (grant_id);
create index oidc_store_uid_idx on oidc_store (uid);
create index oidc_store_user_code_idx on oidc_store (user_code);
create index oidc_store_expires_idx on oidc_store (expires_at);

-- Auditlog + wachtrij voor events naar apps (fase 3).
create table events (
    id text primary key,                         -- ULID (oplopend)
    type text not null,
    app_id text,                                 -- leeg = alle apps
    org_id uuid,
    actor_id uuid,
    data jsonb not null default '{}',
    delivery jsonb,
    created_at timestamptz not null default now()
);
create index events_created_idx on events (created_at);

-- Sleutels en instellingen (ondertekensleutels en cookie-sleutels versleuteld).
create table settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);
