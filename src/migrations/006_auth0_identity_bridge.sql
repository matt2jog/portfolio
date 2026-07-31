SET LOCAL search_path = portfolio, extensions, public;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth0_sub TEXT;

ALTER TABLE users
  ALTER COLUMN google_sub DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_sub_key
  ON users (auth0_sub)
  WHERE auth0_sub IS NOT NULL;
