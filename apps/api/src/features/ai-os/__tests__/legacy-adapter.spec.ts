import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiOsService } from '../ai-os.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AiRunStatus, AiRunType, AiEventType } from '@prisma/client';

// ──────────────────────────────────────────────────────────────
// Helper: builds a mock PrismaService with tracking
// ──────────────────────────────────────────────────────────────
function buildMockPrisma() {
  const tracks: string[] = [];
  const mockRun = vi.fn() as any;
  const mockUpdate = vi.fn() as any;
  const mockEvent = vi.fn() as any;
  const mockStep = vi.fn() as any;
  const mockStepUpdate = vi.fn() as any;

  mockRun.mockImplementation(({ data }: any) => {
    tracks.push(`create:${data?.name ?? '?'}:${data?.status}`);
    return { id: 'run-123', ...data };
  });
  mockUpdate.mockImplementation(({ data }: any) => {
    tracks.push(`update:${data?.status ?? '?'}`);
    return { id: 'run-123', ...data };
  });
  mockEvent.mockImplementation(({ data }: any) => {
    tracks.push(`event:${data?.type}:${data?.message}`);
    return { id: 'evt-123', ...data };
  });
  mockStep.mockImplementation(({ data }: any) => {
    tracks.push(`step:${data?.stepName}:${data?.status}`);
    return { id: 'step-123', ...data };
  });
  mockStepUpdate.mockImplementation(({ data }: any) => {
    tracks.push(`step-update:${data?.status}`);
    return { id: 'step-123', ...data };
  });

  const prisma = {
    aiRun: { create: mockRun, update: mockUpdate },
    aiEvent: { create: mockEvent },
    aiRunStep: { create: mockStep, update: mockStepUpdate },
  } as unknown as PrismaService;

  return { prisma, tracks, mockRun, mockUpdate, mockEvent, mockStep, mockStepUpdate };
}

