import { describe, expect, it } from 'vitest';
import { scanOpencodeDb } from '../../src/watchers/opencode.js';

describe('scanOpencodeDb', () => {
  it('returns [] when the database file is missing', async () => {
    expect(await scanOpencodeDb('/definitely/no.db')).toEqual([]);
  });
});
