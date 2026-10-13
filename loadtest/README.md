# Load Tests

k6 scenarios that generate the traffic used to demonstrate auto-scaling and to measure the acceptance criteria.

| File | Purpose |
|---|---|
| `taskboard.js` | The test. One script, three load shapes chosen with `SCENARIO`: `baseline`, `ramp`, `spike`. |
| `results/` | Output of each run: k6's summary and a CSV of replica counts over time. Git-ignored. |

Run it through the wrapper, which also records how the autoscaler responds:

```powershell
.\scripts\scaling-test.ps1 -Scenario ramp
```

k6 runs in a container, so only Docker is needed. Details and measured results are in [docs/autoscaling.md](../docs/autoscaling.md).

The thresholds in the script are the project's acceptance criteria: under 1% failed requests, 95th percentile under 500 ms, and no lost writes. k6 exits with an error if any is missed.
