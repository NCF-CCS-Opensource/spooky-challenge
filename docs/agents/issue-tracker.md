# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `NCF-CCS-Opensource/spooky-challenge`. Use the `gh` CLI; infer the repository from the Git remote when running inside this checkout.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`. Put multiline bodies in a temporary file.
- Read: `gh issue view <number> --comments`; fetch labels with `--json number,title,body,labels,comments`.
- List: `gh issue list --state open --limit 1000 --json number,title,body,labels,comments`, using label and state filters as needed. Paginate if the limit is reached.
- Comment: `gh issue comment <number> --body-file <path>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..." --remove-label "..."`.
- Close: `gh issue close <number>` after posting the explanation.

When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the issue body, labels, and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. For an explicitly named item of uncertain type, try `gh pr view <number>` and fall back to `gh issue view <number>`. Use the corresponding `gh pr` commands for a PR.

## Wayfinding operations

- Map: one issue labeled `wayfinder:map`, holding Notes, Decisions-so-far, and Fog.
- Child: a GitHub sub-issue labeled `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`). If sub-issues are unavailable, link it from a task list in the map and add `Part of #<map>` to its body.
- Blocking: use native issue dependencies with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Fetch the database ID using `gh api repos/<owner>/<repo>/issues/<number> --jq .id`. If unavailable, add `Blocked by: #<number>` to the child body.
- Frontier: inspect the map's open children in map order; exclude assigned issues and those with open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers; for fallback links, check blocker states.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the result, close the child, then append a brief result and link to the map's Decisions-so-far.
