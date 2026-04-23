import { describe, expect, it } from 'vitest';
import { decodeClaudeProjectSlug } from '../src/sessions/decode.js';

describe('decodeClaudeProjectSlug', () => {
  it('decodes a leading-dash absolute path slug', () => {
    expect(decodeClaudeProjectSlug('-Users-me-project')).toBe('/Users/me/project');
  });

  it('handles empty input', () => {
    expect(decodeClaudeProjectSlug('')).toBe('');
  });

  it('decodes a relative slug conservatively', () => {
    expect(decodeClaudeProjectSlug('tmp-work')).toBe('tmp/work');
  });
});
