import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CoordinatorModule } from '../../agents/coordinator/coordinator.module';

@Module({
  imports: [CoordinatorModule],
  controllers: [AdminController],
})
export class AdminModule {}
