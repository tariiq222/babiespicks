import { Module } from '@nestjs/common';
import { SEOAuditorService } from './seo-auditor.service';
import { SettingsModule } from '../../features/settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SEOAuditorService],
  exports: [SEOAuditorService],
})
export class SEOAuditorModule {}
