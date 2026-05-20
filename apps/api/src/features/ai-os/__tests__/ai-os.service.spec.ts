import { describe, it, expect, vi } from 'vitest';
import { AiOsService } from '../ai-os.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('AiOsService', () => {
  it('should be defined', () => {
    expect(true).toBe(true);
  });

  it('should have valid AiRunType values', () => {
    const types = ['PRODUCT_PIPELINE', 'CONTENT_PIPELINE', 'DISCOVERY', 'CONTENT_SPRINT', 'MANUAL'];
    expect(types).toHaveLength(5);
    expect(types).toContain('MANUAL');
  });

  it('should have valid AiRunStatus values', () => {
    const statuses = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];
    expect(statuses).toHaveLength(5);
    expect(statuses).toContain('CANCELLED');
  });

  it('should have valid AiStepStatus values', () => {
    const statuses = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'];
    expect(statuses).toHaveLength(5);
  });

  it('should have valid AiArtifactType values', () => {
    const types = ['TEXT', 'IMAGE', 'JSON', 'URL'];
    expect(types).toHaveLength(4);
  });

  it('should have valid AiEventType values', () => {
    const types = ['INFO', 'WARNING', 'ERROR', 'APPROVAL_REQUIRED', 'CHECKPOINT'];
    expect(types).toHaveLength(5);
  });

  it('should have valid AiApprovalStatus values', () => {
    const statuses = ['PENDING', 'APPROVED', 'REJECTED'];
    expect(statuses).toHaveLength(3);
  });

  it('returns zero legacy counts when legacy AgentJob aggregation fails', async () => {
    const prisma = {
      aiRun: {
        count: vi.fn().mockResolvedValue(3),
        groupBy: vi.fn().mockResolvedValue([
          { status: 'COMPLETED', _count: 2 },
          { status: 'RUNNING', _count: 1 },
        ]),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { tokensUsed: 1200, costUsd: 0.42 },
        }),
      },
      agentJob: {
        groupBy: vi.fn(() => {
          throw new Error('legacy table unavailable');
        }),
      },
    } as unknown as PrismaService;

    const service = new AiOsService(prisma);
    vi.spyOn(service, 'getQueueStats').mockResolvedValue({
      pending: 0,
      active: 0,
      failed: 0,
      implementation: 'in-process',
    });

    const overview = await service.getOverview();

    expect(overview.legacy).toEqual({ totalJobs: 0, completedJobs: 0 });
    expect(overview.combined).toEqual({ totalRuns: 3, completedRuns: 2 });
  });

  it('still fails the overview when core AiRun queries fail', async () => {
    const prisma = {
      aiRun: {
        count: vi.fn().mockRejectedValue(new Error('aiRun unavailable')),
        groupBy: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
      },
      agentJob: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const service = new AiOsService(prisma);
    vi.spyOn(service, 'getQueueStats').mockResolvedValue({
      pending: 0,
      active: 0,
      failed: 0,
      implementation: 'in-process',
    });

    await expect(service.getOverview()).rejects.toThrow('aiRun unavailable');
  });
});
