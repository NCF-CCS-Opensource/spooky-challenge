# Treat or Code — UI Design Specification

**Product:** Treat or Code  
**Design direction:** Haunted Terminal Arcade  
**Primary style:** Neo-brutalist arcade UI + dark minimal coding workspace  
**Supporting effect:** Restrained glassmorphism for overlays only  
**Purpose:** A Halloween programming challenge web app where students open the challenge number printed on their paper slip, enter a pseudonym username, solve the challenge with unlimited attempts and no time limit, and earn candy from the booth organizer.

**Event setup:** One booth computer (desktop browser), staffed by an organizer, one student at a time. Each challenge can be solved once in total; a given-up challenge goes back into the pool. Domain terms follow `CONTEXT.md`.

This file is the visual source of truth for implementation. Keep the product playful and spooky, but never sacrifice code readability, contrast, or task clarity for decoration.

## 1. Art direction

Treat or Code should feel like a tiny haunted arcade built in a computer lab: bold, collectible, playful, and slightly eerie. Use the visual language of arcade tickets, terminal prompts, candy wrappers, ghost stamps, and challenge-number slips.

### The mix

- **Neo-brutalism for structure:** crisp outlines, strong visual hierarchy, asymmetric offsets, mostly square corners, and occasional hard shadows. Use this to make challenge cards, number tiles, action buttons, and reward moments feel tactile.
- **Dark minimalism for the coding workspace:** let the problem statement, editor, and feedback dominate. Keep the editor surface calm and avoid decorating the code itself.
- **Glassmorphism only for floating layers:** the username modal, End challenge confirmation, or success overlay can have a translucent surface and a subtle backdrop blur. Do not use frosted glass for every card or for the editor.
- **Halloween decoration as seasoning:** use small ghost, bat, pumpkin, candy, cobweb, or moon details. Prefer a few high-quality details over a wall of emoji, glow, particles, or gradients.

Do not mix multiple loud styles in every component. Neo-brutalist structure is the primary design language; dark minimalism protects the main task; glass is a limited effect for overlays.

## 2. Color tokens

Define these as CSS variables and use semantic tokens throughout the app. Avoid scattered hard-coded color values.

| Token | Hex | Use |
|---|---|---|
| `--color-void` | `#100B18` | Main page background |
| `--color-surface` | `#1B1428` | Main panels and editor surrounding surface |
| `--color-surface-raised` | `#281B39` | Raised cards, menus, elevated panels |
| `--color-line` | `#514064` | Decorative borders, separators, hard shadows (below 3:1; never the only edge of a control) |
| `--color-line-strong` | `#8270A0` | Borders of inputs, secondary buttons, and tiles (≥3.6:1 on all surfaces) |
| `--color-text` | `#F8F1E7` | Main text; warm parchment white |
| `--color-text-muted` | `#C5B9D4` | Secondary text; never use for tiny low-contrast text |
| `--color-pumpkin` | `#FF853D` | Main action, candy rewards, selected challenge details |
| `--color-lilac` | `#B69CFF` | Secondary accent, focus rings, magical/spooky details |
| `--color-mint` | `#A8F0CF` | Success state and solved status |
| `--color-danger` | `#FF7185` | Errors, runner time-limit failures, End challenge confirmation |
| `--color-ink` | `#160E21` | Text on bright accents where contrast is adequate |

### Color rules

- Pumpkin orange is the primary action color. Use it for the main CTA (Check solution, Open challenge) and candy reward accents.
- Lilac is the secondary brand accent. Use it for focus, active navigation, code-editor framing, and low-intensity glow.
- Mint means success only; do not use it as a generic decoration.
- Danger red/pink is reserved for errors and the End challenge confirmation. There is no visit timer, so never use it for countdown urgency.
- Use flat surfaces first. Gradients may appear in a hero glow or reward effect, but never behind important code or paragraphs.
- Validate text and control contrast. Do not communicate success/failure using color alone; pair colors with icons and labels.

## 3. Typography

Use at most two UI font families plus the editor's monospace font.

- **Headings and challenge titles:** `Bricolage Grotesque`, fallback `system-ui, sans-serif`. Use strong weights and compact line-height; reserve the largest size for the homepage title and success moment.
- **Body and controls:** `DM Sans`, fallback `system-ui, sans-serif`. Use readable sentence case and short instructions.
- **Code and machine-like labels:** `IBM Plex Mono`, fallback `ui-monospace, SFMono-Regular, monospace`. Use for code, challenge numbers, keyboard labels, and small technical metadata.
- Load all three with `next/font` so they are self-hosted; the booth may have unreliable internet.

