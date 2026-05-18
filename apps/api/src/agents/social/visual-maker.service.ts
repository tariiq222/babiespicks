import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface VerdictCardData {
  productName: string;
  verdictType: string;
  overallScore: number;
  axes: {
    safety: number;
    quality: number;
    reviews: number;
    price: number;
    longTerm: number;
  };
  imageUrl: string | null;
}

@Injectable()
export class VisualMakerService {
  private readonly logger = new Logger(VisualMakerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates verdict card data for a product.
   * Returns structured data for the frontend to render the card.
   * Real image generation (Sharp/Canvas) would be handled separately.
   */
  async generateVerdictCard(productId: string): Promise<VerdictCardData | null> {
    this.logger.log(`Generating verdict card data for product: ${productId}`);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        verdict: true,
        translations: { where: { locale: 'ar' } },
      },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      return null;
    }

    if (!product.verdict) {
      this.logger.warn(`No verdict for product: ${productId}`);
      return null;
    }

    const arTranslation = product.translations[0];
    const productName = arTranslation?.name ?? product.name;

    const cardData: VerdictCardData = {
      productName,
      verdictType: product.verdict.type,
      overallScore: product.verdict.overallScore,
      axes: {
        safety: product.verdict.safetyScore,
        quality: product.verdict.qualityScore,
        reviews: product.verdict.reviewsScore,
        price: product.verdict.priceScore,
        longTerm: product.verdict.longTermScore,
      },
      imageUrl: product.imageUrl,
    };

    this.logger.log(
      `Verdict card data ready: ${productName} (${cardData.verdictType}, ${cardData.overallScore}/10)`,
    );
    return cardData;
  }
}
