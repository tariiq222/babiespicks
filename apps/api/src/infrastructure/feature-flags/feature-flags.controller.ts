import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
} from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

class SetFlagDto {
  key!: string;
  enabled!: boolean;
  description?: string;
  metadata?: Record<string, unknown>;
}

@Controller('admin/flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  async getAllFlags() {
    return this.featureFlagsService.getAllFlags();
  }

  @Get(':key')
  async getFlag(@Param('key') key: string) {
    const flag = await this.featureFlagsService.getFlag(key);
    if (!flag) {
      return { exists: false, enabled: false };
    }
    return flag;
  }

  @Post()
  @HttpCode(200)
  async setFlag(@Body() body: SetFlagDto) {
    const flag = await this.featureFlagsService.setFlag(
      body.key,
      body.enabled,
      body.description,
      body.metadata,
    );
    return flag;
  }

  @Delete(':key')
  async deleteFlag(@Param('key') key: string) {
    await this.featureFlagsService.deleteFlag(key);
    return { success: true, message: `Feature flag "${key}" deleted` };
  }
}
