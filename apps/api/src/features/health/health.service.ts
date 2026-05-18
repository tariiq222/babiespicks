import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const database = await this.checkDatabase();
    const version = this.getVersion();

    return {
      status: database === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      database,
      version,
    };
  }

  private async checkDatabase(): Promise<'connected' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'error';
    }
  }

  private getVersion(): string {
    try {
      const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
