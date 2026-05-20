import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  NotFoundException,
  BadRequestException,
  StreamableFile,
  PipeTransform,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminApiKeyGuard } from '../../features/admin/admin-api-key.guard';
import { ImagesService, ImageSize, validateImageSlug } from './images.service';
import { createReadStream, existsSync } from 'fs';

export class ImageSlugPipe implements PipeTransform<string, string> {
  constructor(private readonly fieldName: string) {}

  transform(value: string): string {
    if (!validateImageSlug(value)) {
      throw new BadRequestException(`${this.fieldName} must be a lowercase kebab-case slug`);
    }

    return value;
  }
}

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':slug/:size')
  async getImage(
    @Param('slug', new ImageSlugPipe('slug')) slug: string,
    @Param('size') size: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!['thumb', 'card', 'full'].includes(size)) {
      throw new BadRequestException(`Invalid size "${size}". Must be one of: thumb, card, full`);
    }

    const imagePath = this.imagesService.getImagePath(slug, size as ImageSize);

    if (!existsSync(imagePath)) {
      throw new NotFoundException(`Optimized image not found for product "${slug}" size "${size}"`);
    }

    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    return new StreamableFile(createReadStream(imagePath));
  }

  @Post('process')
  @UseGuards(AdminApiKeyGuard)
  async processImage(
    @Body('sourceUrl') sourceUrl: string,
    @Body('productSlug', new ImageSlugPipe('productSlug')) productSlug: string,
  ) {
    if (!sourceUrl || !productSlug) {
      throw new BadRequestException('sourceUrl and productSlug are required');
    }

    const results = await this.imagesService.processImage(sourceUrl, productSlug);

    return {
      success: true,
      productSlug,
      sizes: Object.keys(results),
    };
  }

  @Post('process-all')
  @UseGuards(AdminApiKeyGuard)
  async processAllProducts() {
    const results = await this.imagesService.processAllProducts();

    return {
      success: true,
      ...results,
    };
  }
}
