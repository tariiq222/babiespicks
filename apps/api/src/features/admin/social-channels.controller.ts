import { Controller, Get, Post, UseGuards, HttpCode, Logger } from '@nestjs/common';
import { TwitterPublisherService } from '../../infrastructure/publishing/twitter-publisher.service';
import { TelegramPublisherService } from '../../infrastructure/publishing/telegram-publisher.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

interface ChannelStatus {
  channel: 'twitter' | 'telegram';
  configured: boolean;
  /** Which env vars are missing — shown to admin so they know what to add */
  missingEnvVars?: string[];
  /** Friendly name set by the bot API */
  identity?: string;
  error?: string;
}

interface TestResult {
  channel: 'twitter' | 'telegram';
  success: boolean;
  message?: string;
  identity?: string;
}

@Controller('admin/social-channels')
@UseGuards(AdminApiKeyGuard)
export class SocialChannelsController {
  private readonly logger = new Logger(SocialChannelsController.name);

  constructor(
    private readonly twitter: TwitterPublisherService,
    private readonly telegram: TelegramPublisherService,
  ) {}

  /**
   * GET /admin/social-channels
   * Returns configuration status for all social channels.
   * Never exposes secrets — only configured/unconfigured + missing env var names.
   */
  @Get()
  async getStatus(): Promise<{ channels: ChannelStatus[] }> {
    const twitterStatus = this.getTwitterStatus();
    const telegramResult = await this.telegram.testConnection();

    const channels: ChannelStatus[] = [
      twitterStatus,
      {
        channel: 'telegram',
        configured: telegramResult.configured,
        identity: telegramResult.botUsername ? `@${telegramResult.botUsername}` : undefined,
        error: telegramResult.error,
      },
    ];

    return { channels };
  }

  /**
   * POST /admin/social-channels/twitter/test
   * Check Twitter configuration without posting anything.
   * Twitter's API doesn't have a lightweight "test" call — we verify isConfigured
   * by checking that all required env vars are present.
   * If configured, return a success indicating env vars are set (no secrets).
   */
  @Post('twitter/test')
  @HttpCode(200)
  async testTwitter(): Promise<TestResult> {
    this.logger.log('Testing Twitter configuration');

    // Check if Twitter env vars are all set
    const required = ['TWITTER_BEARER_TOKEN', 'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
    const missing = required.filter((v) => !process.env[v]);

    if (missing.length > 0) {
      return {
        channel: 'twitter',
        success: false,
        message: `Missing env vars: ${missing.join(', ')}`,
      };
    }

    this.logger.log('Twitter credentials are configured (test does not post)');
    return {
      channel: 'twitter',
      success: true,
      message: 'All Twitter credentials are configured. No test post was made.',
    };
  }

  /**
   * POST /admin/social-channels/telegram/test
   * Calls Telegram getMe to verify the bot token is valid.
   */
  @Post('telegram/test')
  @HttpCode(200)
  async testTelegram(): Promise<TestResult> {
    this.logger.log('Testing Telegram connection');
    const result = await this.telegram.testConnection();

    if (!result.configured) {
      return {
        channel: 'telegram',
        success: false,
        message: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.',
      };
    }

    if (result.error) {
      return {
        channel: 'telegram',
        success: false,
        message: `Telegram test failed: ${result.error}`,
        identity: result.botUsername ? `@${result.botUsername}` : undefined,
      };
    }

    return {
      channel: 'telegram',
      success: true,
      message: 'Telegram bot is connected and reachable.',
      identity: result.botUsername ? `@${result.botUsername}` : undefined,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getTwitterStatus(): ChannelStatus {
    const required = ['TWITTER_BEARER_TOKEN', 'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
    const missing = required.filter((v) => !process.env[v]);

    return {
      channel: 'twitter',
      configured: missing.length === 0,
      missingEnvVars: missing.length > 0 ? missing : undefined,
    };
  }
}
