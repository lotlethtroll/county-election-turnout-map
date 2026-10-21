// C-25: machine-readable and plain text validation evidence, including source audit.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Check evidence storage before changing public data. The final write can still
// fail (for example, a disk fills afterwards), so the caller handles that case
// separately from validation/publication failures.
export async function preflightReport(root) {
  const directory = path.join(root, 'build', 'reports');
  await fs.mkdir(directory, {recursive: true});
  const probe = path.join(directory, `.write-check-${randomUUID()}`);
  try {
    await fs.writeFile(probe, 'CETM report write preflight\n', {flag: 'wx'});
    await fs.unlink(probe);
  } finally {
    await fs.unlink(probe).catch(() => {});
  }
}

export async function writeReport(report, root, {quiet = false} = {}) {
  report.failed = report.checks.filter(c => !c.passed).length;
  report.passed = report.checks.filter(c => c.passed).length;
  const lines = [`CETM build: ${report.state}, ${report.builtAt}`, `Stage: ${report.stage}`,
    ...report.checks.map(c => `${c.passed ? 'PASS' : 'FAIL'} [${c.electionId ?? 'build'}] ${c.check} — ${c.county}: ${c.message}`),
    `${report.passed} passed; ${report.failed} failed. ${report.published ? 'Complete state data published locally.' : 'Build stopped. Previous published data kept.'}`];
  const directory = path.join(root, 'build', 'reports');
  await fs.mkdir(directory, {recursive: true});
  const filename = /^[a-z]{2}$/.test(report.state ?? '') ? report.state : 'invalid';
  await fs.writeFile(path.join(directory, `${filename}-latest.json`), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(directory, `${filename}-latest.txt`), lines.join('\n') + '\n');
  if (!quiet) console.log(lines.join('\n'));
  return report;
}
