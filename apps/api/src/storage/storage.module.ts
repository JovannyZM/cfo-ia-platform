import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptedVolumeObjectStorage } from './encrypted-volume-object-storage';
import { PRIVATE_OBJECT_STORAGE } from './private-object-storage';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    EncryptedVolumeObjectStorage,
    { provide: PRIVATE_OBJECT_STORAGE, useExisting: EncryptedVolumeObjectStorage },
  ],
  exports: [PRIVATE_OBJECT_STORAGE],
})
export class StorageModule {}
