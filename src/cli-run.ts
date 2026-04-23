#!/usr/bin/env node
import { registerWorker } from 'iii-sdk';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { expand } from './paths.js';
import { loadTeam, runTeam } from './harness.js';

interface Args {
  team?: string;
  teamFile?: string;
  prompt?: string;
  cwd?: string;
  repo?: string;
  baseRef?: string;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--team':
        out.team = next();
        break;
      case '--team-file':
        out.teamFile = next();
        break;
      case '--prompt':
      case '-p':
        out.prompt = next();
        break;
      case '--cwd':
        out.cwd = next();
        break;
      case '--repo':
        out.repo = next();
        break;
      case '--base':
      case '--base-ref':
        out.baseRef = next();
        break;
      default:
        break;
    }
  }
  return out;
}

async function resolveTeam(args: Args) {
  if (args.teamFile) return loadTeam(expand(args.teamFile));
  if (args.team) {
    const guess = expand(`~/.config/iiiterm/teams/${args.team}.json`);
    try {
      return await loadTeam(guess);
    } catch {
      const members = args.team.split(',').map((s) => s.trim()).filter(Boolean);
      return {
        name: 'inline',
        members: members.map((agent) => ({ role: agent, agent: agent as never })),
      };
    }
  }
  throw new Error('must pass --team or --team-file');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parse(argv);
  if (!args.prompt) {
    process.stderr.write('iiiterm run: --prompt is required\n');
    process.exit(2);
  }

  const team = await resolveTeam(args);
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-run' });

  const cwd = resolve(args.cwd ?? process.cwd());
  const outcomes = await runTeam(iii, {
    team,
    prompt: args.prompt,
    cwd,
    repo: args.repo ?? cwd,
    baseRef: args.baseRef,
  });

  for (const o of outcomes) {
    const line = o.ok
      ? `[ok]    ${o.role}:${o.agent} → ${o.tmuxTarget}${o.worktreePath ? ` (${o.worktreePath})` : ''}`
      : `[fail]  ${o.role}:${o.agent} → ${o.reason}`;
    process.stdout.write(`${line}\n`);
  }

  const ok = outcomes.every((o) => o.ok);
  await iii.shutdown().catch(() => {});
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] run failed: ${String(err)}\n`);
  process.exit(1);
});
