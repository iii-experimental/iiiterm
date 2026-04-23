export type AgentKind = 'claude-code' | 'codex' | 'opencode' | 'amp';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'done'
  | 'error'
  | 'interrupted';

export interface SessionState {
  id: string;
  agent: AgentKind;
  title?: string;
  cwd?: string;
  branch?: string;
  status: SessionStatus;
  lastMessage?: string;
  lastTurnAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  ports?: number[];
  updatedAt: number;
  unseen?: boolean;
  tmuxTarget?: string;
  pid?: number;
  host?: string;
  worktreePath?: string;
  role?: string;
  verifiers?: Record<string, VerifyOutcome>;
  threadId?: string;
  threadName?: string;
}

export interface VerifyOutcome {
  pass: boolean;
  reason?: string;
  elapsed_ms?: number;
  ts: number;
}

export interface BridgeConfig {
  engineUrl: string;
  stateScope: string;
  pollMs: number;
  claudeProjectsDir: string;
  codexSessionsDir: string;
  opencodeDbPath: string;
  ampThreadsDir: string;
}

export const DEFAULT_SCOPE = 'iiiterm:sessions';
