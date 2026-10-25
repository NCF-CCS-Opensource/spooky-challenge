"""Export a privacy-aware, versioned BKT training dataset from learning_interactions.

    docker compose exec -T postgres psql -U "$POSTGRES_USER" -At "$POSTGRES_DB" \\
      -c "SELECT row_to_json(i) FROM learning_interactions i ORDER BY id" > interactions.jsonl
    EXPORT_HMAC_KEY=<secret, 16+ chars, never commit> \\
      python3 apps/api/scripts/export_bkt.py interactions.jsonl --out export/

Writes bkt_rows.csv, visit_outcomes.csv, manifest.json, DATA_DICTIONARY.md and report.md.
Usernames are replaced by an HMAC-SHA256 keyed with EXPORT_HMAC_KEY; keep that key to
re-link future exports to the same learners. Source code and hidden tests are never in
learning_interactions, so they cannot appear here.
"""

import argparse
import csv
import hashlib
import hmac
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA_VERSION = 1  # bump when columns or label definitions change
MIN_LEARNERS_PER_SKILL = 20  # ponytail: rule-of-thumb floors, not a power analysis
MIN_REPEATERS_PER_SKILL = 10
EVAL_FOLDS = 5  # one learner fold in five is held out for evaluation
OUTCOMES = {"challenge_solved": "solved", "gave_up": "gave_up"}

BKT_COLUMNS = ["learner_id", "visit_id", "skill_id", "item_id", "opportunity_order", "correct", "split", "attempt_order"]
VISIT_COLUMNS = ["learner_id", "visit_id", "item_id", "skill_id", "difficulty", "content_version", "outcome", "split"]


def learner_id(key, username):
    return hmac.new(key.encode(), username.strip().casefold().encode(), hashlib.sha256).hexdigest()[:32]


def split_for(learner):
    return "eval" if int(learner[:8], 16) % EVAL_FOLDS == 0 else "fit"


def load(lines):
    events = [json.loads(line) for line in lines if line.strip()]
    events.sort(key=lambda e: (e["created_at"], e["id"]))
    return events


def build(events, key):
    """Return (bkt_rows, visit_rows, quality) from time-ordered events."""
    quality = {"duplicate_events": 0, "visits_with_multiple_skills": 0, "missing_attempt_order": 0, "missing_language": 0, "runner_unavailable_excluded": 0}
    seen = set()
    skills_by_visit = defaultdict(set)
    judged, visits = [], {}
    for e in events:
        skills_by_visit[e["visit_id"]].add(e["assessed_skill_id"])
        visit = visits.setdefault(e["visit_id"], {
            "learner_id": learner_id(key, e["learner_username"]), "visit_id": e["visit_id"],
            "item_id": e["challenge_id"], "skill_id": e["assessed_skill_id"], "difficulty": e["difficulty"],
            "content_version": e["content_version"], "outcome": "open",
        })
        if e["event_type"] in OUTCOMES:
            visit["outcome"] = OUTCOMES[e["event_type"]]
        if e["event_type"] != "submission_result":
            continue
        attempt = (e.get("metadata") or {}).get("attempt_order")  # absent on event_version 1
        if (e.get("metadata") or {}).get("error_category") == "runner_unavailable":
            quality["runner_unavailable_excluded"] += 1  # infrastructure failure says nothing about the skill
            continue
        quality["missing_attempt_order"] += attempt is None
        quality["missing_language"] += e.get("language") is None
        identity = (e["visit_id"], attempt) if attempt is not None else e["id"]
        if identity in seen:
            quality["duplicate_events"] += 1
            continue
        seen.add(identity)
        judged.append((visit, e, attempt))
    quality["visits_with_multiple_skills"] = sum(len(s) > 1 for s in skills_by_visit.values())

    order, bkt = Counter(), []
    for visit, e, attempt in judged:  # events are already in time order, so order is per learner and skill
        pair = (visit["learner_id"], visit["skill_id"])
        order[pair] += 1
        bkt.append({
            "learner_id": visit["learner_id"], "visit_id": visit["visit_id"], "skill_id": visit["skill_id"],
            "item_id": visit["item_id"], "opportunity_order": order[pair], "correct": int(e["is_correct"]),
            "split": split_for(visit["learner_id"]), "attempt_order": "" if attempt is None else attempt,
        })
    rows = [dict(v, split=split_for(v["learner_id"])) for v in visits.values()]
    return bkt, rows, quality


