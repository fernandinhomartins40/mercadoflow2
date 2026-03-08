alter table if exists markets
    add column if not exists billing_status text not null default 'ACTIVE',
    add column if not exists user_seat_limit integer,
    add column if not exists access_expires_at timestamp,
    add column if not exists trial_ends_at timestamp,
    add column if not exists contact_name text,
    add column if not exists contact_email text,
    add column if not exists contact_phone text,
    add column if not exists notes text,
    add column if not exists updated_at timestamp;

alter table if exists users
    add column if not exists last_login_at timestamp;

update markets
set user_seat_limit = case
    when plan_type = 'ADVANCED' then 30
    when plan_type = 'INTERMEDIATE' then 10
    else 3
end
where user_seat_limit is null;

update markets
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create index if not exists idx_markets_billing_status on markets(billing_status);
create index if not exists idx_markets_access_expires_at on markets(access_expires_at);
create index if not exists idx_users_last_login_at on users(last_login_at);
