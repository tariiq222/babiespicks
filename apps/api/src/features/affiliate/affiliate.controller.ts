import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AffiliateService } from './affiliate.service';

@Controller()
export class AffiliateController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliateService: AffiliateService,
  ) {}

  @Get('go/:productId/:storeId')
  async trackAndRedirect(
    @Param('productId') productId: string,
    @Param('storeId') storeId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
    @Headers('cf-ipcountry') country: string,
  ) {
    // Log the click (fire and forget)
    this.prisma.affiliateClick
      .create({
        data: {
          productId,
          storeId,
          userAgent: userAgent?.substring(0, 500),
          referrer: referrer?.substring(0, 500),
          ipHash: this.hashIp(req.ip || ''),
          locale: (req.query.locale as string) || 'ar',
          country: country || null,
        },
      })
      .catch(() => {});

    try {
      const redirectResult = await this.affiliateService.getSmartRedirectUrl(
        productId,
        storeId,
      );
      return res.redirect(302, redirectResult.url);
    } catch (error) {
      // Fallback: redirect to store homepage when no URL is available for this store
      if (error instanceof NotFoundException) {
        const store = await this.prisma.store.findUnique({
          where: { id: storeId },
        });
        return res.redirect(302, store?.url || 'https://babiespicks.com');
      }
      throw error;
    }
  }

  @Get('go/best/:productId')
  async trackAndRedirectBest(
    @Param('productId') productId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
    @Headers('cf-ipcountry') country: string,
  ) {
    const redirect = await this.affiliateService.getSmartRedirectUrl(
      productId,
      undefined,
      country || undefined,
    );

    // Log the click with resolved store (fire and forget)
    this.prisma.affiliateClick
      .create({
        data: {
          productId,
          storeId: redirect.storeId,
          userAgent: userAgent?.substring(0, 500),
          referrer: referrer?.substring(0, 500),
          ipHash: this.hashIp(req.ip || ''),
          locale: (req.query.locale as string) || 'ar',
          country: country || null,
        },
      })
      .catch(() => {});

    return res.redirect(302, redirect.url);
  }

  @Get('affiliate/stats')
  async getStats(
    @Query('productId') productId?: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    if (isNaN(daysNum) || daysNum < 1) {
      throw new NotFoundException('Invalid days parameter');
    }
    return this.affiliateService.getClickStats(
      productId || undefined,
      daysNum,
    );
  }

  @Get('affiliate/top')
  async getTop(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1) {
      throw new NotFoundException('Invalid limit parameter');
    }
    return this.affiliateService.getTopProducts(limitNum);
  }

  private hashIp(ip: string): string {
    // Simple hash for privacy
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
