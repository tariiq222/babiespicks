import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ScheduledJobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/scheduled-jobs */
  async list(params: { status?: string; limit?: number; offset?: number }) {
    const { status, limit = 50, offset = 0 } = params;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.scheduledJob.findMany({
        where,
        orderBy: { nextRunAt: 'asc' },
        take: limit,
        skip: offset,
        include: { _count: { select: { runs: true } } },
      }),
      this.prisma.scheduledJob.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /** GET /admin/scheduled-jobs/:id */
  async get(id: string) {
    const item = await this.prisma.scheduledJob.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!item) throw new NotFoundException(`ScheduledJob ${id} not found`);
    return item;
  }

  /** POST /admin/scheduled-jobs/:id/pause */
  async pause(id: string) {
    const existing = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ScheduledJob ${id} not found`);
    return this.prisma.scheduledJob.update({
      where: { id },
      data: { status: 'PAUSED', lockKey: null, lockedBy: null, lockedUntil: null },
    });
  }

  /** POST /admin/scheduled-jobs/:id/resume */
  async resume(id: string) {
    const existing = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`ScheduledJob ${id} not found`);
    return this.prisma.scheduledJob.update({
      where: { id },
      data: { status: 'ACTIVE', lockKey: null, lockedBy: null, lockedUntil: null },
    });
  }

  /** POST /admin/scheduled-jobs/:id/trigger — manually trigger a run */
  async trigger(id: string, scheduledFor?: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`ScheduledJob ${id} not found`);

    const run = await this.prisma.scheduledJobRun.create({
      data: {
        scheduledJobId: id,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
        status: 'PENDING',
        aiRunId: undefined,
      },
    });
    return run;
  }
}
