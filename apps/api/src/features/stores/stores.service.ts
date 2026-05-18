import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
    });

    if (!store) {
      throw new NotFoundException(`Store with slug "${slug}" not found`);
    }

    return store;
  }
}
