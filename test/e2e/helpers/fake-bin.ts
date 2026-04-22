import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Write an executable shell script at `dir/name` that runs `body`. */
export async function writeFakeBin(
  dir: string,
  name: string,
  body: string,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, `#!/usr/bin/env bash\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

/**
 * Write a fake tmux binary that logs its argv and replies from a fixture
 * table keyed on the first arg (the tmux sub-command).
 */
export async function writeFakeTmux(
  dir: string,
  fixtures: Record<string, { stdout?: string; stderr?: string; exit?: number }>,
  logPath: string,
): Promise<string> {
  const cases = Object.entries(fixtures)
    .map(([cmd, f]) => {
      const stdout = f.stdout ?? '';
      const stderr = f.stderr ?? '';
      const exit = f.exit ?? 0;
      const out = stdout.replace(/'/g, "'\\''");
      const err = stderr.replace(/'/g, "'\\''");
      return `    ${cmd})\n      printf '%s' '${out}'\n      printf '%s' '${err}' >&2\n      exit ${exit}\n      ;;`;
    })
    .join('\n');
  const log = logPath.replace(/'/g, "'\\''");
  const script = `printf '%s\\n' "$*" >> '${log}'\ncase "$1" in\n${cases}\n    *) exit 0 ;;\nesac\n`;
  return writeFakeBin(dir, 'tmux', script);
}
