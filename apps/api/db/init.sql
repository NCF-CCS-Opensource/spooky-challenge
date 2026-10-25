CREATE TABLE challenges (
  id integer PRIMARY KEY CHECK (id BETWEEN 1 AND 100),
  title text NOT NULL,
  description text NOT NULL,
  difficulty text NOT NULL,
  topic text NOT NULL
);

CREATE TABLE learning_interactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id uuid NOT NULL,
  learner_username text NOT NULL,
  challenge_id integer NOT NULL REFERENCES challenges(id),
  event_type text NOT NULL,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_solve_per_challenge ON learning_interactions (challenge_id)
  WHERE event_type = 'challenge_solved';
CREATE INDEX interactions_by_learner ON learning_interactions (learner_username, created_at, id);
