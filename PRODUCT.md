# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (TypeScript) frontend, NestJS (TypeScript) backend, PostgreSQL, Docker Compose, and a self-hosted Piston code runner reachable only by the backend (issue #1). Python 3 is the only supported programming language.

## Users

- **Students:** beginner college students, mostly first-years with little programming experience, playing one at a time at a Halloween event booth. Their job: open the challenge on the paper slip they drew, solve it, and get candy.
- **Booth organizer:** a student volunteer staffing the booth computer. They help students get started, end visits when a student walks away, and hand out candy when the success screen shows.
- **Researcher:** uses the exported interaction data after the event to fit Bayesian Knowledge Tracing (BKT) models of skill learning.

## Product Purpose

Treat or Code is a one-day Halloween programming challenge. It exists to do two things with equal weight: give beginners a fun, low-pressure first taste of solving code challenges, and collect clean, privacy-aware interaction data for BKT research. Success means students leave having solved something and wanting more, and the dataset is complete, ordered, and free of direct identifiers. Neither goal may be sacrificed for the other; trade-offs are decided case by case.

## Positioning

A physical-digital game: students draw a numbered paper slip, type its number, and earn real candy handed over by a person. Each of the 100 challenges can be solved only once in total, so the board visibly empties as the event goes on. No accounts, no timer, no leaderboard.

## Operating Context

- One booth computer in a desktop browser, one student at a time, staffed by an organizer. Internet may be unreliable, so fonts and assets are self-hosted.
- Flow: draw slip → enter number → enter pseudonym username → read problem → Run code / Check solution with unlimited attempts → solve (candy) or End challenge.
- A given-up challenge goes back on the board; a solved challenge is closed for everyone.
- Domain terms (learner username, challenge visit, attempt, give up, solved challenge, booth computer) are defined in `CONTEXT.md`; decisions are recorded in `docs/adr/`.

## Capabilities and Constraints

- Usernames are self-chosen, unverified pseudonyms that link a learner's visits; they are never listed or ranked, and exports replace them with keyed hashes (ADR 0002).
- The database holds `challenges`, `learning_interactions` (an append-only event log) and `code_executions` (runner metadata only: version, duration, exit status, error category; see ADR 0005). Source code and full program output are not retained.
- Hidden tests never reach the client; student code runs only in Piston.
- Undecided: the content and skill list for the 100 challenges (#2, human-authored).

## Brand Commitments

- Name: **Treat or Code**. Halloween theme.
- All student-facing copy is in English, written plainly for beginners: playful framing is fine, but instructions and errors must be unambiguous.

## Evidence on Hand

None yet. No challenge content, illustrations, photos, or past-event data exist. Do not invent challenge content, testimonials, participant counts, or results.

## Product Principles

1. **The slip is the interface.** A printed number must get a student to their challenge in seconds, with nothing to sign up for.
2. **Beginners are never blamed by the tool.** Every error explains what happened in plain English and what to try next; infrastructure failures must never look like the student's mistake.
3. **Fun and data carry equal weight.** Log everything the research needs, but never add a step, delay, or pressure to the student's experience to get it.
4. **Private by default.** Pseudonyms only, nothing shown publicly, nothing retained that the research does not need.
5. **The organizer is part of the system.** Design for a person standing beside the screen who ends abandoned visits and hands out candy.

## Accessibility & Inclusion

Keyboard-operable throughout, visible focus, status never conveyed by color alone, and reduced-motion respected (from `ui/DESIGN.md`). Copy is aimed at first-year programmers, so avoid jargon in instructions and error messages. A formal conformance target (such as WCAG 2.2 AA) has not been confirmed.
