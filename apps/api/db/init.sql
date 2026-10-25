CREATE TABLE assessed_skills (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE
);

INSERT INTO assessed_skills (id, name) VALUES
  ('variables', 'Variables and values'),
  ('conditionals', 'Conditionals'),
  ('loops', 'Loops'),
  ('strings', 'Strings'),
  ('lists', 'Lists'),
  ('functions', 'Functions');

CREATE TABLE challenges (
  printed_number integer PRIMARY KEY CHECK (printed_number BETWEEN 1 AND 100),
  title text NOT NULL,
  description text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  assessed_skill_id text NOT NULL REFERENCES assessed_skills(id),
  starter_code text NOT NULL,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(examples) = 'array'),
  hints jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hints) = 'array'),
  hidden_tests jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hidden_tests) = 'array'),
  judge_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(judge_config) = 'object'),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version > 0)
);

CREATE TABLE learning_interactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id uuid NOT NULL,
  learner_username text NOT NULL,
  challenge_id integer NOT NULL REFERENCES challenges(printed_number),
  event_type text NOT NULL CHECK (event_type IN (
    'challenge_opened', 'code_run', 'submission_result',
    'hint_revealed', 'challenge_solved', 'gave_up'
  )),
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  content_version integer NOT NULL CHECK (content_version > 0),
  language text,
  assessed_skill_id text NOT NULL REFERENCES assessed_skills(id),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_correct boolean,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (event_type IN ('submission_result', 'challenge_solved') AND is_correct IS NOT NULL)
    OR (event_type NOT IN ('submission_result', 'challenge_solved') AND is_correct IS NULL)
  ),
  CHECK (event_type <> 'challenge_solved' OR is_correct),
  CHECK (
    (event_type = 'hint_revealed' AND metadata ? 'hint_index'
      AND jsonb_typeof(metadata->'hint_index') = 'number'
      AND metadata->>'hint_index' ~ '^[0-9]+$'
      AND metadata - 'hint_index' = '{}'::jsonb)
    OR (event_type <> 'hint_revealed' AND metadata = '{}'::jsonb)
  )
);

CREATE UNIQUE INDEX one_terminal_event_per_visit ON learning_interactions (visit_id)
  WHERE event_type IN ('challenge_solved', 'gave_up');
CREATE UNIQUE INDEX one_reveal_per_hint_per_visit
  ON learning_interactions (visit_id, (metadata->>'hint_index'))
  WHERE event_type = 'hint_revealed';
CREATE UNIQUE INDEX one_solve_per_challenge ON learning_interactions (challenge_id)
  WHERE event_type = 'challenge_solved';
CREATE INDEX interactions_by_learner ON learning_interactions (learner_username, created_at, id);

CREATE FUNCTION set_learning_interaction_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER learning_interactions_server_timestamp
  BEFORE INSERT ON learning_interactions
  FOR EACH ROW EXECUTE FUNCTION set_learning_interaction_timestamp();

CREATE FUNCTION reject_learning_interaction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'learning_interactions is append-only';
END;
$$;

CREATE TRIGGER learning_interactions_append_only
  BEFORE UPDATE OR DELETE ON learning_interactions
  FOR EACH ROW EXECUTE FUNCTION reject_learning_interaction_mutation();
