import { Controller, Post, Get, Body, HttpCode, Headers, Logger, RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import * as crypto from 'crypto';

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
  private readonly logger = new Logger(NewsletterController.name);

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

  /**
   * Resend webhook endpoint — receives delivery, bounce, and complaint events.
   * Register in Resend dashboard → Webhooks → https://api.babiespicks.com/newsletter/webhook
   * Events: email.delivered, email.bounced, email.complained
   *
   * Signature verification uses RESEND_WEBHOOK_SECRET env var (whsec_... from Resend dashboard).
   * If the env var is not set, signature verification is skipped (logs a warning).
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: Record<string, unknown>,
  ) {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (webhookSecret) {
      this.verifyResendSignature(webhookSecret, svixId, svixTimestamp, svixSignature, req.rawBody);
    } else {
      this.logger.warn('RESEND_WEBHOOK_SECRET not set — skipping webhook signature verification');
    }

    const eventType = body['type'] as string | undefined;
    const data = body['data'] as Record<string, unknown> | undefined;

    this.logger.log(`Resend webhook received: type=${eventType ?? 'unknown'}`);

    switch (eventType) {
      case 'email.delivered':
        this.logger.log(`Email delivered to: ${data?.['to'] ?? 'unknown'}`);
        break;

      case 'email.bounced':
        this.logger.warn(`Email bounced for: ${data?.['to'] ?? 'unknown'} — reason: ${data?.['bounce']}`);
        // TODO: mark subscriber as bounced in DB and suppress future sends
        break;

      case 'email.complained':
        this.logger.warn(`Spam complaint from: ${data?.['to'] ?? 'unknown'}`);
        // TODO: unsubscribe the complainant immediately
        break;

      default:
        this.logger.log(`Unhandled Resend event type: ${eventType}`);
    }

    return { received: true };
  }

  /**
   * Verifies the Svix webhook signature used by Resend.
   * Throws UnauthorizedException if the signature is invalid.
   * @see https://docs.resend.com/api-reference/webhooks/webhook-signatures
   */
  private verifyResendSignature(
    secret: string,
    svixId: string,
    svixTimestamp: string,
    svixSignature: string,
    rawBody: Buffer | undefined,
  ): void {
    if (!svixId || !svixTimestamp || !svixSignature || !rawBody) {
      throw new UnauthorizedException('Missing Svix signature headers');
    }

    // Resend uses Svix signing: HMAC-SHA256 over "svix-id.svix-timestamp.body"
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // svix-signature header may contain multiple space-separated "v1,<base64>" values
    const isValid = svixSignature
      .split(' ')
      .some((sig) => sig === `v1,${expectedSignature}`);

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
