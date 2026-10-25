# Spooky Challenge

This context describes the one-day programming challenge event and the interaction data it collects.

## Language

**Learner username**:
A student-chosen pseudonym used to associate that student's challenge visits. It is not an authenticated account or proof of identity.
_Avoid_: Real name, login

**Challenge visit**:
One learner's work on one numbered challenge, beginning after the learner submits their username and ending when they solve the challenge or give up.
_Avoid_: Anonymous session, event session

**Attempt**:
A student's judged solution submission during a challenge visit. A visit can contain any number of attempts.
_Avoid_: Run (which can mean executing code without judging it)

**Give up**:
Ending an unsolved challenge visit using the visible End challenge control, either by the learner or by the booth organizer when the learner leaves the computer. A given-up challenge can be opened again as a new visit.
_Avoid_: Timeout, abandonment

**Solved challenge**:
A challenge that any learner has solved. It is closed for everyone: it cannot be opened or solved again, so it awards candy at most once.
_Avoid_: Completed visit

**Booth computer**:
The single computer students use at the event, staffed by an organizer. Only one challenge visit is active on it at a time.

**Interaction record**:
One event about a challenge visit, such as opening the challenge, a judged attempt, solving it, or giving up. Multiple records can share one visit identifier and learner username.
_Avoid_: One row per session
