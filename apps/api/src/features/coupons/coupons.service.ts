import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CouponStatus } from '@prisma/client';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(storeId?: string, status?: CouponStatus) {
    const where: any = {};

    if (storeId) {
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

    return this.prisma.coupon.delete({
      where: { id },
      include: { store: true },
    });
  }

  async expireOldCoupons() {
    const now = new Date();

    const result = await this.prisma.coupon.updateMany({
      where: {
        validUntil: { lt: now },
        status: { not: CouponStatus.EXPIRED },
      },
      data: { status: CouponStatus.EXPIRED },
    });

    return { expiredCount: result.count };
  }
}
