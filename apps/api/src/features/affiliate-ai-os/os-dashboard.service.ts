import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface AffiliateOsOverview {
  totalProductsProcessed: number;
  totalOffersPublished: number;
  totalSocialPostsPublished: number;
  activeRuns: number;
  pendingApprovals: number;
  scheduledJobsRunning: number;
  recentActivity: Array<{ timestamp: string; event: string; detail: string }>;
  systemHealth: {
    database: boolean;
    aiWorkers: boolean;
    scheduledJobs: boolean;
    connectors: boolean;
  };
  pendingActions: Array<{ id: string; type: string; description: string; priority: string; createdAt: string }>;
  risks: Array<{ id: string; severity: 'low' | 'medium' | 'high'; description: string; recommendation: string }>;
}

@Injectable()
export class OsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/affiliate-os/overview */
  async getOverview(): Promise<AffiliateOsOverview> {
    const [
      totalProductsProcessed,
      totalOffersPublished,
      totalSocialPostsPublished,
      activeRuns,
      pendingApprovals,
      scheduledJobsRunning,
      recentActivity,
    ] = await Promise.all([
      this.prisma.productDraft.count(),
      this.prisma.publicOffer.count(),
      this.prisma.socialPost.count({ where: { publishedAt: { not: null } } }),
      this.prisma.aiRun.count({ where: { status: 'RUNNING' } }),
      this.prisma.reviewItem.count({ where: { reviewStatus: 'PENDING' } }),
      this.prisma.scheduledJob.count({ where: { status: 'ACTIVE' } }),
      this.prisma.aiRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, createdAt: true },
      }),
    ]);

    const recentActivityFormatted = recentActivity.map((r) => ({
      timestamp: r.createdAt?.toISOString() ?? new Date().toISOString(),
      event: `AI Run ${r.status}`,
      detail: `Run ${r.id.slice(0, 8)} — ${r.status}`,
    }));

    return {
      totalProductsProcessed: totalProductsProcessed,
      totalOffersPublished,
      totalSocialPostsPublished,
      activeRuns,
      pendingApprovals,
      scheduledJobsRunning,
      recentActivity: recentActivityFormatted,
      systemHealth: {
        database: true,
        aiWorkers: activeRuns > 0,
        scheduledJobs: scheduledJobsRunning > 0,
        connectors: true,
      },
      pendingActions: pendingApprovals > 0
        ? [
            {
              id: 'pending-approvals',
              type: 'APPROVAL',
              description: `${pendingApprovals} item(s) awaiting approval`,
              priority: 'medium',
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
      risks: [],
    };
  }

  /** GET /admin/affiliate-os/activity */
  async getActivity(params: { limit?: number }): Promise<Array<{ timestamp: string; event: string; detail: string }>> {
    const limit = params.limit ?? 20;

    const [runs, scheduledJobRuns, socialPosts] = await Promise.all([
      this.prisma.aiRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, status: true, createdAt: true },
      }),
      this.prisma.scheduledJobRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, status: true, createdAt: true },
      }),
      this.prisma.socialPost.findMany({
        orderBy: { publishedAt: 'desc' },
        take: limit,
        where: { publishedAt: { not: null } },
        select: { id: true, platform: true, publishedAt: true },
      }),
    ]);

    const activity = [
      ...runs.map((r) => ({
        timestamp: r.createdAt?.toISOString() ?? new Date().toISOString(),
        event: `AI Run: ${r.status}`,
        detail: `Run ${r.id.slice(0, 8)}`,
      })),
      ...scheduledJobRuns.map((r) => ({
        timestamp: r.createdAt?.toISOString() ?? new Date().toISOString(),
        event: `Scheduled Job: ${r.status}`,
        detail: `Run ${r.id.slice(0, 8)}`,
      })),
      ...socialPosts.map((p) => ({
        timestamp: p.publishedAt?.toISOString() ?? new Date().toISOString(),
        event: `Social Post: PUBLISHED`,
        detail: `${p.platform} post ${p.id.slice(0, 8)}`,
      })),
    ];

    return activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }

  /** GET /admin/affiliate-os/risks */
  async getRisks(): Promise<AffiliateOsOverview['risks']> {
    return [
      {
        id: 'no-active-scheduled-jobs',
        severity: 'low',
        description: 'No scheduled jobs are currently active',
        recommendation: 'Review scheduled jobs and enable automation rules if desired',
      },
    ];
  }

  /** GET /admin/affiliate-os/pending-actions */
  async getPendingActions(): Promise<AffiliateOsOverview['pendingActions']> {
    const [pendingReviews, pendingSocialApprovals] = await Promise.all([
      this.prisma.reviewItem.count({ where: { reviewStatus: 'PENDING' } }),
      this.prisma.socialPost.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);

    const actions = [];
    if (pendingReviews > 0) {
      actions.push({
        id: 'pending-reviews',
        type: 'REVIEW',
        description: `${pendingReviews} item(s) awaiting review`,
        priority: 'medium',
        createdAt: new Date().toISOString(),
      });
    }
    if (pendingSocialApprovals > 0) {
      actions.push({
        id: 'pending-social-approvals',
        type: 'APPROVAL',
        description: `${pendingSocialApprovals} social post(s) awaiting approval`,
        priority: 'medium',
        createdAt: new Date().toISOString(),
      });
    }
    return actions;
  }
}
