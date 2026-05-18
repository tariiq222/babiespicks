import { Controller, Post, Body, Delete, Get, UseGuards, HttpCode } from '@nestjs/common';
import { CoordinatorService } from '../../agents/coordinator/coordinator.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly coordinator: CoordinatorService,
    private readonly prisma: PrismaService,
  ) {}

  // Run product pipeline for a single URL
  @Post('pipeline/product')
  @HttpCode(200)
  async runProductPipeline(
    @Body() body: { url: string; storeSlug?: string; reviews?: any[] },
  ) {
    const result = await this.coordinator.runProductPipeline(
      body.url,
      body.storeSlug,
      body.reviews,
    );
    return result;
  }

  // Run product pipeline for multiple URLs (batch)
  @Post('pipeline/batch')
  @HttpCode(200)
  async runBatchPipeline(
    @Body() body: { urls: { url: string; storeSlug?: string }[] },
  ) {
    const results = [];
    for (const item of body.urls) {
      try {
        const result = await this.coordinator.runProductPipeline(item.url, item.storeSlug);
        results.push({ url: item.url, success: true, result });
      } catch (error) {
        results.push({ url: item.url, success: false, error: (error as Error).message });
      }
    }
    return { total: body.urls.length, results };
  }

  // Run content pipeline
  @Post('pipeline/content')
  @HttpCode(200)
  async runContentPipeline(
    @Body() body: { type: string; topic: string; slug: string; productIds: string[]; categoryId?: string },
  ) {
    const result = await this.coordinator.runContentPipeline(
      body.type as 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE',
      body.topic,
      body.slug,
      body.productIds,
      body.categoryId,
    );
    return result;
  }

  // Clear all mock/seed data
  @Delete('data/reset')
  async resetData() {
    // Delete in order respecting foreign keys
    await this.prisma.publishedPost.deleteMany();
    await this.prisma.contentPageTranslation.deleteMany();
    await this.prisma.contentPage.deleteMany();
    await this.prisma.agentJob.deleteMany();
    await this.prisma.affiliateClick.deleteMany();
    await this.prisma.verdict.deleteMany();
    await this.prisma.productReviewSummary.deleteMany();
    await this.prisma.productSpec.deleteMany();
    await this.prisma.productPrice.deleteMany();
    await this.prisma.productTranslation.deleteMany();
    await this.prisma.product.deleteMany();
    
    return { success: true, message: 'All product data cleared' };
  }

  // Get pipeline status / stats
  @Get('stats')
  async getStats() {
    const [products, verdicts, contentPages, agentJobs] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.verdict.count(),
      this.prisma.contentPage.count(),
      this.prisma.agentJob.count(),
    ]);
    return { products, verdicts, contentPages, agentJobs };
  }
}
