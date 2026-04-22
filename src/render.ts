import type { SessionState, SessionStatus } from './types.js';

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const INVERT = `${ESC}7m`;
const CLEAR = `${ESC}2J${ESC}H`;

const STATUS_STYLE: Record<SessionStatus, { glyph: string; color: string }> = {
  idle:        { glyph: '·', color: `${ESC}90m` },
  running:     { glyph: '●', color: `${ESC}33m` },
  waiting:     { glyph: '◌', color: `${ESC}36m` },
  done:        { glyph: '✓', color: `${ESC}32m` },
  error:       { glyph: '✗', color: `${ESC}31m` },
  interrupted: { glyph: '⚠', color: `${ESC}35m` },
};

const AGENT_LABEL = {
  'claude-code': 'claude',
  codex: 'codex ',
  opencode: 'opencd',
  amp: 'amp   ',
} as const;

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function ago(ts: number | undefined): string {
  if (!ts) return '—';
  const d = Math.max(0, Date.now() - ts);
  if (d < 60_000) return `${Math.floor(d / 1000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

function tokens(n?: number): string {
  if (!n) return '—';
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export interface RenderOpts {
  selectedIndex?: number;
  footer?: string;
}

export function renderPane(sessions: SessionState[], opts: RenderOpts = {}): string {
  const header =
    `${BOLD}iiiterm${RESET} ${DIM}· ${sessions.length} sessions · ${new Date().toLocaleTimeString()}${RESET}\n` +
    `${DIM}${pad('status', 3)} ${pad('agent', 6)} ${pad('title', 42)} ${pad('cwd', 28)} ${pad('ago', 5)} ${pad('in', 6)} ${pad('out', 6)}${RESET}\n` +
    `${DIM}${'─'.repeat(100)}${RESET}\n`;

  const rows = sessions
    .map((s, idx) => {
      const style = STATUS_STYLE[s.status];
      const status = `${style.color}${style.glyph}${RESET}`;
      const agent = AGENT_LABEL[s.agent] ?? s.agent;
      const title = s.title ?? s.lastMessage ?? '(no title)';
      const cwd = s.cwd ? s.cwd.replace(process.env.HOME ?? '', '~') : '—';
      const base = `${status}   ${pad(agent, 6)} ${pad(title, 42)} ${pad(cwd, 28)} ${pad(ago(s.lastTurnAt), 5)} ${pad(tokens(s.tokensIn), 6)} ${pad(tokens(s.tokensOut), 6)}`;
      return idx === opts.selectedIndex ? `${INVERT}${base}${RESET}` : base;
    })
    .join('\n');

  const body = rows || `${DIM}(no sessions yet — bridge workers still scanning)${RESET}`;

  const hints = `${DIM}↑/↓ or j/k select · x kill · r reattach · s resend · q quit (Enter reserved)${RESET}`;
  const footer = opts.footer
    ? `\n${DIM}${'─'.repeat(100)}${RESET}\n${opts.footer}\n${hints}\n`
    : `\n${DIM}${'─'.repeat(100)}${RESET}\n${hints}\n`;

  return CLEAR + header + body + footer;
}
