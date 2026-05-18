import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';

@Controller('admin/settings')
@UseGuards(AdminApiKeyGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('agents')
  async getAgentConfigs() {
    const configs = await this.settingsService.getAllConfigs();
    const models = this.settingsService.getAvailableModels();
    return { configs, models };
  }

  @Patch('agents/:agentName')
  async updateAgentConfig(
    @Param('agentName') agentName: string,
    @Body()
    body: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      enabled?: boolean;
    },
  ) {
    return this.settingsService.updateConfig(agentName, body);
  }
}
