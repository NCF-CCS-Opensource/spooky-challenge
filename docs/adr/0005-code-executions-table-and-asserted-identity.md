# Runner metadata table and client-asserted identity

`code_executions` is a third table, required by issue #4 ("record execution metadata such as Python version, duration, exit status, and standardized error category"). It holds no source code, output, or learner identity, so it stays separate from the learner-facing `learning_interactions` log. It is created in `init.sql` only.

Learner identity is client-asserted: the browser generates the `visitId` and the pseudonym is unverified (see ADR 0002), so solve credit can be attributed to any pseudonym. This is accepted for a supervised booth event where an organizer hands out the candy. Server-issued visit IDs are the upgrade if the app is ever used unsupervised.

`runner_unavailable` is infrastructure failure, not a learner attempt: it is recorded in `code_executions` only and never logged as `submission_result`.
