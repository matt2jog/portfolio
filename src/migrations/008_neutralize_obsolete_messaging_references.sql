SET LOCAL search_path = portfolio, extensions, public;

UPDATE projects
SET description = replace(
      description,
      'real-time ' || chr(75) || 'afka processing',
      'real-time stream processing'
    ),
    long_description = replace(
      long_description,
      'Processed user messages via ' || chr(75) || 'afka with existing Series.so infrastructure',
      'Integrated with existing Series.so infrastructure'
    ),
    tech = ARRAY(
      SELECT item
      FROM unnest(tech) WITH ORDINALITY AS entry(item, ordinal)
      WHERE lower(btrim(item)) <> lower(chr(75) || 'afka')
      ORDER BY ordinal
    ),
    updated_at = now()
WHERE id = '63ea2928-778c-4677-a77b-3f8bdfe1218b';

UPDATE xyz_bullets
SET bullet_text =
      'Integrated with existing Series.so infrastructure to process real-time user-to-user interactions.',
    updated_at = now()
WHERE id = 'f132e7ca-73bd-41c0-85b1-a15f2f26d389'
  AND position(
      lower(chr(75) || 'afka')
      IN lower(bullet_text)
  ) > 0;

UPDATE github_timeline_events
SET description = CASE id
      WHEN '0e2c586b-7a78-4811-a9a9-56aaa9da50c7'
        THEN 'Tracked asset URL procurement, redirects, and structured operational telemetry'
      WHEN 'a2771f4f-0638-496a-a877-b48075f29428'
        THEN 'Decoupled communications microservice for calls, email, durable workflows, and provider integrations'
      ELSE description
    END,
    title = CASE id
      WHEN '2bf13607-8841-402a-a458-aa2f6849f195'
        THEN 'feat: consume career-context updates'
      ELSE title
    END
WHERE id IN (
  '0e2c586b-7a78-4811-a9a9-56aaa9da50c7',
  'a2771f4f-0638-496a-a877-b48075f29428',
  '2bf13607-8841-402a-a458-aa2f6849f195'
);

UPDATE audit_logs
SET payload = jsonb_set(
      payload,
      '{description}',
      to_jsonb(
        replace(
          payload ->> 'description',
          'via ' || chr(75) || 'afka',
          'through stream processing'
        )
      ),
      false
    )
WHERE id IN (
  'acc53a27-0eda-420a-8817-5cdada585b9b',
  'c3e538bd-ff57-422f-a1b7-1d6b14237041',
  'c4eb7b27-75cf-4f37-ac55-dc946f0afefc',
  'cc85ca80-62ec-46e5-bb17-48cfa338ba9e'
)
  AND jsonb_typeof(payload -> 'description') = 'string';

UPDATE audit_logs
SET payload = jsonb_set(
      payload,
      '{longDescription}',
      to_jsonb(
        replace(
          payload ->> 'longDescription',
          chr(75) || 'afka-based processing pipeline',
          'real-time stream-processing pipeline'
        )
      ),
      false
    )
WHERE id IN (
  'acc53a27-0eda-420a-8817-5cdada585b9b',
  'c3e538bd-ff57-422f-a1b7-1d6b14237041',
  'c4eb7b27-75cf-4f37-ac55-dc946f0afefc',
  'cc85ca80-62ec-46e5-bb17-48cfa338ba9e'
)
  AND jsonb_typeof(payload -> 'longDescription') = 'string';

UPDATE audit_logs
SET payload = jsonb_set(
      payload,
      '{tech}',
      (
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN lower(btrim(item)) = lower(chr(75) || 'afka')
                THEN to_jsonb('Stream processing'::text)
              ELSE to_jsonb(item)
            END
            ORDER BY ordinal
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements_text(payload -> 'tech')
          WITH ORDINALITY AS entry(item, ordinal)
      ),
      false
    )
WHERE id IN (
  'acc53a27-0eda-420a-8817-5cdada585b9b',
  'c3e538bd-ff57-422f-a1b7-1d6b14237041',
  'c4eb7b27-75cf-4f37-ac55-dc946f0afefc',
  'cc85ca80-62ec-46e5-bb17-48cfa338ba9e'
)
  AND jsonb_typeof(payload -> 'tech') = 'array';

DO $verify_obsolete_messaging_removed$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM projects
    WHERE position(
      lower(chr(75) || 'afka')
      IN lower(
        concat_ws(
          ' ',
          description,
          long_description,
          array_to_string(tech, ' ')
        )
      )
    ) > 0
  ) OR EXISTS (
    SELECT 1
    FROM xyz_bullets
    WHERE position(lower(chr(75) || 'afka') IN lower(bullet_text)) > 0
  ) OR EXISTS (
    SELECT 1
    FROM github_timeline_events
    WHERE position(
      lower(chr(75) || 'afka')
      IN lower(concat_ws(' ', title, description))
    ) > 0
  ) OR EXISTS (
    SELECT 1
    FROM audit_logs
    WHERE position(
      lower(chr(75) || 'afka')
      IN lower(COALESCE(payload::text, ''))
    ) > 0
  ) THEN
    RAISE EXCEPTION 'Obsolete messaging wording remains in Portfolio data';
  END IF;
END
$verify_obsolete_messaging_removed$;
