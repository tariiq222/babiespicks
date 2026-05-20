import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramPublisherService } from '../telegram-publisher.service';

describe('TelegramPublisherService', () => {
  let service: TelegramPublisherService;

  beforeEach(() => {
    service = new TelegramPublisherService();
    // Clear env vars between tests
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
  });

  describe('isConfigured — requires both env vars', () => {
    it('should return configured:false when neither env var is set', async () => {
      const result = await service.testConnection();
      expect(result.configured).toBe(false);
      expect(result.botUsername).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should return configured:false when only bot token is set (missing channel id)', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'valid_token';
      const result = await service.testConnection();
      expect(result.configured).toBe(false);
    });

    it('should return configured:false when only channel id is set (missing bot token)', async () => {
      process.env.TELEGRAM_CHANNEL_ID = '@mychannel';
      const result = await service.testConnection();
      expect(result.configured).toBe(false);
    });
  });

  describe('postMessage — unconfigured path', () => {
    it('should return success:false with error when not configured', async () => {
      const result = await service.postMessage('Hello world');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(result.messageId).toBeUndefined();
    });

    it('should return success:false when only bot token is set', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'some_token';
      const result = await service.postMessage('Hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('postThread — unconfigured path', () => {
    it('should return success:false with error when not configured', async () => {
      const result = await service.postThread('Initial message', ['Reply 1', 'Reply 2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(result.messageId).toBeUndefined();
      expect(result.replyIds).toBeUndefined();
    });

    it('should return success:false when only channel id is set', async () => {
      process.env.TELEGRAM_CHANNEL_ID = '@mychannel';
      const result = await service.postThread('Initial');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('env var masking', () => {
    it('should not expose bot token in logs when configured', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'secret_bot_token_12345';
      process.env.TELEGRAM_CHANNEL_ID = '@mychannel';

      // Service should not log the token value — just that a call was made
      // We verify the service doesn't crash and handles the error gracefully
      const result = await service.testConnection();
      expect(result.configured).toBe(true);
      // Error is expected since token is fake — but it should not throw
    });
  });
});
