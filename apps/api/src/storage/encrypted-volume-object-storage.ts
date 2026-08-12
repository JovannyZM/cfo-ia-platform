import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import type { PrivateObjectStorage, StoredPrivateObject } from './private-object-storage';

@Injectable()
export class EncryptedVolumeObjectStorage implements PrivateObjectStorage {
  private readonly root: string;
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('PRIVATE_STORAGE_ROOT') ?? './.private-storage');
    const encoded = config.get<string>('PRIVATE_STORAGE_ENCRYPTION_KEY');
    if (!encoded && process.env.NODE_ENV === 'production') throw new Error('PRIVATE_STORAGE_ENCRYPTION_KEY is required');
    this.key = encoded ? Buffer.from(encoded, 'base64') : createHash('sha256').update('cfo-ia-test-storage-key').digest();
    if (this.key.byteLength !== 32) throw new Error('PRIVATE_STORAGE_ENCRYPTION_KEY must decode to 32 bytes');
  }

  async put(namespace: string, bytes: Uint8Array): Promise<StoredPrivateObject> {
    const safeNamespace = namespace.replace(/[^a-z0-9_-]/giu, '_');
    const relative = join(safeNamespace, `${randomUUID()}.enc`);
    const target = this.resolveReference(`private://${relative.replace(/\\/gu, '/')}`);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
    return {
      reference: `private://${relative.replace(/\\/gu, '/')}`,
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async get(reference: string): Promise<Uint8Array> {
    const payload = await readFile(this.resolveReference(reference));
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }

  async delete(reference: string): Promise<void> {
    await unlink(this.resolveReference(reference)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private resolveReference(reference: string): string {
    if (!reference.startsWith('private://')) throw new Error('Invalid private storage reference');
    const relative = normalize(reference.slice('private://'.length));
    const target = resolve(this.root, relative);
    const fromRoot = relativePath(this.root, target);
    if (fromRoot.startsWith('..') || resolve(fromRoot) === fromRoot) throw new Error('Private storage path escaped its root');
    return target;
  }
}

function relativePath(root: string, target: string): string {
  return relative(root, target);
}
