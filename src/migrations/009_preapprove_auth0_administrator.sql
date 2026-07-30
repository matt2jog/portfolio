SET LOCAL search_path = portfolio, extensions, public;

INSERT INTO users (
  email,
  google_sub,
  auth0_sub,
  name,
  role
)
VALUES (
  'matthewtujague@gmail.com',
  NULL,
  NULL,
  'Matthew Tujague',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

DO $verify_preapproved_administrator$
DECLARE
  matching_administrators integer;
BEGIN
  SELECT count(*)
  INTO matching_administrators
  FROM users
  WHERE lower(email) = 'matthewtujague@gmail.com'
    AND role = 'admin';

  IF matching_administrators <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one preapproved Auth0 administrator, found %',
      matching_administrators;
  END IF;
END
$verify_preapproved_administrator$;
