-- H1 — Least-privilege DB role for the Orbit edge function.
--
-- The function currently connects via SUPABASE_DB_URL (the `postgres` role),
-- which can read/write every schema in this shared project (payments, secrets,
-- admin tables). This role caps its blast radius to the `orbit` schema.
--
-- Activate after applying: set the function secret ORBIT_DB_ROLE=orbit_app and
-- redeploy. The function then runs all queries as `orbit_app`.
--
-- `bypassrls` is required because the orbit tables have RLS enabled with no
-- policies (deny-all to non-bypass roles). It bypasses *row* security only — it
-- grants NO table privileges outside `orbit`, so orbit_app still cannot touch
-- `public.*`. If your project's `postgres` role cannot create a bypassrls role,
-- create `orbit_app` without it and instead add permissive `using (true)`
-- policies on the five orbit tables for `orbit_app`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'orbit_app') then
    create role orbit_app nologin bypassrls;
  end if;
end $$;

grant usage on schema orbit to orbit_app;
grant select, insert, update, delete on all tables in schema orbit to orbit_app;
grant usage, select on all sequences in schema orbit to orbit_app;
alter default privileges in schema orbit grant select, insert, update, delete on tables to orbit_app;
alter default privileges in schema orbit grant usage, select on sequences to orbit_app;

-- Belt and suspenders: no reach into the rest of the project.
revoke all on schema public from orbit_app;

-- Allow the function's connecting role(s) to drop into orbit_app for the session.
-- (Supabase edge functions use SUPABASE_DB_URL = postgres; service_role granted
-- too as a safety margin in case the connection role differs.)
grant orbit_app to postgres;
grant orbit_app to service_role;
