# Store learning interactions as a versioned append-only event log

`learning_interactions` stores one row for every challenge event. `visit_id` groups a learner's events for one challenge visit; it is intentionally not unique, and `learner_username` is the normalized pseudonym with no user table or authentication requirement. A visit ends at most once, and a challenge can be solved at most once, enforced by partial unique indexes.

`event_version` versions the event payload contract. Version 1 uses these event names and fields:

| Event | `is_correct` | `metadata` | `language` |
| --- | --- | --- | --- |
| `challenge_opened` | null | `{}` | null |
| `code_run` | null | `{}` | execution language when known |
| `submission_result` | true or false | `{}` | judged language |
| `hint_revealed` | null | `{"hint_index": <zero-based integer>}` | null |
| `challenge_solved` | true | `{}` | judged language |
| `gave_up` | null | `{}` | null |

`submission_result` event version 2 records `attempt_order`, `elapsed_ms`, `failed_test_count`, and `error_category` in metadata. New judged attempts use version 2; existing version 1 events remain valid. Output comparison converts CRLF to LF and ignores trailing whitespace.

`challenge_id`, `content_version`, `assessed_skill_id`, and `difficulty` capture the challenge context on every row. `created_at` is assigned by the database on insert. Update and delete operations are rejected so this log remains append-only. The schema does not retain source code, program output, secrets, or hidden test inputs or outputs.

Students should choose a pseudonym. Usernames are unverified, so duplicate or impersonated usernames may merge records; exports must omit raw usernames.
