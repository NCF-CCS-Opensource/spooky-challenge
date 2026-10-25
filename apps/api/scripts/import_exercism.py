"""Generate challenge seed SQL from the MIT-licensed Exercism Python track.

    python3 apps/api/scripts/import_exercism.py --start 1 --limit 40 > seed.sql
    docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < seed.sql

Exercism tests call functions; the judge compares stdin/stdout. Each test becomes
stdin like `leap_year(2000)` and expected output `repr(result)`, and a fixed driver
appended to the starter code bridges the two. Test files are parsed with `ast` and
`ast.literal_eval` only: nothing downloaded is ever executed.
"""

import argparse
import ast
import io
import json
import re
import sys
import tarfile
import urllib.request

DEFAULT_REF = "6105f6d9d3ef66ce3d5c8f529d2882af3d76b706"  # exercism/python main, 2026-10-25
EXAMPLE_COUNT = 2

DRIVER = '''

# ---- Don't change anything below this line. ----
# It reads one function call, like the example input, runs it, and prints the result.
import ast

call = ast.parse(input(), mode="eval").body
args = [ast.literal_eval(arg) for arg in call.args]
result = globals()[call.func.id](*args)
if isinstance(result, float) and result.is_integer():
    result = int(result)  # 6 / 2 gives 6.0; the answer 6 is still right
print(repr(result))
'''

# Exercism concept -> assessed_skills.id (apps/api/db/init.sql). Unlisted concepts have no skill.
SKILL_BY_CONCEPT = {
    "basics": "variables", "numbers": "variables",
    "bools": "conditionals", "conditionals": "conditionals", "comparisons": "conditionals",
    "loops": "loops", "iteration": "loops",
    "strings": "strings", "string-methods": "strings", "string-formatting": "strings",
    "lists": "lists", "list-methods": "lists", "tuples": "lists", "sequences": "lists",
    "function-arguments": "functions",
}
GENERIC_CONCEPTS = {"basics", "numbers"}


def fetch(ref):
    url = f"https://codeload.github.com/exercism/python/tar.gz/{ref}"
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar:
            path = member.name.split("/", 1)[-1]  # drop the "python-<sha>/" prefix
            if member.isfile() and (path in ("config.json", "LICENSE") or re.search(r"^exercises/.*\.(py|md|json)$", path)):
                files[path] = tar.extractfile(member).read().decode("utf-8")
    return files


class Unsupported(Exception):
    pass


class ExpectsError(Exception):
    pass


class PendingCall:
    def __init__(self, name, args):
        self.name, self.args = name, args


BUILTINS = {"zip": zip, "enumerate": enumerate, "list": list}


def value(node, scope, functions):
    """Evaluate literals, scope names, zip/enumerate/list, and record calls to the exercise's functions."""
    if isinstance(node, ast.Name):
        if node.id in scope:
            return scope[node.id]
        raise Unsupported(node.id)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        args = []
        for arg in node.args:
            if isinstance(arg, ast.Starred):
                args.extend(value(arg.value, scope, functions))
            else:
                args.append(value(arg, scope, functions))
        kwargs = {kw.arg: value(kw.value, scope, functions) for kw in node.keywords}
        if node.func.id in functions and not kwargs:
            return PendingCall(node.func.id, args)
        if node.func.id in BUILTINS and None not in kwargs:
            return list(BUILTINS[node.func.id](*args, **kwargs))
        raise Unsupported(node.func.id)
    if isinstance(node, (ast.List, ast.Tuple)):
        items = [value(item, scope, functions) for item in node.elts]
        return items if isinstance(node, ast.List) else tuple(items)
    try:
        return ast.literal_eval(node)
    except ValueError:
        raise Unsupported(ast.dump(node)) from None


def bind(target, item, scope):
    if isinstance(target, ast.Name):
        scope[target.id] = item
    elif isinstance(target, (ast.Tuple, ast.List)) and len(target.elts) == len(item):
        for sub, part in zip(target.elts, item):
            bind(sub, part, scope)
    else:
        raise Unsupported("assignment target")


