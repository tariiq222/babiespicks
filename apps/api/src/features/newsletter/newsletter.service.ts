import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(email: string, name?: string, locale?: string) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate via raw query on JSON input
    const existing = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM agent_jobs
      WHERE agent_name = 'newsletter-subscribe'
        AND input::text ILIKE '%' || ${normalizedEmail} || '%'
      LIMIT 1
    `;

    if (existing.length > 0) {
      return { duplicate: true, message: 'already_subscribed' };
    }

    await this.prisma.agentJob.create({
      data: {
        agentName: 'newsletter-subscribe',
        status: 'COMPLETED',
        input: { email: normalizedEmail, name: name ?? null, locale: locale ?? 'ar' } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return { duplicate: false, message: 'subscribed' };
  }

  async getSubscriberCount(): Promise<number> {
    const count = await this.prisma.agentJob.count({
      where: { agentName: 'newsletter-subscribe' },
    });
    return count;
  }
}