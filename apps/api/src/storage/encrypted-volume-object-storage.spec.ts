import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptedVolumeObjectStorage } from './encrypted-volume-object-storage';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('EncryptedVolumeObjectStorage', () => {
  it('encrypts private bytes at rest and returns them intact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cfo-storage-')); roots.push(root);
    const key = Buffer.alloc(32, 7).toString('base64');
    const storage = new EncryptedVolumeObjectStorage(new ConfigService({ PRIVATE_STORAGE_ROOT: root, PRIVATE_STORAGE_ENCRYPTION_KEY: key }));
    const source = Buffer.from('private financial evidence');
    const stored = await storage.put('evidence', source);
    const raw = await readFile(join(root, stored.reference.slice('private://'.length)));
    expect(raw.includes(source)).toBe(false);
    expect(Buffer.from(await storage.get(stored.reference))).toEqual(source);
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