def stable(expected):
    """repr() matches only when equality implies identical repr: no floats, dicts, or sets."""
    if isinstance(expected, (dict, set, frozenset, float, PendingCall)):
        return False
    if isinstance(expected, (list, tuple)):
        return all(stable(item) for item in expected)
    return True


VALUE_ASSERTS = {"assertEqual", "assertIs", "assertTrue", "assertFalse", "assertIsNone",
                 "assertCountEqual", "assertAlmostEqual", "assertIn", "assertNotEqual", "assertListEqual"}


def run(statements, scope, functions, cases):
    """Walk a test body, appending one case per assertion. Raises Unsupported on anything else."""
    for node in statements:
        if isinstance(node, ast.Assign):
            try:
                result = value(node.value, scope, functions)
            except Unsupported:
                continue  # e.g. error_message f-strings; an assert that needs it will fail later
            for target in node.targets:
                bind(target, result, scope)
        elif isinstance(node, ast.For):
            for item in value(node.iter, scope, functions):
                inner = dict(scope)
                bind(node.target, item, inner)
                run(node.body, inner, functions, cases)
        elif isinstance(node, ast.With):
            if any(isinstance(item.context_expr, ast.Call) and isinstance(item.context_expr.func, ast.Attribute)
                   and item.context_expr.func.attr == "assertRaises" for item in node.items):
                raise ExpectsError()
            run(node.body, scope, functions, cases)
        elif (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
              and isinstance(node.value.func, ast.Attribute) and node.value.func.attr in VALUE_ASSERTS):
            method, args = node.value.func.attr, node.value.args
            if method in ("assertEqual", "assertIs") and len(args) >= 2:
                actual, expected = value(args[0], scope, functions), value(args[1], scope, functions)
            elif method in ("assertTrue", "assertFalse") and args:
                actual, expected = value(args[0], scope, functions), method == "assertTrue"
            else:
                raise Unsupported(method)
            if isinstance(expected, PendingCall):
                actual, expected = expected, actual  # assertEqual(expected, func(x)) ordering
            if not isinstance(actual, PendingCall) or not stable(expected):
                raise Unsupported("assertion shape")
            stdin = f"{actual.name}({', '.join(repr(arg) for arg in actual.args)})"
            cases.append({"stdin": stdin, "expected_output": repr(expected)})


def convert_tests(source, functions):
    """Return stdin/expected cases, or None if any value assertion cannot be converted.

    assertRaises tests are dropped: the driver has no way to report an expected exception.
    """
    cases = []
    for test in ast.walk(ast.parse(source)):
        if isinstance(test, ast.FunctionDef) and test.name.startswith("test"):
            test_cases = []
            try:
                run(test.body, {}, functions, test_cases)
            except ExpectsError:
                continue
            except (Unsupported, TypeError, ValueError):
                return None
            cases += test_cases
    return cases


def imported_functions(source, module):
    names = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ImportFrom) and node.module == module:
            names.update(alias.name for alias in node.names)
    return names


def parse_hints(markdown):
    """One hint per bullet; markdown links become their text."""
    hints = []
    for line in markdown.splitlines():
        if re.match(r"^\[[^\]]+\]:\s", line) or line.startswith("#"):
            continue
        if re.match(r"^[-*]\s", line):
            hints.append(line[2:].strip())
        elif line.startswith(" ") and line.strip() and hints:
            hints[-1] += " " + line.strip()
    return [re.sub(r"\[([^\]]+)\](\[[^\]]*\]|\([^)]*\))", r"\1", hint) for hint in hints]


def skill_for(kind, exercise):
    if kind == "concept":
        concepts = exercise.get("concepts", [])
        return SKILL_BY_CONCEPT.get(concepts[0]) if concepts else None
    concepts = exercise.get("practices", []) + exercise.get("prerequisites", [])
    specific = [c for c in concepts if c in SKILL_BY_CONCEPT and c not in GENERIC_CONCEPTS]
    if specific:
        return SKILL_BY_CONCEPT[specific[0]]
    return "functions"