def report(bkt, visits, quality):
    lines = ["# BKT export report", "",
             f"- Learners: {len({v['learner_id'] for v in visits})}",
             f"- Visits: {len(visits)}", f"- Judged opportunities: {len(bkt)}",
             f"- Sequences (learner x skill): {len({(r['learner_id'], r['skill_id']) for r in bkt})}",
             f"- Visit outcomes: {dict(Counter(v['outcome'] for v in visits))}", "",
             "## Per skill", "",
             "| skill | learners | sequences | visits | opportunities | correct % | learners with repeats | BKT estimable |",
             "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    by_skill = defaultdict(list)
    for r in bkt:
        by_skill[r["skill_id"]].append(r)
    sparse = []
    for skill, rows in sorted(by_skill.items()):
        per_learner = Counter(r["learner_id"] for r in rows)
        repeaters = sum(n > 1 for n in per_learner.values())
        ok = len(per_learner) >= MIN_LEARNERS_PER_SKILL and repeaters >= MIN_REPEATERS_PER_SKILL
        if not ok:
            sparse.append(skill)
        lines.append(f"| {skill} | {len(per_learner)} | {len(per_learner)} | {len({r['visit_id'] for r in rows})} | {len(rows)} | "
                     f"{100 * sum(r['correct'] for r in rows) / len(rows):.0f} | {repeaters} | {'yes' if ok else 'NO: too sparse'} |")
    if sparse:
        lines += ["", f"**Too sparse for reliable BKT parameter estimation** (needs >= {MIN_LEARNERS_PER_SKILL} learners and "
                  f">= {MIN_REPEATERS_PER_SKILL} with repeated opportunities): {', '.join(sparse)}."]
    lines += ["", "## Quality checks", "",
              f"- Duplicate judged events dropped: {quality['duplicate_events']}",
              f"- Judged events missing attempt_order (event_version 1): {quality['missing_attempt_order']}",
              f"- Judged events missing language: {quality['missing_language']}",
              f"- Visits spanning more than one skill (must be 0): {quality['visits_with_multiple_skills']}",
              f"- Judged events excluded as runner_unavailable: {quality['runner_unavailable_excluded']}",
              f"- Split opportunities: {dict(Counter(r['split'] for r in bkt))}; learners: "
              f"{dict(Counter(s for _, s in {(r['learner_id'], r['split']) for r in bkt}))} (an empty `eval` fold means no held-out evaluation is possible)", "",
              "## Likely leakage", "",
              "- `visit_outcomes.csv` outcomes (solved/gave_up) are known only after a visit ends. Never use them, or counts "
              "derived from later rows, as features for a prediction made earlier in the visit.",
              "- `opportunity_order` counts across a learner's visits, so a row's own `correct` must not feed its own prediction; "
              "use only rows with a smaller `opportunity_order` as history.",
              "- A solved challenge is closed globally, so each challenge has at most one correct solving attempt; "
              "compare the correct % column against that when judging class balance.",
              "- Usernames are self-reported: collisions or impersonation merge learners; linkage across visits is best-effort."]
    return "\n".join(lines) + "\n"


DICTIONARY = f"""# Data dictionary (schema_version {SCHEMA_VERSION})

Source: `learning_interactions` (event_version 1 and 2; see docs/adr/0004). Raw usernames, source code, program output
and hidden tests are not exported.

## bkt_rows.csv: one row per judged `submission_result`
| column | meaning |
| --- | --- |
| learner_id | HMAC-SHA256(key, normalized username), first 32 hex chars; same learner => same id across visits |
| visit_id | challenge visit UUID |
| skill_id | the challenge's single assessed skill |
| item_id | challenge printed number |
| opportunity_order | 1-based order of this learner's judged attempts on this skill, across visits, by server time |
| correct | 1 if the judged attempt passed, else 0. Code runs, solve and give-up events are never rows |
| split | `fit` or `eval`, assigned per learner (1 fold in {EVAL_FOLDS} is `eval`); never split within a learner |
| attempt_order | in-visit attempt number from event_version 2; empty for version 1 |

For future-response evaluation, predict an `eval` learner's row N using only that learner's rows with smaller
`opportunity_order` as history; fit parameters on `fit` learners only.

## visit_outcomes.csv: one row per visit (a separate label, not a BKT response)
| column | meaning |
| --- | --- |
| outcome | `solved`, `gave_up` (learner or booth organizer ended it), or `open` (no terminal event yet) |
| difficulty, content_version | challenge context at the time of the visit |
| other columns | as above |

## Linkage caveat
Learner linkage is by self-reported username. Collisions or impersonation merge different people into one learner_id.
Judged attempts with error_category `runner_unavailable` are excluded (infrastructure, not skill evidence).

## Missing values
Empty string means missing. Only `attempt_order` can be empty. Rows are never imputed. Duplicate judged events
(same visit and attempt_order) keep the earliest.
"""


def write_csv(path, columns, rows):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, columns)
        writer.writeheader()
        writer.writerows(rows)


def export(lines, key, out):
    if len(key) < 16:
        raise SystemExit("EXPORT_HMAC_KEY must be set to a secret of at least 16 characters")
    events = load(lines)
    bkt, visits, quality = build(events, key)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    write_csv(out / "bkt_rows.csv", BKT_COLUMNS, bkt)
    write_csv(out / "visit_outcomes.csv", VISIT_COLUMNS, visits)
    (out / "DATA_DICTIONARY.md").write_text(DICTIONARY)
    (out / "report.md").write_text(report(bkt, visits, quality))
    content = sorted({(v["item_id"], v["content_version"]) for v in visits})
    (out / "manifest.json").write_text(json.dumps({
        "schema_version": SCHEMA_VERSION, "event_count": len(events),
        "content_versions": [{"challenge": c, "content_version": v} for c, v in content],
        "source_range": [events[0]["created_at"], events[-1]["created_at"]] if events else None,
        "id_derivation": "HMAC-SHA256(secret key, casefolded stripped username)[:32]",
    }, indent=2) + "\n")
    return bkt, visits, quality


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("jsonl", help="row_to_json dump of learning_interactions")
    parser.add_argument("--out", default="export")
    args = parser.parse_args()
    with open(args.jsonl) as f:
        export(f, os.environ.get("EXPORT_HMAC_KEY", ""), args.out)


if __name__ == "__main__":
    sys.exit(main())
