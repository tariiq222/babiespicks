import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CouponStatus } from '@prisma/client';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(storeId?: string, status?: CouponStatus, storeSlug?: string) {
    const where: any = {};

    // Resolve storeSlug → storeId when storeId is not directly provided
    if (storeSlug && !storeId) {
      const store = await this.prisma.store.findUnique({
        where: { slug: storeSlug },
        select: { id: true },
      });
      if (!store) {
        throw new NotFoundException(`Store with slug "${storeSlug}" not found`);
      }
      where.storeId = store.id;
    } else if (storeId) {
      where.storeId = storeId;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.coupon.findMany({
      where,
      include: { store: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { store: true },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with id "${id}" not found`);
    }

    return coupon;
  }

  async findByCode(code: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { code },
      include: { store: true },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with code "${code}" not found`);
    }

    return coupon;
  }

  async create(dto: CreateCouponDto) {
    return this.prisma.coupon.create({
      data: dto,
      include: { store: true },
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);

    return this.prisma.coupon.update({
      where: { id },
      data: dto,
      include: { store: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.coupon.update({
      where: { id },
      data: {
        status: CouponStatus.EXPIRED,
        expiredReason: 'manual_removal',
      },
      include: { store: true },
    });
  }

  async expireOldCoupons() {
    const now = new Date();

    const result = await this.prisma.coupon.updateMany({
      where: {
        validUntil: { lt: now },
        status: { notIn: [CouponStatus.EXPIRED, CouponStatus.INVALID, CouponStatus.USED_UP] },
      },
      data: {
        status: CouponStatus.EXPIRED,
        expiredReason: 'date_passed',
      },
    });

    return { expiredCount: result.count };
  }

  async getStats() {
    const [statusGroups, byStore] = await Promise.all([
      this.prisma.coupon.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.coupon.groupBy({
        by: ['storeId'],
        _count: { _all: true },
        where: { status: CouponStatus.ACTIVE },
      }),
    ]);

    const countMap: Record<string, number> = {};
    let total = 0;
    for (const group of statusGroups) {
      countMap[group.status] = group._count._all;
      total += group._count._all;
    }

    // Fetch store names for the by-store breakdown
    const storeIds = byStore.map((g) => g.storeId);
    const stores = storeIds.length
      ? await this.prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true },
        })
      : [];
    const storeNameMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

    // Full active count per store (already filtered to ACTIVE above)
    const byStoreResult = byStore.map((g) => ({
      storeId: g.storeId,
      storeName: storeNameMap[g.storeId] ?? g.storeId,
      activeCount: g._count._all,
    }));

    // Total per-store count (all statuses) — a second groupBy
    const byStoreAll = await this.prisma.coupon.groupBy({
      by: ['storeId'],
      _count: { _all: true },
      where: { storeId: { in: storeIds.length ? storeIds : undefined } },
    });
    const storeTotalMap: Record<string, number> = Object.fromEntries(
      byStoreAll.map((g) => [g.storeId, g._count._all]),
    );

    return {
      total,
      active: countMap[CouponStatus.ACTIVE] ?? 0,
      expired: countMap[CouponStatus.EXPIRED] ?? 0,
      needsReview: countMap[CouponStatus.NEEDS_REVIEW] ?? 0,
      usedUp: countMap[CouponStatus.USED_UP] ?? 0,
      invalid: countMap[CouponStatus.INVALID] ?? 0,
      byStore: byStoreResult.map((s) => ({
        ...s,
        count: storeTotalMap[s.storeId] ?? s.activeCount,
      })),
    };
  }
}
