import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PUBLIC_OFFER_DRAFT_STATUS_APPROVED } from './dto/public-offer-draft.dto';

@Injectable()
export class ControlledPublishingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Publishes an APPROVED PublicOfferDraft to the live PublicOffer table.
   * This is a SEPARATE action from approval — admins must explicitly publish.
   */
  async publishPublicOfferDraft(draftId: string, idempotencyKey?: string): Promise<unknown> {
    const draft = await this.prisma.publicOfferDraft.findUnique({
      where: { id: draftId },
      include: {
        sourceContentDraft: {
          select: { id: true, title: true, contentType: true, body: true, angle: true, status: true },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`PublicOfferDraft ${draftId} not found`);
    }

    if (draft.status !== PUBLIC_OFFER_DRAFT_STATUS_APPROVED) {
      throw new BadRequestException(
        `Cannot publish draft with status ${draft.status}. Draft must be APPROVED first.`,
      );
    }

    const title = draft.title ?? draft.sourceContentDraft?.title;
    if (!title) {
      throw new BadRequestException('Cannot publish: draft has no title');
    }

    const body = draft.sourceContentDraft?.body;
    if (!body) {
      throw new BadRequestException('Cannot publish: source content draft has no body');
    }

    const slug = draft.slug ?? `offer-${draftId}`;
    if (!slug) {
      throw new BadRequestException('Cannot publish: draft has no slug');
    }

    // Idempotency: if already published, return existing
    if (idempotencyKey) {
      const existing = await this.prisma.publicOffer.findUnique({
        where: { sourcePublicOfferDraftId: draftId },
      });
      if (existing) {
        return { publicOffer: existing, alreadyPublished: true };
      }
    }

    const existingOffer = await this.prisma.publicOffer.findUnique({
      where: { sourcePublicOfferDraftId: draftId },
    });

    if (existingOffer) {
      const updated = await this.prisma.publicOffer.update({
        where: { id: existingOffer.id },
        data: {
          title,
          body,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      return { publicOffer: updated, alreadyPublished: false };
    } else {
      const created = await this.prisma.publicOffer.create({
        data: {
          sourcePublicOfferDraftId: draftId,
          slug,
          title,
          body,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      return { publicOffer: created, alreadyPublished: false };
    }
  }

  async listPublicOffers(limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.publicOffer.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.publicOffer.count(),
    ]);
    return { items, total, limit, offset };
  }

  async unpublishPublicOffer(id: string) {
    const offer = await this.prisma.publicOffer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException(`PublicOffer ${id} not found`);
    if (offer.status !== 'PUBLISHED') {
      throw new BadRequestException(`Offer ${id} is not PUBLISHED (current: ${offer.status})`);
    }
    return this.prisma.publicOffer.update({
      where: { id },
      data: { status: 'UNPUBLISHED', unpublishedAt: new Date() },
    });
  }

  async getPublicOfferBySlug(slug: string) {
    const offer = await this.prisma.publicOffer.findUnique({ where: { slug } });
    if (!offer || offer.status !== 'PUBLISHED') {
      throw new NotFoundException(`Offer not found`);
    }
    return offer;
  }
}
