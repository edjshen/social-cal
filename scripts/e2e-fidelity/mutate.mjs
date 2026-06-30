// scripts/e2e-fidelity/mutate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function injectAbort(specSrc, glob) {
  const hook = `\n  test.beforeEach(async ({ page }) => { await page.route(${JSON.stringify(
    glob
  )}, (r) => r.abort()); });\n`;
  const d = specSrc.search(/test\.describe\([^]*?\)\s*=>\s*\{/);
  if (d === -1) {
    // no describe: inject after the import line
    const nl = specSrc.indexOf('\n');
    return specSrc.slice(0, nl + 1) + hook + specSrc.slice(nl + 1);
  }
  const brace = specSrc.indexOf('{', d) + 1;
  return specSrc.slice(0, brace) + hook + specSrc.slice(brace);
}

// Run a single spec with the flow's API aborted; returns { killed, error, output }.
// killed=true  → the spec correctly FAILED under mutation (good: the assertion has teeth).
// killed=false → it survived (soft — bad) OR was never collected (see `error`).
//
// The mutated copy MUST live inside the spec's own directory: Playwright treats a path argument
// outside its configured testDir as a regex filter that matches nothing → "No tests found" → exit 1,
// which would silently report killed=true without ever running the spec. Writing alongside the
// original keeps testDir membership + relative import resolution intact.
export function runMutated(specPath, glob, { configArg = '', timeout = 120_000 } = {}) {
  const src = fs.readFileSync(specPath, 'utf8');
  const tmp = path.join(path.dirname(specPath), `__mutated__${Date.now()}-${path.basename(specPath)}`);
  try {
    fs.writeFileSync(tmp, injectAbort(src, glob));
    const res = spawnSync(
      'npx',
      ['playwright', 'test', tmp, ...(configArg ? ['--config', configArg] : []), '--reporter=line'],
      { encoding: 'utf8', timeout }
    );
    const output = (res.stdout || '') + (res.stderr || '');
    // A "0 tests collected" result is NOT a kill — the spec never ran. Surface it explicitly.
    const noTestsFound = output.includes('No tests found');
    return {
      killed: res.status !== 0 && !noTestsFound,
      error: noTestsFound ? 'playwright_no_tests_collected' : res.error ? String(res.error) : null,
      output,
    };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
