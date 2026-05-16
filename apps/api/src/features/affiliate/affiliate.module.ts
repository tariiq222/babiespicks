import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';

@Module({
  controllers: [AffiliateController],
})
export class AffiliateModule {}
