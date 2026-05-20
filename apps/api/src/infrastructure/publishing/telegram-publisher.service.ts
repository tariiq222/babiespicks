import { Injectable, Logger } from '@nestjs/common';

export interface TelegramPostResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

@Injectable()
export class TelegramPublisherService {
  private readonly logger = new Logger(TelegramPublisherService.name);

  private get botToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private get channelId(): string | undefined {
    return process.env.TELEGRAM_CHANNEL_ID;
  }

  private get isConfigured(): boolean {
    return !!(this.botToken && this.channelId);
  }

  /**
   * Test the Telegram bot connection by calling getMe.
   * Returns masked ok status — never logs or returns secrets.
   */
  async testConnection(): Promise<{ configured: boolean; botUsername?: string; error?: string }> {
    if (!this.isConfigured) {
      return { configured: false };
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getMe`,
      );

      if (!res.ok) {
        // Sanitized: log raw response server-side only; return generic error to browser
        const errText = await res.text();
        this.logger.warn(`Telegram getMe failed: ${res.status} — ${errText}`);
        return { configured: true, error: 'Telegram connection test failed. Check bot token and channel ID configuration.' };
      }

      const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
      if (!data.ok || !data.result?.username) {
        return { configured: true, error: 'Bot not found' };
      }

      this.logger.log(`Telegram bot @${data.result.username} connection OK`);
      return { configured: true, botUsername: data.result.username };
    } catch (error) {
      // Sanitized: log full error server-side; return generic to browser
      const msg = (error as Error).message;
      this.logger.error(`Telegram testConnection error: ${msg}`);
      return { configured: true, error: 'Telegram connection error. Check bot token and network access.' };
    }
  }

  /**
   * Post a message to the configured Telegram channel.
   * @param text Message text (max 4096 chars per Telegram limit)
   */
  async postMessage(text: string): Promise<TelegramPostResult> {
    if (!this.isConfigured) {
      this.logger.warn('Telegram not configured — skipping message');
      return { success: false, error: 'Telegram credentials not configured' };
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.channelId,
            text,
          }),
        },
      );

      if (!res.ok) {
        // Sanitized: log raw response server-side only; return generic error to caller
        const errText = await res.text();
        this.logger.warn(`Telegram sendMessage failed: ${res.status} — ${errText}`);
        return { success: false, error: 'Telegram message send failed. Check bot token and channel configuration.' };
      }

      const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
      const messageId = data.result?.message_id;

      this.logger.log(`Telegram message sent — messageId: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      // Sanitized: log full error server-side; return generic to browser
      const msg = (error as Error).message;
      this.logger.error(`Telegram postMessage error: ${msg}`);
      return { success: false, error: 'Telegram message send error. Check bot token and network access.' };
    }
  }

  /**
   * Post a thread: sends an initial message then replies to it with each comment.
   * @param initialText The first message
   * @param comments Ordered array of follow-up replies
   */
  async postThread(initialText: string, comments: string[] = []): Promise<TelegramPostResult & { messageId?: number; replyIds?: number[] }> {
    if (!this.isConfigured) {
      this.logger.warn('Telegram not configured — skipping thread');
      return { success: false, error: 'Telegram credentials not configured' };
    }

    try {
      // Send the initial message
      const initialRes = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.channelId,
            text: initialText,
          }),
        },
      );

      if (!initialRes.ok) {
        // Sanitized: log raw response server-side only; return generic error to caller
        const errText = await initialRes.text();
        this.logger.warn(`Telegram thread initial message failed: ${initialRes.status} — ${errText}`);
        return { success: false, error: 'Telegram thread send failed. Check bot token and channel configuration.' };
      }

      const initialData = (await initialRes.json()) as { ok: boolean; result?: { message_id: number } };
      const messageId = initialData.result?.message_id;

      if (!messageId) {
        return { success: false, error: 'No message_id returned' };
      }

      this.logger.log(`Telegram thread initial message sent — messageId: ${messageId}`);

      // Send follow-up replies
      const replyIds: number[] = [];

      for (let i = 0; i < comments.length; i++) {
        const commentRes = await fetch(
          `https://api.telegram.org/bot${this.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: this.channelId,
              text: comments[i],
              reply_to_message_id: messageId,
            }),
          },
        );

        if (!commentRes.ok) {
          const errText = await commentRes.text();
          this.logger.warn(`Telegram thread reply ${i + 1} failed: ${commentRes.status} — ${errText}`);
          return {
            success: false,
            messageId,
            error: `Telegram reply ${i + 1} failed. Check bot token and channel configuration.`,
            replyIds,
          };
        }

        const commentData = (await commentRes.json()) as { ok: boolean; result?: { message_id: number } };
        replyIds.push(commentData.result?.message_id ?? 0);
      }

      return { success: true, messageId, replyIds };
    } catch (error) {
      // Sanitized: log full error server-side; return generic to browser
      const msg = (error as Error).message;
      this.logger.error(`Telegram postThread error: ${msg}`);
      return { success: false, error: 'Telegram thread send error. Check bot token and network access.' };
    }
  }
}
