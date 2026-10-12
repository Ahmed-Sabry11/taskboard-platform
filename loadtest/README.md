# Load Tests

**Status:** not started. This file describes the plan (Milestone 7).

k6 scenarios that generate the traffic used to demonstrate auto-scaling and to measure the acceptance criteria in [docs/architecture.md](../docs/architecture.md).

| Scenario | Shape | Demonstrates |
|---|---|---|
| `baseline.js` | Steady low load | Normal latency and error rate |
| `ramp.js` | Gradual rise to peak | Pod scale-out, then node scale-out |
| `spike.js` | Sudden jump | Behaviour before new pods are ready |

Results are written to `loadtest/results/`, which is git-ignored. Summaries and graphs chosen for the thesis are copied to `docs/evaluation/`.
