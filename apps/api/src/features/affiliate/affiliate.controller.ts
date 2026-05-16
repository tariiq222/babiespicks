import { Controller, Get, Param, Req, Res, Headers } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Controller('go')
export class AffiliateController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':productId/:storeId')
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
    this.prisma.affiliateClick.create({
      data: {
        productId,
        storeId,
        userAgent: userAgent?.substring(0, 500),
        referrer: referrer?.substring(0, 500),
        ipHash: this.hashIp(req.ip || ''),
        locale: req.query.locale as string || 'ar',
        country: country || null,
      },
    }).catch(() => {});

    // Find the product price URL for this store
    const price = await this.prisma.productPrice.findFirst({
      where: { productId, storeId },
      orderBy: { scrapedAt: 'desc' },
    });

    if (price?.url) {
      return res.redirect(302, price.url);
    }

    // Fallback: redirect to store homepage
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    return res.redirect(302, store?.url || 'https://babiespicks.com');
  }

  private hashIp(ip: string): string {
    // Simple hash for privacy
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
