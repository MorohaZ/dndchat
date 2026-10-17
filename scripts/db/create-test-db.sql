-- Execute as user postgres against maintenance database postgres (never dndchat).
-- Must be run via psql with -v ON_ERROR_STOP=1 only (uses psql \gexec meta-command).
-- Contains NO DROP commands.

-- 1. If dndchat_test already exists without the expected sandbox marker, abort instead of overwriting.
DO $$
DECLARE
  existing_comment text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'dndchat_test') THEN
    SELECT shobj_description(oid, 'pg_database')
    INTO existing_comment
    FROM pg_database
    WHERE datname = 'dndchat_test';

    IF existing_comment IS DISTINCT FROM 'dndchat-test-sandbox' THEN
      RAISE EXCEPTION 'Database dndchat_test already exists with unexpected comment (%) - refusing to overwrite sentinel marker', existing_comment;
    END IF;
  END IF;
END
$$;

-- 2. Create database and set sentinel marker only when the database does not exist yet.
SELECT
  'CREATE DATABASE dndchat_test;',
  'COMMENT ON DATABASE dndchat_test IS ''dndchat-test-sandbox'';'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dndchat_test') \gexec
