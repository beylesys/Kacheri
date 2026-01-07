/* src/utils/fs.ts
   Minimal FS helpers used across routes (Windows-safe) */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Atomically write a file by writing to a temporary sibling and renaming.
 * - Ensures parent directory exists.
 * - Uses a unique filename to avoid collisions.
 * - Converts string data to UTF-8 buffer.
 * - Falls back to copy+unlink on very rare EXDEV/EPERM rename failures.
 */
export async function writeFileAtomic(finalPath: string, data: Buffer | string): Promise<void> {
  const dir = path.dirname(finalPath);
  await ensureDir(dir);

  const tmp = path.join(dir, `.tmp-${crypto.randomUUID()}`);
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  await fs.writeFile(tmp, buf);
  try {
    await fs.rename(tmp, finalPath);
  } catch (err: any) {
    if (err?.code === 'EXDEV' || err?.code === 'EPERM') {
      await fs.copyFile(tmp, finalPath);
      await fs.unlink(tmp).catch(() => {});
    } else {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
