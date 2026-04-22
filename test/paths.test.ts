import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { expand } from '../src/paths.js';

describe('expand', () => {
  it('expands a leading tilde to $HOME', () => {
    expect(expand('~/foo/bar')).toBe(resolve(homedir(), 'foo/bar'));
  });

  it('expands a bare tilde', () => {
    expect(expand('~')).toBe(resolve(homedir(), ''));
  });

  it('leaves absolute paths untouched aside from resolve', () => {
    expect(expand('/tmp/foo')).toBe(resolve('/tmp/foo'));
  });

  it('resolves relative paths against cwd', () => {
    expect(expand('foo')).toBe(resolve(process.cwd(), 'foo'));
  });
});
