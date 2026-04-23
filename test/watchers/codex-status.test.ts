import { describe, expect, it } from 'vitest';
import { inferCodexStatus } from '../../src/watchers/codex.js';

describe('inferCodexStatus', () => {
  it('maps turn_aborted to interrupted', () => {
    expect(
      inferCodexStatus({ type: 'turn_aborted' }, [{ type: 'turn_aborted' }], 10),
    ).toBe('interrupted');
  });

  it('maps task_complete to done', () => {
    expect(
      inferCodexStatus(
        { role: 'assistant', type: 'task_complete' },
        [{ role: 'assistant', type: 'task_complete' }],
        10,
      ),
    ).toBe('done');
  });

  it('maps final_answer to done', () => {
    expect(
      inferCodexStatus(
        { role: 'assistant', type: 'final_answer' },
        [{ role: 'assistant', type: 'final_answer' }],
        10,
      ),
    ).toBe('done');
  });

  it('maps assistant commentary to running', () => {
    expect(
      inferCodexStatus(
        { role: 'assistant', type: 'commentary' },
        [{ role: 'assistant', type: 'commentary' }],
        10,
      ),
    ).toBe('running');
  });

  it('maps explicit user_message to waiting', () => {
    expect(
      inferCodexStatus(
        { type: 'user_message' },
        [{ type: 'user_message' }],
        100,
      ),
    ).toBe('waiting');
  });

  it('maps user role to waiting', () => {
    expect(
      inferCodexStatus(
        { role: 'user', content: 'hi' },
        [{ role: 'user', content: 'hi' }],
        100,
      ),
    ).toBe('waiting');
  });

  it('maps tool role to running', () => {
    expect(
      inferCodexStatus(
        { role: 'tool' },
        [{ role: 'tool' }],
        100,
      ),
    ).toBe('running');
  });

  it('falls back to idle when old and nothing recent', () => {
    expect(
      inferCodexStatus(
        { role: 'assistant', type: 'message' },
        [{ role: 'assistant', type: 'message' }],
        60_000,
      ),
    ).toBe('idle');
  });

  it('marks error type as error', () => {
    expect(
      inferCodexStatus(
        { type: 'error' },
        [{ type: 'error' }],
        10,
      ),
    ).toBe('error');
  });
});
