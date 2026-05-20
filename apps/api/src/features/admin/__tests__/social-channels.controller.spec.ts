import { describe, it, expect, beforeEach } from 'vitest';
import { SocialChannelsController } from '../social-channels.controller';
import { TwitterPublisherService } from '../../../infrastructure/publishing/twitter-publisher.service';
import { TelegramPublisherService } from '../../../infrastructure/publishing/telegram-publisher.service';

describe('SocialChannelsController', () => {
  let controller: SocialChannelsController;

  beforeEach(() => {
    // Clear all social channel env vars
    delete process.env.TWITTER_BEARER_TOKEN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;

    controller = new SocialChannelsController(
      new TwitterPublisherService(),
      new TelegramPublisherService(),
    );
  });

  describe('getStatus', () => {
    it('should return unconfigured for both channels when env vars are missing', async () => {
      const result = await controller.getStatus();

      expect(result.channels).toHaveLength(2);

      const twitterStatus = result.channels.find((c) => c.channel === 'twitter');
      expect(twitterStatus?.configured).toBe(false);
      expect(twitterStatus?.missingEnvVars).toContain('TWITTER_BEARER_TOKEN');
      expect(twitterStatus?.missingEnvVars).toContain('TWITTER_API_KEY');
      expect(twitterStatus?.missingEnvVars).toContain('TWITTER_API_SECRET');
      expect(twitterStatus?.missingEnvVars).toContain('TWITTER_ACCESS_TOKEN');
      expect(twitterStatus?.missingEnvVars).toContain('TWITTER_ACCESS_SECRET');

      const telegramStatus = result.channels.find((c) => c.channel === 'telegram');
      expect(telegramStatus?.configured).toBe(false);
      expect(telegramStatus?.identity).toBeUndefined();
    });

    it('should include Twitter identity when all Twitter env vars are set', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'bearer';
      process.env.TWITTER_API_KEY = 'key';
      process.env.TWITTER_API_SECRET = 'secret';
      process.env.TWITTER_ACCESS_TOKEN = 'token';
      process.env.TWITTER_ACCESS_SECRET = 'token_secret';

      const result = await controller.getStatus();
      const twitterStatus = result.channels.find((c) => c.channel === 'twitter');

      expect(twitterStatus?.configured).toBe(true);
      expect(twitterStatus?.missingEnvVars).toBeUndefined();
    });
  });

  describe('testTwitter', () => {
    it('should return failure when env vars are missing', async () => {
      const result = await controller.testTwitter();

      expect(result.channel).toBe('twitter');
      expect(result.success).toBe(false);
      expect(result.message).toContain('TWITTER_BEARER_TOKEN');
      expect(result.message).toContain('TWITTER_API_KEY');
    });

    it('should return success when all Twitter env vars are set', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'bearer';
      process.env.TWITTER_API_KEY = 'key';
      process.env.TWITTER_API_SECRET = 'secret';
      process.env.TWITTER_ACCESS_TOKEN = 'token';
      process.env.TWITTER_ACCESS_SECRET = 'token_secret';

      const result = await controller.testTwitter();

      expect(result.channel).toBe('twitter');
      expect(result.success).toBe(true);
      expect(result.message).toContain('configured');
      // Should NOT mention any secrets in message
      expect(result.message).not.toContain('bearer');
      expect(result.message).not.toContain('key');
      expect(result.message).not.toContain('secret');
    });
  });

  describe('testTelegram', () => {
    it('should return failure when not configured', async () => {
      const result = await controller.testTelegram();

      expect(result.channel).toBe('telegram');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not configured');
    });
  });
});
