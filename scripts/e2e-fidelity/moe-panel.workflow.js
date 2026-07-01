// scripts/e2e-fidelity/moe-panel.workflow.js
// Run via the Workflow tool:
//   Workflow({ scriptPath: 'scripts/e2e-fidelity/moe-panel.workflow.js', args: { diff: '<unified diff>' } })
// Returns { approve, safety_pass, others_passing, verdicts }. `approve` requires the safety lens to
// pass AND >=2 of the other three lenses to pass (mirrors the gate-(b) "two subagents concur" rule).
export const meta = {
  name: 'e2e-moe-panel',
  description: 'Mixture-of-experts adversarial review of an e2e-fidelity diff',
  phases: [{ title: 'Review' }],
};

const VERDICT = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['pass', 'notes'],
  additionalProperties: false,
};

const diff = (args && args.diff) || '(no diff provided)';

const LENSES = [
  [
    'assertion-skeptic',
    `You are an ASSERTION SKEPTIC reviewing an E2E test diff. For each new/changed spec, decide: would it still PASS if the underlying feature were broken? Audit any mutation evidence in the diff. Set pass=false if any assertion lacks teeth (url-only, body-length-only, swallowed with .catch(()=>false), or conditionally skipped). Default to pass=false when unsure.`,
  ],
  [
    'realism-ux',
    `You are a UX REALISM expert reviewing an E2E test diff. Decide whether it simulates a real user (realistic data, real navigation sequences, negative/edge cases) versus a robot clicking happy paths. Set pass=false if the simulation is unrealistic or shallow; note what real behavior is unmodeled.`,
  ],
  [
    'determinism-flake',
    `You are a DETERMINISM/FLAKE expert reviewing an E2E test diff. Find timing races, waitForTimeout used to gate state, shared-state collisions, order-dependence, or non-hermetic outbound calls. Set pass=false if any flake risk is present.`,
  ],
  [
    'safety-scope',
    `You are a SAFETY/SCOPE reviewer. Confirm the diff touches ONLY test files (e2e/**, tests/e2e/**, apps/web/e2e/**), .learned-experience/**, playwright.config.*, or the package.json scripts block. Set pass=false if it touches app/lib/components/db/migrations, instrumentation/middleware/next.config/vite.config, or implies any merge/deploy/push to main.`,
  ],
];

const verdicts = await parallel(
  LENSES.map(([lens, prompt]) => () =>
    agent(`${prompt}\n\nDIFF:\n${diff}`, { label: lens, phase: 'Review', schema: VERDICT }).then((v) => ({
      lens,
      ...v,
    }))
  )
);

const clean = verdicts.filter(Boolean);
const by = Object.fromEntries(clean.map((v) => [v.lens, v]));
const safety = by['safety-scope']?.pass === true;
const others = ['assertion-skeptic', 'realism-ux', 'determinism-flake'].filter((l) => by[l]?.pass).length;
const approve = safety && others >= 2;
return { approve, safety_pass: safety, others_passing: others, verdicts: clean };
