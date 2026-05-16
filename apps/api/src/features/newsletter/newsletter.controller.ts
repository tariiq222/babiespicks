import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { randomBytes } from 'crypto';

class SubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locale?: string = 'ar';
}

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto) {
    const existing = await this.prisma.$queryRaw`
      SELECT id FROM product_translations WHERE locale = 'ar' LIMIT 1
    `;

    // Simple email storage (newsletter_subscribers table not in current schema)
    // For now, store in agent_jobs as a tracking mechanism
    await this.prisma.agentJob.create({
      data: {
        agentName: 'newsletter-subscribe',
        status: 'COMPLETED',
        input: { email: dto.email, name: dto.name, locale: dto.locale },
        completedAt: new Date(),
      },
    });

    return { success: true, message: 'تم الاشتراك بنجاح' };
  }
}
