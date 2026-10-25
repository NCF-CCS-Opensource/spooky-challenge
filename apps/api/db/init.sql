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
  event_type text NOT NULL,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_solve_per_challenge ON learning_interactions (challenge_id)
  WHERE event_type = 'challenge_solved';
CREATE INDEX interactions_by_learner ON learning_interactions (learner_username, created_at, id);
