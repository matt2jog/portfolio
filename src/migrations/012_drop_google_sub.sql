SET LOCAL search_path = portfolio, extensions, public;

DO $verify_auth0_administrator$
DECLARE
  designated_email CONSTANT text := 'matthewtujague@gmail.com';
  expected_subject CONSTANT text := 'auth0|6a6a31f3dcd15973869d4c19';
  designated_rows integer;
  exact_subject_rows integer;
  conflicting_subject_rows integer;
  bound_subject text;
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

  SELECT auth0_sub
  INTO bound_subject
  FROM users
  WHERE lower(btrim(email)) = designated_email
    AND role = 'admin';

  IF bound_subject IS NULL THEN
    RAISE EXCEPTION
      'Designated Portfolio administrator has no Auth0 subject';
  END IF;

  IF bound_subject <> expected_subject THEN
    RAISE EXCEPTION
      'Designated Portfolio administrator has the wrong Auth0 subject';
  END IF;

  SELECT count(*)
  INTO conflicting_subject_rows
  FROM users
  WHERE auth0_sub = expected_subject
    AND lower(btrim(email)) <> designated_email;

  IF conflicting_subject_rows <> 0 THEN
    RAISE EXCEPTION
      'Verified Auth0 subject is bound to another Portfolio user';
  END IF;

  SELECT count(*)
  INTO exact_subject_rows
  FROM users
  WHERE auth0_sub = expected_subject;

  IF exact_subject_rows <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Portfolio user with the verified Auth0 subject, found %',
      exact_subject_rows;
  END IF;
END
$verify_auth0_administrator$;

ALTER TABLE users
  DROP COLUMN google_sub;
