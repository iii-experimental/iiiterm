import { afterEach, describe, expect, it } from 'vitest';
import { cronEveryPoll, loadConfig, MIN_POLL_MS } from '../src/config.js';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    delete process.env.IIITERM_ENGINE_URL;
    delete process.env.IIITERM_STATE_SCOPE;
    delete process.env.IIITERM_POLL_MS;
    const cfg = loadConfig();
    expect(cfg.engineUrl).toBe('ws://127.0.0.1:49134');
    expect(cfg.stateScope).toBe('iiiterm:sessions');
    expect(cfg.pollMs).toBe(MIN_POLL_MS);
  });

  it('clamps pollMs below the minimum', () => {
    process.env.IIITERM_POLL_MS = '100';
    expect(loadConfig().pollMs).toBe(MIN_POLL_MS);
  });

  it('clamps non-numeric pollMs to the minimum', () => {
    process.env.IIITERM_POLL_MS = 'banana';
    expect(loadConfig().pollMs).toBe(MIN_POLL_MS);
  });

  it('accepts a pollMs at or above the minimum', () => {
    process.env.IIITERM_POLL_MS = '5000';
    expect(loadConfig().pollMs).toBe(5000);
  });

  it('reads the configured engine URL', () => {
    process.env.IIITERM_ENGINE_URL = 'ws://example:49134';
    expect(loadConfig().engineUrl).toBe('ws://example:49134');
  });
});

describe('cronEveryPoll', () => {
  it('never emits a zero interval', () => {
    expect(cronEveryPoll(0)).toBe('*/1 * * * * *');
    expect(cronEveryPoll(500)).toBe('*/1 * * * * *');
  });

  it('scales with pollMs', () => {
    expect(cronEveryPoll(2000)).toBe('*/2 * * * * *');
    expect(cronEveryPoll(10_000)).toBe('*/10 * * * * *');
  });
});
