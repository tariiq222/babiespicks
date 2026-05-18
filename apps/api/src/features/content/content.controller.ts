import { Controller, Get, Param, Query } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('content-pages')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  async getPages(@Query('locale') locale: string = 'ar') {
    return this.contentService.getPublishedPages(locale);
  }

  @Get(':slug')
  async getPage(@Param('slug') slug: string, @Query('locale') locale: string = 'ar') {
    return this.contentService.getPageBySlug(slug, locale);
  }
}
