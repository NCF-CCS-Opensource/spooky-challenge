DO $$
DECLARE
  existing_constraint text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'learning_interactions'::regclass
      AND conname = 'learning_interactions_metadata_contract'
  ) THEN
    SELECT conname INTO existing_constraint FROM pg_constraint
    WHERE conrelid = 'learning_interactions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%hint_revealed%'
      AND pg_get_constraintdef(oid) LIKE '%metadata%';
    IF existing_constraint IS NOT NULL THEN
      EXECUTE format('ALTER TABLE learning_interactions DROP CONSTRAINT %I', existing_constraint);
    END IF;
    ALTER TABLE learning_interactions ADD CONSTRAINT learning_interactions_metadata_contract CHECK (
      (event_type = 'hint_revealed' AND event_version = 1 AND metadata ? 'hint_index'
        AND jsonb_typeof(metadata->'hint_index') = 'number'
        AND metadata->>'hint_index' ~ '^[0-9]+$' AND metadata - 'hint_index' = '{}'::jsonb)
      OR (event_type = 'submission_result' AND event_version = 1 AND metadata = '{}'::jsonb)
      OR (event_type = 'submission_result' AND event_version = 2
        AND jsonb_typeof(metadata->'attempt_order') = 'number'
        AND jsonb_typeof(metadata->'elapsed_ms') = 'number'
        AND jsonb_typeof(metadata->'failed_test_count') = 'number'
        AND jsonb_typeof(metadata->'error_category') = 'string'
        AND metadata->>'attempt_order' ~ '^[1-9][0-9]*$'
        AND metadata->>'elapsed_ms' ~ '^[0-9]+$'
        AND metadata->>'failed_test_count' ~ '^[0-9]+$'
        AND metadata->>'error_category' IN ('accepted', 'wrong_answer', 'syntax_error', 'runtime_error', 'time_limit_exceeded', 'runner_unavailable', 'output_limit_exceeded')
        AND metadata - ARRAY['attempt_order', 'elapsed_ms', 'failed_test_count', 'error_category']::text[] = '{}'::jsonb)
      OR (event_type NOT IN ('hint_revealed', 'submission_result') AND metadata = '{}'::jsonb)
    );
  END IF;
END;
$$;
