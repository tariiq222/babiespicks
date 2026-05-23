import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DifyCronService {
  private readonly logger = new Logger(DifyCronService.name);

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runDailyDiscovery(): Promise<void> {
    const base = process.env.DIFY_BASE_URL;
    const key = process.env.DIFY_WORKFLOW_API_KEY;
    const workflowId = process.env.DIFY_DISCOVERY_WORKFLOW_ID;

    if (!base || !key || !workflowId) {
      this.logger.warn('Dify cron skipped: env vars not set');
      return;
    }

    try {
      const response = await fetch(`${base}/v1/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: { max_products: 10, triggered_by: 'cron' },
          user: 'nestjs-cron',
        }),
      });
      if (!response.ok) {
        this.logger.error(`Dify cron failed: HTTP ${response.status}`);
        return;
      }
      const data = (await response.json()) as { workflow_run_id: string };
      this.logger.log(`Dify discovery run started: ${data.workflow_run_id}`);
    } catch (err) {
      this.logger.error(`Dify cron threw: ${(err as Error).message}`);
    }
  }
}
