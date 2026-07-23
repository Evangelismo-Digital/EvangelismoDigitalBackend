-- Enable query statistics collection (consumed by postgres-exporter's stat_statements
-- collector for the Grafana "Database internals" dashboard).
-- Requires `shared_preload_libraries = 'pg_stat_statements'` on the server, which is set
-- via the db service command in docker-compose*.yml. The db therefore starts with the
-- library preloaded before this migration runs, so CREATE EXTENSION succeeds.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
