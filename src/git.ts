import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileP('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(err),
      code: e.code ?? null,
    };
  }
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  detached?: boolean;
  locked?: boolean;
}

export async function listWorktrees(repo: string): Promise<WorktreeInfo[]> {
  const r = await git(repo, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  const out: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> = {};
  for (const line of r.stdout.split('\n')) {
    if (line === '') {
      if (cur.path && cur.head) out.push(cur as WorktreeInfo);
      cur = {};
      continue;
    }
    const [key, ...rest] = line.split(' ');
    const val = rest.join(' ');
    if (key === 'worktree') cur.path = val;
    else if (key === 'HEAD') cur.head = val;
    else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'detached') cur.detached = true;
    else if (key === 'locked') cur.locked = true;
  }
  if (cur.path && cur.head) out.push(cur as WorktreeInfo);
  return out;
}

export interface DiffFile {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X';
  additions: number;
  deletions: number;
}

export async function diffSummary(
  worktree: string,
  baseRef: string,
): Promise<{ files: DiffFile[]; additions: number; deletions: number }> {
  const r = await git(worktree, [
    'diff',
    '--numstat',
    `${baseRef}...HEAD`,
  ]);
  if (!r.ok) return { files: [], additions: 0, deletions: 0 };

  const rStatus = await git(worktree, ['diff', '--name-status', `${baseRef}...HEAD`]);
  const statusByPath = new Map<string, DiffFile['status']>();
  for (const line of rStatus.stdout.split('\n')) {
    if (!line) continue;
    const [st, path] = line.split('\t');
    if (path && st) statusByPath.set(path, st[0] as DiffFile['status']);
  }

  const files: DiffFile[] = [];
  let additions = 0;
  let deletions = 0;
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const [addRaw, delRaw, path] = line.split('\t');
    const add = Number(addRaw) || 0;
    const del = Number(delRaw) || 0;
    if (!path) continue;
    files.push({
      path,
      status: statusByPath.get(path) ?? 'M',
      additions: add,
      deletions: del,
    });
    additions += add;
    deletions += del;
  }
  return { files, additions, deletions };
}
