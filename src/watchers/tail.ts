import { open, readFile } from 'node:fs/promises';

export const TAIL_THRESHOLD = 1_000_000;
export const TAIL_CHUNK = 256 * 1024;

export interface TailReadResult {
  text: string;
  tailed: boolean;
}

export async function readWholeOrTail(
  filePath: string,
  size: number,
): Promise<TailReadResult> {
  if (size <= TAIL_THRESHOLD) {
    const text = await readFile(filePath, 'utf8');
    return { text, tailed: false };
  }
  const fh = await open(filePath, 'r');
  try {
    const offset = Math.max(0, size - TAIL_CHUNK);
    const buf = Buffer.alloc(TAIL_CHUNK);
    const { bytesRead } = await fh.read(buf, 0, TAIL_CHUNK, offset);
    let text = buf.subarray(0, bytesRead).toString('utf8');
    if (offset > 0) {
      const firstNewline = text.indexOf('\n');
      if (firstNewline !== -1) text = text.slice(firstNewline + 1);
    }
    return { text, tailed: true };
  } finally {
    await fh.close();
  }
}
