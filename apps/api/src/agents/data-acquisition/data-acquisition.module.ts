import { Module } from '@nestjs/common';
import { DataAcquisitionService } from './data-acquisition.service';

@Module({
  providers: [DataAcquisitionService],
  exports: [DataAcquisitionService],
})
export class DataAcquisitionModule {}
