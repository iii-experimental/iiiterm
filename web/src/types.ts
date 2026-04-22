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
}
