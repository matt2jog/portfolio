SET LOCAL search_path = portfolio, extensions, public;

DO $bind_auth0_administrator$
DECLARE
  designated_email CONSTANT text := 'matthewtujague@gmail.com';
  designated_subject CONSTANT text := 'auth0|6a6a31f3dcd15973869d4c19';
  designated_rows integer;
  subject_conflicts integer;
  updated_rows integer;
BEGIN
  LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)
  INTO designated_rows
  FROM users
  WHERE lower(btrim(email)) = designated_email
    AND role = 'admin';

  IF designated_rows <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one designated Portfolio administrator, found %',
      designated_rows;
  END IF;

  SELECT count(*)
  INTO subject_conflicts
  FROM users
  WHERE auth0_sub = designated_subject
    AND lower(btrim(email)) <> designated_email;

  IF subject_conflicts <> 0 THEN
    RAISE EXCEPTION
      'Verified Auth0 subject is already bound to another Portfolio user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE lower(btrim(email)) = designated_email
      AND auth0_sub IS NOT NULL
      AND auth0_sub <> designated_subject
  ) THEN
    RAISE EXCEPTION
      'Designated Portfolio administrator has a conflicting Auth0 subject';
  END IF;

  UPDATE users
  SET auth0_sub = designated_subject
  WHERE lower(btrim(email)) = designated_email
    AND role = 'admin'
    AND (auth0_sub IS NULL OR auth0_sub = designated_subject);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION
      'Expected to bind exactly one Portfolio administrator, updated %',
      updated_rows;
  END IF;
END
$bind_auth0_administrator$;
