export const PRIVATE_OBJECT_STORAGE = Symbol('PRIVATE_OBJECT_STORAGE');

export type StoredPrivateObject = {
  reference: string;
  sizeBytes: number;
  sha256: string;
};

export interface PrivateObjectStorage {
  put(namespace: string, bytes: Uint8Array): Promise<StoredPrivateObject>;
  get(reference: string): Promise<Uint8Array>;
  delete(reference: string): Promise<void>;
}
