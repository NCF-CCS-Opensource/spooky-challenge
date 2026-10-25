import json
import tempfile
import unittest
from pathlib import Path

from export_bkt import export

KEY = "k" * 16
_id = [0]


def ev(visit, user, kind, correct=None, attempt=None, skill="loops", challenge=1, at=None):
    _id[0] += 1
    metadata = {"attempt_order": attempt, "elapsed_ms": 1, "failed_test_count": 0, "error_category": "accepted"} if attempt else {}
    return json.dumps({"id": _id[0], "visit_id": visit, "learner_username": user, "challenge_id": challenge,
                       "event_type": kind, "event_version": 2, "content_version": 1, "language": "python",
                       "assessed_skill_id": skill, "difficulty": "easy", "is_correct": correct,
                       "metadata": metadata, "created_at": at or f"2026-10-31T10:00:{_id[0]:02d}Z"})


class ExportTest(unittest.TestCase):
    def run_export(self, events):
        out = tempfile.mkdtemp()
        bkt, visits, quality = export(events, KEY, out)
        return bkt, visits, quality, Path(out)

    def test_judged_only_ordered_across_visits_with_distinct_outcome(self):
        bkt, visits, quality, out = self.run_export([
            ev("v1", "Zq7wx ", "challenge_opened"), ev("v1", "zq7wx", "code_run"),
            ev("v1", "zq7wx", "submission_result", False, 1), ev("v1", "zq7wx", "gave_up"),
            ev("v2", "zq7wx", "challenge_opened", challenge=2),
            ev("v2", "zq7wx", "submission_result", True, 1, challenge=2), ev("v2", "zq7wx", "challenge_solved", True, challenge=2),
        ])
        self.assertEqual([(r["opportunity_order"], r["correct"]) for r in bkt], [(1, 0), (2, 1)])
        self.assertEqual(len({r["learner_id"] for r in bkt}), 1)  # normalized username links visits
        self.assertEqual([v["outcome"] for v in visits], ["gave_up", "solved"])
        self.assertNotIn("outcome", bkt[0])
        text = "".join(p.read_text() for p in out.iterdir())
        self.assertNotIn("zq7wx", text.replace("annotation", "").lower().replace("manifest", ""))  # no raw username
        self.assertNotIn(KEY, text)

    def test_duplicates_dropped_and_split_is_per_learner(self):
        events = [ev("v1", "bo", "submission_result", False, 1), ev("v1", "bo", "submission_result", False, 1),
                  ev("v1", "bo", "submission_result", True, 2)]
        bkt, _, quality, _ = self.run_export(events)
        self.assertEqual((len(bkt), quality["duplicate_events"]), (2, 1))
        self.assertEqual(len({r["split"] for r in bkt}), 1)

    def test_weak_key_rejected(self):
        with self.assertRaises(SystemExit):
            export([], "short", tempfile.mkdtemp())


if __name__ == "__main__":
    unittest.main()
