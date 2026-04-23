import { readFile } from 'node:fs/promises';
import type { ISdk } from 'iii-sdk';
import type { AgentKind } from './types.js';

export interface TeamMember {
  role: string;
  agent: AgentKind;
  depends_on?: string;
  prompt?: string;
}

export interface TeamConfig {
  name: string;
  members: TeamMember[];
  layout?: 'split-horizontal' | 'split-vertical' | 'new-window' | 'tiled';
  worktree?: { enabled?: boolean; repo?: string; baseRef?: string };
}

export async function loadTeam(path: string): Promise<TeamConfig> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as TeamConfig;
  if (!parsed.name || !Array.isArray(parsed.members)) {
    throw new Error(`team config at ${path} is missing name or members`);
  }
  return parsed;
}

export interface SpawnOutcome {
  role: string;
  agent: AgentKind;
  ok: boolean;
  reason?: string;
  id?: string;
  tmuxTarget?: string;
  worktreePath?: string;
  branch?: string;
}

export interface RunTeamInput {
  team: TeamConfig;
  prompt: string;
  cwd: string;
  repo?: string;
  baseRef?: string;
}

function renderPrompt(
  template: string | undefined,
  base: string,
  member: TeamMember,
): string {
  const raw = template ?? base;
  return raw
    .replace(/\{\{\s*prompt\s*\}\}/g, base)
    .replace(/\{\{\s*role\s*\}\}/g, member.role);
}

export async function runTeam(
  iii: ISdk,
  input: RunTeamInput,
): Promise<SpawnOutcome[]> {
  const { team, prompt, cwd, repo, baseRef } = input;
  const worktreeEnabled = team.worktree?.enabled ?? Boolean(team.worktree?.repo ?? repo);
  const worktreeRepo = team.worktree?.repo ?? repo;
  const resolvedBase = team.worktree?.baseRef ?? baseRef;

  const outcomes: SpawnOutcome[] = [];

  for (const member of team.members) {
    const outcome: SpawnOutcome = { role: member.role, agent: member.agent, ok: false };
    let workingDir = cwd;

    if (worktreeEnabled && worktreeRepo) {
      const branch = `iiiterm/${team.name}/${member.role}-${Date.now().toString(36)}`;
      const wt = (await iii.trigger({
        function_id: 'iiiterm::worktree::create',
        payload: { repo: worktreeRepo, branch, baseRef: resolvedBase, name: `${team.name}-${member.role}` },
      })) as { ok: boolean; path?: string; reason?: string };
      if (!wt.ok || !wt.path) {
        outcome.reason = `worktree create failed: ${wt.reason ?? 'unknown'}`;
        outcomes.push(outcome);
        continue;
      }
      outcome.worktreePath = wt.path;
      outcome.branch = branch;
      workingDir = wt.path;
    }

    const memberPrompt = renderPrompt(member.prompt, prompt, member);
    const spawn = (await iii.trigger({
      function_id: 'iiiterm::spawn::agent',
      payload: {
        agent: member.agent,
        prompt: memberPrompt,
        cwd: workingDir,
        role: member.role,
        layout: team.layout ?? 'split-horizontal',
        title: `${member.role}:${member.agent}`,
      },
    })) as { ok: boolean; id?: string; tmuxTarget?: string; reason?: string };

    outcome.ok = spawn.ok;
    outcome.id = spawn.id;
    outcome.tmuxTarget = spawn.tmuxTarget;
    outcome.reason = spawn.reason;
    outcomes.push(outcome);
  }

  return outcomes;
}
