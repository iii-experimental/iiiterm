import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, '..', '..', 'src', 'cli-setup.ts');
const tsxBin = resolve(here, '..', '..', 'node_modules', '.bin', 'tsx');

let configDir: string;
let originalCwd: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-setup-'));
  originalCwd = process.cwd();
  process.chdir(await mkdtemp(join(tmpdir(), 'iiiterm-e2e-setup-cwd-')));
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(configDir, { recursive: true, force: true });
});

describe('E2E iiiterm setup', () => {
  it('copies every default team into the config dir', async () => {
    await execFileP(tsxBin, [cliPath, '--config-dir', configDir]);
    const teams = await readdir(join(configDir, 'teams'));
    expect(teams.sort()).toContain('verified-review.json');
    expect(teams.sort()).toContain('plan-then-code.json');
    expect(teams.sort()).toContain('debug-with-verifier.json');
    expect(teams.sort()).toContain('review-cycle.json');
  });

  it('skips existing team files unless --force', async () => {
    await execFileP(tsxBin, [cliPath, '--config-dir', configDir]);
    const out1 = await execFileP(tsxBin, [cliPath, '--config-dir', configDir]);
    expect(out1.stdout).toMatch(/skip\s+.*verified-review.json.*exists/);

    const out2 = await execFileP(tsxBin, [cliPath, '--config-dir', configDir, '--force']);
    expect(out2.stdout).toMatch(/wrote\s+.*verified-review.json/);
  });

  it('appends the iiiterm block to an existing CLAUDE.md', async () => {
    await execFileP(tsxBin, [cliPath, '--config-dir', configDir]);
    const claudeText = await readFile(join(process.cwd(), 'CLAUDE.md'), 'utf8');
    expect(claudeText).toContain('## iiiterm');
    expect(claudeText).toContain('verify::tests_passed');
  });
});
