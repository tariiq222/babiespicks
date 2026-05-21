import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin/admin-api-key.guard';
import { AutomationRulesService } from './automation-rules.service';

@Controller('admin/automation-rules')
@UseGuards(AdminApiKeyGuard)
export class AutomationRulesController {
  constructor(private readonly service: AutomationRulesService) {}

  @Get()
  list() {
    return this.service.listRules();
  }

  @Post()
  create(@Body() body: {
    name: string;
    description?: string;
    trigger: string;
    condition: string;
    action: string;
    enabled?: boolean;
    autoAllowed?: boolean;
  }) {
    return this.service.createRule(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<{
    name: string;
    description: string;
    trigger: string;
    condition: string;
    action: string;
    enabled: boolean;
    autoAllowed: boolean;
  }>) {
    return this.service.updateRule(id, body);
  }

  @Post(':id/enable')
  enable(@Param('id') id: string) {
    return this.service.enableRule(id);
  }

  @Post(':id/disable')
  disable(@Param('id') id: string) {
    return this.service.disableRule(id);
  }
}
