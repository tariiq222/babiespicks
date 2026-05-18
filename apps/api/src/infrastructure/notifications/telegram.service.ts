import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private get botToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private get chatId(): string | undefined {
    return process.env.TELEGRAM_CHAT_ID;
  }

  private get isConfigured(): boolean {
    return !!(this.botToken && this.chatId);
  }

  /**
   * Send a raw text message to the configured Telegram chat.
   */
  async sendMessage(text: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Telegram credentials not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — skipping message');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`Telegram sendMessage failed: ${response.status} — ${errText}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Telegram sendMessage error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Send a formatted alert with severity emoji.
   */
  async sendAlert(
    title: string,
    body: string,
    severity: 'info' | 'warning' | 'critical',
  ): Promise<boolean> {
    const emoji =
      severity === 'critical' ? '🔴' : severity === 'warning' ? '⚠️' : 'ℹ️';
    const text = `${emoji} <b>${this.escape(title)}</b>\n\n${this.escape(body)}`;
    return this.sendMessage(text);
  }

  /**
   * Notify that items are waiting in the approval queue.
   */
  async notifyApprovalQueue(count: number): Promise<boolean> {
    const text = `🔔 <b>طابور الموافقات</b>\n${count} عنصر بانتظار الموافقة`;
    return this.sendMessage(text);
  }

  /**
   * Notify that a circuit breaker has tripped.
   */
  async notifyCircuitBreaker(name: string, reason: string): Promise<boolean> {
    const text = `🔴 <b>Circuit Breaker Tripped: ${this.escape(name)}</b>\n${this.escape(reason)}`;
    return this.sendMessage(text);
  }

  /**
   * Notify that content was successfully published.
   */
  async notifyPublished(title: string, url: string): Promise<boolean> {
    const text = `✅ <b>نُشر:</b> ${this.escape(title)}\n<a href="${url}">${url}</a>`;
    return this.sendMessage(text);
  }

  /**
   * Escape HTML special characters to avoid breaking Telegram HTML parse mode.
   */
  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
