import { Controller, Post, Get, Body, HttpCode } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';

class SubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locale?: string = 'ar';
}

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@Body() dto: SubscribeDto) {
    const result = await this.newsletterService.subscribe(dto.email, dto.name, dto.locale);

    if (result.duplicate) {
      return { success: true, message: 'already_subscribed', duplicate: true };
    }

    return { success: true, message: 'subscribed', duplicate: false };
  }

  @Get('count')
  async getCount() {
    const count = await this.newsletterService.getSubscriberCount();
    return { count };
  }
}