Suggested type scale (booth desktop):

| Role | Size |
|---|---:|
| Hero | 64–80 px |
| Page title | 40–48 px |
| Section heading | 24–30 px |
| Challenge title | 20–24 px |
| Body | 16–18 px |
| Metadata | 12–14 px |
| Code | 14–16 px |

Never use decorative display fonts for problem statements, buttons, error messages, or code. Do not use tiny uppercase labels everywhere.

## 4. Shape, borders, spacing, and depth

- Use a 4 px base spacing unit and a consistent scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Standard controls should be at least 44 px tall; primary actions should be comfortable to click quickly during an event.
- Large panels: 12 px radius. Buttons and tags: 8 px radius. Challenge-number tiles can be 8 px or square. Avoid rounding every element into a pill.
- Main card border: 1–2 px solid `--color-line`. Interactive controls use `--color-line-strong`. Selected or featured elements can use a 2 px accent border.
- Neo-brutalist hard shadow: `4px 4px 0 var(--color-line)` on selected challenge tiles or primary CTA. Use it selectively, not on every surface.
- Use a consistent elevation scale: flat page background, bordered panel, raised surface, then overlay. Do not mix arbitrary soft shadows and hard offset shadows.
- Keep reading lines around 60–75 characters for long problem descriptions.

Suggested CSS tokens:

