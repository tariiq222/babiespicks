import { Injectable, Logger } from '@nestjs/common';

export interface TweetContent {
  text: string;
  mediaUrl?: string;
}

export interface PostResult {
  success: boolean;
  tweetIds: string[];
  error?: string;
}

export interface SinglePostResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

@Injectable()
export class TwitterPublisherService {
  private readonly logger = new Logger(TwitterPublisherService.name);

  private get bearerToken(): string | undefined {
    return process.env.TWITTER_BEARER_TOKEN;
  }

  private get apiKey(): string | undefined {
    return process.env.TWITTER_API_KEY;
  }

  private get apiSecret(): string | undefined {
    return process.env.TWITTER_API_SECRET;
  }

  private get accessToken(): string | undefined {
    return process.env.TWITTER_ACCESS_TOKEN;
  }

  private get accessSecret(): string | undefined {
    return process.env.TWITTER_ACCESS_SECRET;
  }

  private get isConfigured(): boolean {
    return !!(
      this.apiKey &&
      this.apiSecret &&
      this.accessToken &&
      this.accessSecret
    );
  }

  /**
   * Generate OAuth 1.0a authorization header for Twitter API v2 write operations.
   * Twitter API v2 posting requires OAuth 1.0a with user context.
   */
  private async buildOAuthHeader(
    method: string,
    url: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey!,
      oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.accessToken!,
      oauth_version: '1.0',
    };

    // Collect all params for signature base
    const allParams: Record<string, string> = { ...params, ...oauthParams };
    const sortedParams = Object.keys(allParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join('&');

    const signatureBase = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join('&');

    const signingKey = `${encodeURIComponent(this.apiSecret!)}&${encodeURIComponent(this.accessSecret!)}`;

    // HMAC-SHA256 via Web Crypto API (Node 22+)
    const keyData = new TextEncoder().encode(signingKey);
    const msgData = new TextEncoder().encode(signatureBase);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const signature = Buffer.from(sig).toString('base64');

    oauthParams['oauth_signature'] = signature;

    const headerValue =
      'OAuth ' +
      Object.keys(oauthParams)
        .sort()
        .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');

    return headerValue;
  }

  /**
   * Upload an image from a URL to Twitter media upload endpoint and return media_id.
   * Returns null if upload fails.
   */
  async uploadMedia(imageUrl: string): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn('Twitter credentials not configured — skipping media upload');
      return null;
    }

    try {
      // Download the image first
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        this.logger.warn(`Failed to download image from ${imageUrl}: ${imageRes.status}`);
        return null;
      }

      const imageBuffer = await imageRes.arrayBuffer();
      const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
      const totalBytes = imageBuffer.byteLength;

      // Twitter media upload uses v1.1 endpoint (v2 media upload not yet available)
      const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

      const oauthHeader = await this.buildOAuthHeader('POST', uploadUrl);

      // Use multipart form for simple upload
      const formData = new FormData();
      formData.append(
        'media',
        new Blob([imageBuffer], { type: contentType }),
        'media',
      );
      formData.append('total_bytes', totalBytes.toString());
      formData.append('media_type', contentType);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: oauthHeader,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`Twitter media upload failed: ${response.status} — ${errText}`);
        return null;
      }

      const data = (await response.json()) as { media_id_string?: string };
      const mediaId = data.media_id_string ?? null;

      if (mediaId) {
        this.logger.log(`Twitter media uploaded — media_id: ${mediaId}`);
      }

      return mediaId;
    } catch (error) {
      this.logger.error(`Twitter media upload error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Post a single tweet. Optionally attaches media.
   */
  async postSingle(
    text: string,
    mediaUrl?: string,
  ): Promise<SinglePostResult> {
    if (!this.isConfigured) {
      this.logger.warn('Twitter credentials not configured — skipping tweet');
      return { success: false, error: 'Twitter credentials not configured' };
    }

    try {
      let mediaId: string | undefined;
      if (mediaUrl) {
        const uploaded = await this.uploadMedia(mediaUrl);
        if (uploaded) {
          mediaId = uploaded;
        }
      }

      const tweetUrl = 'https://api.twitter.com/2/tweets';
      const oauthHeader = await this.buildOAuthHeader('POST', tweetUrl);

      const body: Record<string, unknown> = { text };
      if (mediaId) {
        body.media = { media_ids: [mediaId] };
      }

      const response = await fetch(tweetUrl, {
        method: 'POST',
        headers: {
          Authorization: oauthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`Twitter postSingle failed: ${response.status} — ${errText}`);
        return { success: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const data = (await response.json()) as { data?: { id: string } };
      const tweetId = data.data?.id;

      this.logger.log(`Tweet posted — id: ${tweetId}`);
      return { success: true, tweetId };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.error(`Twitter postSingle error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Post a thread of tweets. First tweet is standalone; each subsequent tweet
   * replies to the previous one in the chain.
   */
  async postThread(tweets: TweetContent[]): Promise<PostResult> {
    if (!this.isConfigured) {
      this.logger.warn('Twitter credentials not configured — skipping thread');
      return { success: false, tweetIds: [], error: 'Twitter credentials not configured' };
    }

    if (tweets.length === 0) {
      return { success: false, tweetIds: [], error: 'No tweets provided' };
    }

    const tweetIds: string[] = [];

    try {
      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        let mediaId: string | undefined;

        if (tweet.mediaUrl) {
          const uploaded = await this.uploadMedia(tweet.mediaUrl);
          if (uploaded) {
            mediaId = uploaded;
          }
        }

        const tweetUrl = 'https://api.twitter.com/2/tweets';
        const oauthHeader = await this.buildOAuthHeader('POST', tweetUrl);

        const body: Record<string, unknown> = { text: tweet.text };

        // Reply to the previous tweet to form a thread
        if (tweetIds.length > 0) {
          body.reply = { in_reply_to_tweet_id: tweetIds[tweetIds.length - 1] };
        }

        if (mediaId) {
          body.media = { media_ids: [mediaId] };
        }

        const response = await fetch(tweetUrl, {
          method: 'POST',
          headers: {
            Authorization: oauthHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          this.logger.warn(
            `Thread tweet ${i + 1}/${tweets.length} failed: ${response.status} — ${errText}`,
          );
          return {
            success: false,
            tweetIds,
            error: `Tweet ${i + 1} failed: HTTP ${response.status}: ${errText}`,
          };
        }

        const data = (await response.json()) as { data?: { id: string } };
        const tweetId = data.data?.id;
        if (!tweetId) {
          return {
            success: false,
            tweetIds,
            error: `Tweet ${i + 1} returned no id`,
          };
        }

        tweetIds.push(tweetId);
        this.logger.log(`Thread tweet ${i + 1}/${tweets.length} posted — id: ${tweetId}`);

        // Small delay between tweets to avoid rate limits
        if (i < tweets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      return { success: true, tweetIds };
    } catch (error) {
      const msg = (error as Error).message;
      this.logger.error(`Twitter postThread error: ${msg}`);
      return { success: false, tweetIds, error: msg };
    }
  }
}
