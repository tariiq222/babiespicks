import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SafetyService } from './safety.service';
import { SanitizeInterceptor } from './sanitize.interceptor';

@Global()
@Module({
  providers: [
    SafetyService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SanitizeInterceptor,
    },
  ],
  exports: [SafetyService],
})
export class SafetyModule {}
