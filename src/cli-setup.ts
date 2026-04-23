#!/usr/bin/env node
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expand } from './paths.js';

interface SetupArgs {
  force: boolean;
  configDir: string;
  examplesDir: string;
}

function parseArgs(argv: string[]): SetupArgs {
  let force = false;
  let configDir = expand('~/.config/iiiterm');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force' || a === '-f') force = true;
    else if (a === '--config-dir') configDir = expand(argv[++i] ?? configDir);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const packaged = resolve(here, '..', 'examples');
  const fromSource = resolve(here, '..', '..', 'examples');
  const examplesDir = existsSync(packaged) ? packaged : fromSource;
  return { force, configDir, examplesDir };
}

async function copyTeams(args: SetupArgs): Promise<string[]> {
  const src = resolve(args.examplesDir, 'teams');
  const dst = resolve(args.configDir, 'teams');
  await mkdir(dst, { recursive: true });
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(src);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const s = join(src, name);
    const d = join(dst, name);
    if (!args.force && existsSync(d)) {
      out.push(`skip  ${d} (exists; use --force to overwrite)`);
      continue;
    }
    await copyFile(s, d);
    out.push(`wrote ${d}`);
  }
  return out;
}

async function writeClaudeSection(_args: SetupArgs): Promise<string> {
  const target = resolve(process.cwd(), 'CLAUDE.md');
  const block = `\n## iiiterm\n\n- Run \`iiiterm run --team verified-review --prompt "<task>"\` to kick off a verified multi-agent run. Each member gets its own tmux pane and git worktree.\n- Router rule gates: verify::tests_passed, verify::lint_clean, verify::types_ok, verify::build_ok, verify::diff_clean. Reference these in \`~/.config/iiiterm/router.json\`.\n- Teams live in \`~/.config/iiiterm/teams/*.json\`. Edit or add your own.\n`;
  if (existsSync(target)) {
    const existing = await import('node:fs/promises').then((fs) => fs.readFile(target, 'utf8'));
    if (existing.includes('## iiiterm')) return `skip  ${target} (## iiiterm section already present)`;
    await writeFile(target, existing + block);
    return `appended ${target}`;
  }
  await writeFile(target, `# Project notes\n${block}`);
  return `wrote ${target}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.configDir, { recursive: true });

  process.stdout.write(`iiiterm setup -> ${args.configDir}\n`);
  for (const line of await copyTeams(args)) process.stdout.write(`  ${line}\n`);
  process.stdout.write(`  ${await writeClaudeSection(args)}\n`);

  process.stdout.write('\nnext:\n');
  process.stdout.write('  iiiterm bridge:claude-code &\n');
  process.stdout.write('  iiiterm bridge:tmux &\n');
  process.stdout.write('  iiiterm router &\n');
  process.stdout.write('  iiiterm verify-tests &\n');
  process.stdout.write('  iiiterm spawner &\n');
  process.stdout.write('  iiiterm run --team verified-review --prompt "ship this"\n');
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] setup failed: ${String(err)}\n`);
  process.exit(1);
});