def build(files, ref):
    track = json.loads(files["config.json"])
    candidates = [("concept", e) for e in track["exercises"]["concept"] if e.get("status") not in ("wip", "deprecated")]
    candidates += [("practice", e) for e in track["exercises"]["practice"]
                   if e.get("status") != "deprecated" and e.get("difficulty", 99) <= 2]
    challenges, skipped = [], []
    for kind, exercise in candidates:
        base = f"exercises/{kind}/{exercise['slug']}"
        meta = json.loads(files[f"{base}/.meta/config.json"])
        skill = skill_for(kind, exercise)
        if skill is None:
            skipped.append((exercise["slug"], "concept has no assessed skill"))
            continue
        solution, test_file = meta["files"]["solution"][0], meta["files"]["test"][0]
        module = solution.removesuffix(".py")
        tests = convert_tests(files[f"{base}/{test_file}"], imported_functions(files[f"{base}/{test_file}"], module))
        if not tests:
            skipped.append((exercise["slug"], "tests use assertions the stdin/stdout judge cannot express"))
            continue
        docs = [files.get(f"{base}/.docs/{name}") for name in ("introduction.md", "instructions.md", "instructions.append.md")]
        challenges.append({
            "title": exercise["name"],
            "description": "\n\n".join(doc.strip() for doc in docs if doc),
            "difficulty": "easy",
            "assessed_skill_id": skill,
            "starter_code": files[f"{base}/{solution}"].rstrip() + "\n" + DRIVER,
            "examples": [{"input": t["stdin"], "output": t["expected_output"]} for t in tests[:EXAMPLE_COUNT]],
            "hints": parse_hints(files.get(f"{base}/.docs/hints.md", "")),
            "hidden_tests": tests,
            "judge_config": {"source": f"exercism/python@{ref}", "slug": exercise["slug"], "license": "MIT"},
        })
    return challenges, skipped


def sql_text(value):
    return "'" + value.replace("'", "''") + "'"


def to_sql(challenges, start, license_text, ref):
    lines = [f"-- Generated by apps/api/scripts/import_exercism.py from exercism/python@{ref}"]
    lines += ["-- " + line if line else "--" for line in license_text.strip().splitlines()]
    lines.append("BEGIN;")
    for number, c in enumerate(challenges, start):
        values = [str(number), sql_text(c["title"]), sql_text(c["description"]), sql_text(c["difficulty"]),
                  sql_text(c["assessed_skill_id"]), sql_text(c["starter_code"])]
        values += [sql_text(json.dumps(c[key])) + "::jsonb" for key in ("examples", "hints", "hidden_tests", "judge_config")]
        lines.append("INSERT INTO challenges (printed_number, title, description, difficulty, assessed_skill_id, "
                     "starter_code, examples, hints, hidden_tests, judge_config) VALUES (" + ", ".join(values) + ");")
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ref", default=DEFAULT_REF, help="exercism/python commit to import")
    parser.add_argument("--start", type=int, default=1, help="first printed number")
    parser.add_argument("--limit", type=int, default=100, help="maximum challenges to emit")
    args = parser.parse_args()
    files = fetch(args.ref)
    challenges, skipped = build(files, args.ref)
    challenges = challenges[:min(args.limit, 101 - args.start)]
    for slug, reason in skipped:
        print(f"skipped {slug}: {reason}", file=sys.stderr)
    for number, c in enumerate(challenges, args.start):
        print(f"{number:3} {c['judge_config']['slug']:32} {c['assessed_skill_id']:12} "
              f"{len(c['hidden_tests']):3} tests {len(c['hints']):2} hints", file=sys.stderr)
    sys.stdout.write(to_sql(challenges, args.start, files["LICENSE"], args.ref))


if __name__ == "__main__":
    main()
