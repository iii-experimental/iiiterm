import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SessionState } from '../types.js';

interface ClaudeTranscriptLine {
  type?: string;
  role?: string;
  sessionId?: string;
  cwd?: string;
  message?: { content?: string | Array<{ type: string; text?: string }> };
  usage?: { input_tokens?: number; output_tokens?: number };
  timestamp?: string;
  isError?: boolean;
}

export interface ReadResult {
  session: SessionState;
  bytes: number;
}

const fileOffsets = new Map<string, number>();

function extractText(line: ClaudeTranscriptLine): string | undefined {
  const c = line.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ')
      .trim();
  }
  return undefined;
}

function inferStatus(last: ClaudeTranscriptLine, ageMs: number): SessionState['status'] {
  if (last.isError) return 'error';
  if (last.role === 'user') return 'waiting';
  if (ageMs < 5_000) return 'running';
  return 'idle';
}

async function parseTranscript(
  filePath: string,
  projectSlug: string,
): Promise<SessionState | null> {
  const buf = await readFile(filePath, 'utf8');
  const lines = buf.split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  const parsed: ClaudeTranscriptLine[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {}
  }
  if (parsed.length === 0) return null;

  const last = parsed[parsed.length - 1];
  const firstWithSession = parsed.find((p) => p.sessionId);
  const id = firstWithSession?.sessionId ?? basename(filePath, '.jsonl');

  const cwd = parsed.find((p) => p.cwd)?.cwd;
  const tokensIn = parsed.reduce((n, p) => n + (p.usage?.input_tokens ?? 0), 0);
  const tokensOut = parsed.reduce((n, p) => n + (p.usage?.output_tokens ?? 0), 0);

  const lastTurnAt = last.timestamp ? new Date(last.timestamp).getTime() : Date.now();
  const ageMs = Date.now() - lastTurnAt;

  const lastMessage = extractText(last);
  const title = extractText(parsed.find((p) => p.role === 'user') ?? last);

  return {
    id,
    agent: 'claude-code',
    title: title?.slice(0, 80),
    cwd,
    status: inferStatus(last, ageMs),
    lastMessage: lastMessage?.slice(0, 200),
    lastTurnAt,
    tokensIn,
    tokensOut,
    updatedAt: Date.now(),
    branch: projectSlug,
  };
}

export async function scanClaudeProjects(
  rootDir: string,
): Promise<SessionState[]> {
  const out: SessionState[] = [];
  let projects: string[];
  try {
    projects = await readdir(rootDir);
  } catch {
    return out;
  }

  for (const proj of projects) {
    const projDir = join(rootDir, proj);
    let files: string[];
    try {
      files = await readdir(projDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const full = join(projDir, file);

      let mtimeMs: number;
      let size: number;
      try {
        const s = await stat(full);
        mtimeMs = s.mtimeMs;
        size = s.size;
      } catch {
        continue;
      }

      const prev = fileOffsets.get(full);
      if (prev === size) continue;
      fileOffsets.set(full, size);

      const session = await parseTranscript(full, proj);
      if (!session) continue;
      session.updatedAt = mtimeMs;
      out.push(session);
    }
  }

  return out;
}
