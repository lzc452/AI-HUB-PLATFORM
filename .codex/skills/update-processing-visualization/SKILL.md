---
name: update-processing-visualization
description: Update AI Hub Platform's root processing_visualization.html process dashboard after completing or materially changing any project task. Use when work affects product design, UI design, development, testing, deployment, operations, decisions, issues, skipped work, timelines, or retrospectives.
---

# Update Processing Visualization

Keep `processing_visualization.html` current as the project memory for product design, UI design, development, testing, deployment, operations, and retrospective tracking.

## Workflow

1. Open `processing_visualization.html` at the repository root.
2. Locate the `seedData` object in the inline script.
3. Add or update one task for the completed work:
   - `phase`: one of `product`, `ui`, `dev`, `test`, or `ops`.
   - `status`: `已完成`, `进行中`, `有风险`, or `跳过`.
   - `progress`: concise factual outcome.
   - `problem`: blocker, defect, uncertainty, or empty string.
   - `solution`: fix, mitigation, decision, or empty string.
   - `skip`: deferred work, accepted risk, test gap, deployment gap, or empty string.
   - `start` and `end`: ISO dates when known.
4. Add a matching `events` entry when the task changes project history or provides useful replay context.
5. Adjust the matching phase `progress` and phase task bullets when the work materially changes phase status.
6. Keep records factual and short. Link to docs or files when that helps future review.

## Completion Rule

Before saying a project task is done, verify whether `processing_visualization.html` needs a new or updated entry. If it does, update the file in the same turn and mention the update in the final response.

## Phase Guide

- `product`: requirements, scope, roadmap, personas, acceptance criteria, product decisions.
- `ui`: screens, user flows, components, design states, accessibility, copy, interaction details.
- `dev`: app/API/worker/package implementation, migrations, contracts, architecture changes.
- `test`: unit, integration, e2e, typecheck, lint, boundaries, verification gaps.
- `ops`: Docker, CI/CD, deployment, config, observability, storage, runtime operations.
