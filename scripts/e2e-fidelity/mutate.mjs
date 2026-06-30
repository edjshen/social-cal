// scripts/e2e-fidelity/mutate.mjs
import fs from 'node:fs';
import os from 'node:os';
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

// Run a single spec with the flow's API aborted; returns { killed } — killed=true means the spec
// correctly FAILED under mutation (good). killed=false means it survived (soft — bad).
export function runMutated(specPath, glob, { configArg = '' } = {}) {
  const src = fs.readFileSync(specPath, 'utf8');
  const tmp = path.join(os.tmpdir(), `mutated-${Date.now()}-${path.basename(specPath)}`);
  fs.writeFileSync(tmp, injectAbort(src, glob));
  const res = spawnSync(
    'npx',
    ['playwright', 'test', tmp, ...(configArg ? ['--config', configArg] : []), '--reporter=line'],
    { encoding: 'utf8' }
  );
  fs.rmSync(tmp, { force: true });
  return { killed: res.status !== 0, output: (res.stdout || '') + (res.stderr || '') };
}
