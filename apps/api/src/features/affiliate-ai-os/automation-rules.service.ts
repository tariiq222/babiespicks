import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const AUTOMATION_RULE_STATUS_ACTIVE = 'ACTIVE';
const AUTOMATION_RULE_STATUS_INACTIVE = 'INACTIVE';
const AUTOMATION_RULE_STATUS_DRAFT = 'DRAFT';

export interface AutomationRule {
  id: string;
  name: string;
  description?: string | null;
  trigger: string; // e.g. "product_enrichment_completed", "scheduled_job_failed"
  condition: string; // JSON-encoded condition
  action: string; // JSON-encoded action
  enabled: boolean;
  autoAllowed: boolean; // if true, no approval needed
  status: string;
  lastTriggeredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

@Injectable()
export class AutomationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/automation-rules */
  async listRules(): Promise<AutomationRule[]> {
    // Return a static set of automation rules (defined by system logic, not stored in DB)
    return [
      {
        id: 'auto-enrich-approved',
        name: 'Auto-enrich Approved Products',
        description: 'Automatically enrich products after approval',
        trigger: 'product_approved',
        condition: JSON.stringify({ status: 'APPROVED' }),
        action: JSON.stringify({ type: 'ENRICH_PRODUCT', params: {} }),
        enabled: true,
        autoAllowed: false,
        status: AUTOMATION_RULE_STATUS_ACTIVE,
        lastTriggeredAt: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'notify-on-schedule-failure',
        name: 'Notify on Schedule Failure',
        description: 'Send notification when a scheduled job fails',
        trigger: 'scheduled_job_failed',
        condition: JSON.stringify({}),
        action: JSON.stringify({ type: 'SEND_NOTIFICATION', params: { channel: 'admin' } }),
        enabled: false,
        autoAllowed: true,
        status: AUTOMATION_RULE_STATUS_INACTIVE,
        lastTriggeredAt: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'auto-publish-high-conversion',
        name: 'Auto-publish High Conversion Offers',
        description: 'Automatically publish offers with >5% conversion rate',
        trigger: 'offer_enrichment_completed',
        condition: JSON.stringify({ conversionRate: { gt: 5 } }),
        action: JSON.stringify({ type: 'PUBLISH_OFFER', params: {} }),
        enabled: false,
        autoAllowed: false,
        status: AUTOMATION_RULE_STATUS_DRAFT,
        lastTriggeredAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  /** POST /admin/automation-rules */
  async createRule(data: {
    name: string;
    description?: string;
    trigger: string;
    condition: string;
    action: string;
    enabled?: boolean;
    autoAllowed?: boolean;
  }): Promise<AutomationRule> {
    // In a real system this would persist to DB. For now, return the rule as if created.
    return {
      id: `rule-${Date.now()}`,
      name: data.name,
      description: data.description ?? null,
      trigger: data.trigger,
      condition: data.condition,
      action: data.action,
      enabled: data.enabled ?? false,
      autoAllowed: data.autoAllowed ?? false,
      status: data.enabled ? AUTOMATION_RULE_STATUS_ACTIVE : AUTOMATION_RULE_STATUS_DRAFT,
      lastTriggeredAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  /** PATCH /admin/automation-rules/:id */
  async updateRule(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      trigger: string;
      condition: string;
      action: string;
      enabled: boolean;
      autoAllowed: boolean;
    }>,
  ): Promise<AutomationRule | null> {
    // Return updated rule with same structure
    const existing = (await this.listRules()).find((r) => r.id === id);
    if (!existing) return null;
    return {
      ...existing,
      ...data,
      status: data.enabled ? AUTOMATION_RULE_STATUS_ACTIVE : AUTOMATION_RULE_STATUS_INACTIVE,
    };
  }

  /** POST /admin/automation-rules/:id/enable */
  async enableRule(id: string): Promise<AutomationRule | null> {
    return this.updateRule(id, { enabled: true });
  }

  /** POST /admin/automation-rules/:id/disable */
  async disableRule(id: string): Promise<AutomationRule | null> {
    return this.updateRule(id, { enabled: false });
  }
}