```css
:root {
  color-scheme: dark;
  --color-void: #100B18;
  --color-surface: #1B1428;
  --color-surface-raised: #281B39;
  --color-line: #514064;
  --color-line-strong: #8270A0;
  --color-text: #F8F1E7;
  --color-text-muted: #C5B9D4;
  --color-pumpkin: #FF853D;
  --color-lilac: #B69CFF;
  --color-mint: #A8F0CF;
  --color-danger: #FF7185;
  --color-ink: #160E21;
  --radius-panel: 12px;
  --radius-control: 8px;
  --shadow-brutal: 4px 4px 0 var(--color-line);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

## 5. Screens and layout

### A. Home / challenge board

**Primary job:** Let a student match the number on their paper slip to its challenge as fast as possible.

- Hero title: **“Trick your brain. Treat yourself.”**
- Supporting copy: “Enter the number on your paper. Solve the challenge. Claim your candy.”
- The primary control is a large slip-number field (label “Your slip number”, 1–100, `inputmode="numeric"`, Enter opens) beside a pumpkin **Open challenge** button. Typing the number beats scanning 100 tiles.
- Below it, the challenge board: all 100 numbered tiles in a 10 × 10 grid, each linking to `/challenge/N`. The number is the largest thing on the tile; difficulty and topic are small metadata. Do not reveal hidden tests or solutions.
- Tiles have two states only: `READY` and `SOLVED`. A solved challenge is closed for everyone, so its tile gets a mint ghost-stamp “SOLVED” (icon plus label) and is not a link. A given-up challenge is simply `READY` again.
- There is no `IN PROGRESS` tile state: only one visit can be active on the booth computer, and it appears as a **Resume No. 14** banner above the board.
- There is no leaderboard. Usernames never appear on the board or any list; the only place a username shows is the active visit's own workspace header.
- Use a subtle moonlit gradient or static grain texture as backdrop. Do not make background animation compete with the board.

Wireframe:

```text
┌───────────────────────────────────────────────────────────┐
│ Treat or Code                                             │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ No. 14 is still open.                  [Resume No. 14] │ │  ← only when a visit is active
│ └───────────────────────────────────────────────────────┘ │
│ TRICK YOUR BRAIN.                                         │
│ TREAT YOURSELF.                 [small ghost / candy art] │
│ Enter the number on your paper. Solve it. Get candy.      │
│                                                           │
│ Your slip number  [ 14  ]  [Open challenge]               │
│                                                           │
│ THE BOARD                                   63 of 100 left │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐│
│ │ 01 ││ 02 ││ 03 ││ 04 ││ 05 ││ 06 ││ 07 ││ 08 ││ 09 ││ 10 ││
│ │EASY││SOLV││MED ││HARD││EASY││SOLV││MED ││EASY││HARD││MED ││
│ └────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘│
│ … 10 rows …                                               │
└───────────────────────────────────────────────────────────┘
```

### B. Opening a challenge and the username modal

**Primary job:** Start a challenge visit under the student's pseudonym.

- `/challenge/N` shows the challenge title, problem preview, and a Python label, with the username modal (glass) on top. The visit starts, and `challenge_opened` is logged, when the username is submitted. There is no timer to start.
- Field label “Username”; helper text: “Use a nickname, not your real name or email. Use the same one for every challenge. Capital letters don't matter.”
- Inline validation: 1–40 characters, no control characters. Submit with Enter.
- Shared computer: set `autocomplete="off"`, never prefill the previous student's username, and never show a list of recent names.
- **Cancel** returns to the board without starting a visit.
- **Unknown or disabled number:** a friendly not-found screen (“There's no challenge No. 101. Check your slip.”) with a way back to the board.
- **Already solved:** no modal. Show “No. 14 has already been solved. Draw another slip.” with a way back to the board. Never show who solved it.
- **Another visit is active:** opening a different challenge shows a confirmation instead of the modal: “No. 14 is still open. End it to start No. 22?” with **Back to No. 14** and **End No. 14 and continue**.

### C. Challenge workspace

**Primary job:** Help the student understand the problem, write code, run it, and check it.

```text
┌──────────────────────────────────────────────────────────────┐
│ NO. 04: THE CURSED ARRAY            codeghoul  [End challenge]│
├──────────────────────┬───────────────────────────────────────┤
│ THE CHALLENGE        │ EDITOR                     Python 3   │
│                      │ ┌───────────────────────────────────┐ │
│ Story / description  │ │  1  def solve(data):               │ │
│ Input / output       │ │  2      # break the curse          │ │
│ Constraints          │ │  3      pass                       │ │
│ Examples             │ └───────────────────────────────────┘ │
│                      │ Custom input (optional)               │
│ HINTS (optional)     │ [Run code]          [Check solution]  │
│ [Reveal hint]        │                                       │
├──────────────────────┴───────────────────────────────────────┤
│ RESULTS: Ready / Running… / Passed / 3 tests failed / …       │
└──────────────────────────────────────────────────────────────┘
```

- No back link while a visit is active. The only exits are solving and **End challenge**; a refresh resumes the same visit.
- Show the username small and muted in the header so the organizer can see whose visit is open.
- Use a calm, high-contrast editor surface, a familiar code font, line numbers, and clear focus indication.
- **Run code** runs the student's code on sample or custom input and shows its output; it never runs or reveals hidden tests. **Check solution** is the judged submission against hidden tests.
- Python 3 is the only language: show it as a static label (the pinned version), with no language selector. Starter code is Python.
- Disable **Check solution** and show a loading state while a check is in flight.
- Keep the results panel a fixed size so it does not jump the layout after each run.
- Results states: ready, running, passed, wrong answer (with the failed-test count and no hidden inputs or outputs), syntax error, runtime error, time limit exceeded, and runner unavailable. Wrong answers, syntax errors, and runtime errors are the student's to fix, so give a next step; runner unavailable says “This isn't your code. Ask the organizer.”
- Render Python error messages (tracebacks) as readable text, trimmed to the student's own code lines where possible. Treat code output as untrusted text; never render it as HTML.
- Hints are optional and revealed one at a time. Hint reveals are learning data: each one is logged as a `hint_revealed` interaction (#6).
- Attempts are unlimited while the visit is active; do not show an attempt limit or countdown.

### D. End challenge

- **End challenge** is a secondary button in the workspace header, used by the student to give up or by the organizer when a student walks away.
- It opens a confirmation (glass overlay, danger accent): “End this challenge? It goes back on the board and can be opened again.” with **Keep going** and **End challenge**.
- After ending, show a short “Challenge ended” state with a way back to the board. Never show the reward state.

### E. Solved / candy reward state

- Celebrate with one deliberate animation (a brief candy burst, ghost stamp, or ticket-stamp effect), then show a clear success heading such as **“Curse broken. Candy earned!”**
- Show the challenge number, elapsed time (from server timestamps), and “Show this screen to the organizer to get your candy.”
- Do not auto-redirect. The screen stays until someone presses **Back to the board**, so the organizer can see it before handing out candy. The board then shows the tile as `SOLVED`.
- Respect reduced-motion settings; the solve confirmation must be understandable without animation.

## 6. Component behavior and state styling

- **Primary button:** pumpkin fill, dark text, strong hover/focus state, pressed offset effect; show a disabled/loading state during submission.
- **Secondary button:** dark or transparent surface, `--color-line-strong` border, warm-white text.
- **Challenge tile:** prominent number, readable metadata, `--color-line-strong` border; `SOLVED` tiles carry the mint stamp, are not links, and expose their state in text, not color alone.
- **End challenge:** secondary button; the danger color appears only in its confirmation dialog.
- **Success:** mint accent plus explicit success icon and text.
- **Error:** readable error title, short explanation, and actionable next step. Distinguish wrong answer, syntax error, runtime error, time limit exceeded, and runner unavailable.
- **Forms:** persistent labels, visible focus rings, inline validation, Enter key support where safe.
- **Tooltips:** optional only; do not hide critical instructions in hover-only content.

Required UI states to design and test: board idle, board with an active-visit banner, unknown number, already solved, username entry and validation errors, end-current-visit confirmation, workspace ready, code running, judged incorrect, syntax error, runtime error, time limit exceeded, hint revealed, checking, solved, End challenge confirmation, challenge ended, runner unavailable, offline/network failure, and reduced motion.

## 7. Motion and spooky atmosphere

- Prefer CSS transitions and a few purposeful keyframes.
- Good candidates: a very subtle floating ghost in the hero, a quick hover lift on challenge tiles, a short candy burst on success, and a brief modal fade.
- Keep each transition around 120–240 ms for controls. Reward effects can be slightly longer but should not block interaction.
- Avoid continuous particle storms, heavy parallax, jump scares, flashing, or animation near the code editor.
- Read `prefers-reduced-motion` and disable nonessential motion. Ensure the app works with animations disabled.
- Do not require sound; if optional sound is ever added, it must be off by default and have visible controls.

## 8. Responsive design

The app runs on one booth computer in a desktop browser, so design for that screen rather than for phones.

- Two-column problem/editor workspace, with problem text on the left and editor on the right.
- Below about 1024 px wide (or at 200% browser zoom), stack the problem above the editor rather than squeezing either. Avoid horizontal page overflow.
- The 10 × 10 board must fit without scrolling sideways and keep each number large and clear.
- Verify at the booth display's actual resolution, plus 1366 × 768 and 1024 px wide. Mobile layouts are out of scope.

## 9. Accessibility and trust

- All interactive controls work with keyboard alone, with visible focus states.
- Use semantic headings, buttons, forms, and status regions. Announce run and check results through a polite live region.
- Never use color as the only signal of status.
- Keep body and editor text comfortably readable and check color contrast.
- Ensure decorative images/icons have empty alt text when decorative and descriptive alt text when informative.
- Respect reduced-motion preferences.
- Show the pseudonym notice in the username modal. Collect nothing beyond the username.
- Treat submitted code and program output as untrusted; keep code execution isolated in the backend runner and never execute it in the browser or API process.

## 10. Do / don't

### Do

- Make the number printed on the paper the fastest way to identify the matching challenge.
- Use bold outlines and hard shadows selectively to make the challenge picker feel tactile.
- Give the code workspace calm visual hierarchy and excellent contrast.
- Use warm parchment text, pumpkin accents, lilac highlights, and mint for success.
- Use meaningful challenge copy with a short spooky narrative, followed by precise technical requirements.
- Provide loading, empty, error, and success states—not only the happy path.

### Don't

- Do not make every surface glassy or blurred.
- Do not put glow effects behind code or long problem statements.
- Do not use low-contrast purple text on a dark purple surface.
- Do not use emoji as a substitute for a cohesive icon system.
- Do not create a generic SaaS dashboard with a Halloween sticker on top.
- Do not use scary decoration that makes the editor or result feedback harder to use.
- Do not add accounts, sign-up flows, a timer, or a leaderboard; the event uses a self-chosen pseudonym username that is never listed or ranked.

## 11. Agent implementation instructions

When implementing this design:

1. Inspect the existing repository, framework, component library, and tokens before changing code.
2. Treat this `DESIGN.md` as the source of truth for visual choices. Keep existing business logic and API contracts intact unless a separate requirement calls for a change.
3. Implement real working UI states and responsive behavior; do not deliver a static mockup.
4. Reuse the existing styling stack and avoid adding a new UI framework just for decoration.
5. Keep all color, spacing, radius, typography, border, and shadow decisions tokenized.
6. If the available agent supports skills, use a frontend-design skill for implementation and a design-review skill for final QA. The skill informs implementation; this file defines the Treat or Code aesthetic.
7. After implementation, inspect screenshots at desktop, tablet, and mobile widths. Fix overflow, unreadable contrast, clipped text, broken focus states, layout shifts, and console errors.

## 12. Research references and reusable UI skills

Use these as inspiration and guidance, not as assets to copy verbatim:

- Anthropic Frontend Design skill: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- UI/UX Pro Max skill: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Microsoft Frontend Design Review skill: https://github.com/microsoft/skills/blob/main/.github/skills/frontend-design-review/SKILL.md
- Halloween.dev programming challenges: https://dev.to/midudev/halloweendev-javascript-programming-challenges-3n0
- HexForge spooky coding game: https://devpost.com/software/hexforge

Use the references to inform the level of polish and the event theme, but build an original Treat or Code identity.