describe('Legacy Adapter — AiOsService', () => {
  let service: AiOsService;
  let prisma: PrismaService;
  let tracks: string[];

  beforeEach(() => {
    const mocked = buildMockPrisma();
    prisma = mocked.prisma;
    tracks = mocked.tracks;
    service = new AiOsService(prisma as any);
  });

  // ── startLegacyRun ─────────────────────────────────────────

  describe('startLegacyRun', () => {
    it('creates a RUNNING AiRun with correct fields', async () => {
      const result = await service.startLegacyRun({
        type: AiRunType.PRODUCT_PIPELINE,
        name: 'test-pipeline',
        source: 'admin',
        input: { url: 'https://example.com' },
      });

      expect(result).toEqual('run-123');
      expect(tracks).toContain('create:test-pipeline:RUNNING');
    });

    it('returns null and does not throw when DB create fails', async () => {
      (prisma.aiRun.create as any).mockRejectedValueOnce(new Error('DB unavailable'));

      const result = await service.startLegacyRun({
        type: AiRunType.DISCOVERY,
        name: 'failing-run',
      });

      expect(result).toBeNull();
      expect(tracks).toHaveLength(0);
    });
  });

  // ── completeLegacyRun ──────────────────────────────────────

  describe('completeLegacyRun', () => {
    it('updates run to COMPLETED when runId is provided', async () => {
      await service.completeLegacyRun('run-123', { productId: 'pid-1' });

      expect(tracks).toContain('update:COMPLETED');
    });

    it('is a no-op when runId is null', async () => {
      await service.completeLegacyRun(null, { productId: 'pid-1' });

      expect(tracks).toHaveLength(0);
    });

    it('is a no-op when DB update fails', async () => {
      (prisma.aiRun.update as any).mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await service.completeLegacyRun('run-123', { productId: 'pid-1' });

      // Error was caught, tracks still empty (mock rejected before implementation ran)
      expect(tracks).toHaveLength(0);
    });
  });

  // ── failLegacyRun ─────────────────────────────────────────

  describe('failLegacyRun', () => {
    it('updates run to FAILED with error message', async () => {
      await service.failLegacyRun('run-123', 'Something went wrong');

      expect(tracks).toContain('update:FAILED');
    });

    it('is a no-op when runId is null', async () => {
      await service.failLegacyRun(null, 'error');

      expect(tracks).toHaveLength(0);
    });
  });

  // ── addLegacyEvent ─────────────────────────────────────────

  describe('addLegacyEvent', () => {
    it('creates an event linked to the run', async () => {
      await service.addLegacyEvent('run-123', AiEventType.INFO, 'Pipeline started');

      expect(tracks).toContain('event:INFO:Pipeline started');
    });

    it('is a no-op when runId is null', async () => {
      await service.addLegacyEvent(null, AiEventType.ERROR, 'Oops');

      expect(tracks).toHaveLength(0);
    });

    it('silently ignores DB errors', async () => {
      (prisma.aiEvent.create as any).mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await service.addLegacyEvent('run-123', AiEventType.WARNING, 'test');

      expect(tracks).toHaveLength(0);
    });
  });

  // ── addLegacyStep ─────────────────────────────────────────

  describe('addLegacyStep', () => {
    it('creates a RUNNING step', async () => {
      const result = await service.addLegacyStep('run-123', 'acquisition');

      expect(result).toEqual({ id: 'step-123' });
      expect(tracks).toContain('step:acquisition:RUNNING');
    });

    it('returns null when runId is null', async () => {
      const result = await service.addLegacyStep(null, 'acquisition');

      expect(result).toBeNull();
      expect(tracks).toHaveLength(0);
    });

    it('returns null and does not throw on DB error', async () => {
      (prisma.aiRunStep.create as any).mockRejectedValueOnce(new Error('DB error'));

      const result = await service.addLegacyStep('run-123', 'acquisition');

      expect(result).toBeNull();
    });
  });

  // ── updateLegacyStep ──────────────────────────────────────

  describe('updateLegacyStep', () => {
    it('updates step status to COMPLETED', async () => {
      await service.updateLegacyStep('step-123', 'COMPLETED', { data: 'output' });

      expect(tracks).toContain('step-update:COMPLETED');
    });

    it('is a no-op when stepId is null', async () => {
      await service.updateLegacyStep(null, 'FAILED', undefined, 'error');

      expect(tracks).toHaveLength(0);
    });
  });

  // ── End-to-end degradation scenario ───────────────────────

  describe('full legacy flow — tracking fails at every step, legacy execution continues', () => {
    it('all methods return null/false on DB failure without throwing', async () => {
      // Simulate DB completely down
      (prisma.aiRun.create as any).mockRejectedValue(new Error('connection refused'));
      (prisma.aiRun.update as any).mockRejectedValue(new Error('connection refused'));
      (prisma.aiEvent.create as any).mockRejectedValue(new Error('connection refused'));
      (prisma.aiRunStep.create as any).mockRejectedValue(new Error('connection refused'));

      // These should all be safe to call and return null/no-op
      const runId = await service.startLegacyRun({
        type: AiRunType.CONTENT_PIPELINE,
        name: 'degraded-flow',
        input: {},
      });

      await service.completeLegacyRun(runId, {});
      await service.failLegacyRun(runId, 'error');
      await service.addLegacyEvent(runId, AiEventType.INFO, 'msg');
      const step = await service.addLegacyStep(runId, 'step');
      await service.updateLegacyStep(step?.id ?? null, 'FAILED');

      expect(runId).toBeNull();
      expect(step).toBeNull();
    });
  });
});

describe('Legacy Adapter — backward compatibility', () => {
  it('PRODUCT_PIPELINE is a valid AiRunType', () => {
    expect(Object.values(AiRunType)).toContain('PRODUCT_PIPELINE');
  });

  it('CONTENT_PIPELINE is a valid AiRunType', () => {
    expect(Object.values(AiRunType)).toContain('CONTENT_PIPELINE');
  });

  it('DISCOVERY is a valid AiRunType', () => {
    expect(Object.values(AiRunType)).toContain('DISCOVERY');
  });

  it('CONTENT_SPRINT is a valid AiRunType', () => {
    expect(Object.values(AiRunType)).toContain('CONTENT_SPRINT');
  });

  it('MANUAL is a valid AiRunType (used for social publish)', () => {
    expect(Object.values(AiRunType)).toContain('MANUAL');
  });
});
