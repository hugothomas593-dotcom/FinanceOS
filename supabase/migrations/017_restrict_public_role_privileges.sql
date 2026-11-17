-- Restrict browser-facing database privileges to the minimum required.
-- Row-level security remains the row authorization boundary for authenticated users.
-- Anonymous browser sessions do not need direct table access; public demo data is static.
revoke all privileges on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Prevent future public tables from inheriting broad anonymous grants.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
