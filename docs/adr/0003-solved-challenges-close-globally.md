# Close a challenge for everyone once it is solved

A challenge can be solved once in total: after any learner solves it, nobody can open or solve it again, while a given-up challenge stays open for new visits. This keeps one candy per challenge and is enforced by a partial unique index on solved events in `learning_interactions`, not by app checks alone. It also means each challenge yields at most one solving sequence, so the BKT dataset will be small.
