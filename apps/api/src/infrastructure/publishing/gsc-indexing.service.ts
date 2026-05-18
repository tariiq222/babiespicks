import { Injectable, Logger } from '@nestjs/common';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

@Injectable()
export class GscIndexingService {
  private readonly logger = new Logger(GscIndexingService.name);

  private readonly INDEXING_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
  private readonly TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

  /**
   * Request indexing for a single URL via the Google Indexing API.
   * If GOOGLE_SERVICE_ACCOUNT_JSON is not set, logs a warning and skips.
   */
  async requestIndexing(url: string): Promise<void> {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      this.logger.warn('GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping Google Indexing API request');
      return;
    }

    let serviceAccount: ServiceAccountKey;
    try {
      serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccountKey;
    } catch {
      this.logger.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — skipping Google Indexing API request');
      return;
    }

    try {
      const accessToken = await this.getAccessToken(serviceAccount);
      await this.submitUrl(url, accessToken);
      this.logger.log(`Google Indexing API: submitted ${url}`);
    } catch (error) {
      this.logger.error(`Google Indexing API failed for ${url}: ${(error as Error).message}`);
    }
  }

  private async getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;
    const scope = 'https://www.googleapis.com/auth/indexing';

    // Build JWT header + claim set
    const header = this.base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claimSet = this.base64url(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope,
        aud: this.TOKEN_ENDPOINT,
        exp: expiry,
        iat: now,
      }),
    );

    const signingInput = `${header}.${claimSet}`;

    // Sign with the private key using Web Crypto API (Node 22+)
    const signature = await this.signRS256(signingInput, serviceAccount.private_key);
    const jwt = `${signingInput}.${signature}`;

    const response = await fetch(this.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return data.access_token;
  }

  private async submitUrl(url: string, accessToken: string): Promise<void> {
    const response = await fetch(this.INDEXING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Indexing API responded ${response.status}: ${text}`);
    }
  }

  private base64url(str: string): string {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async signRS256(input: string, privateKeyPem: string): Promise<string> {
    const crypto = globalThis.crypto;

    // Import PEM private key
    const pemBody = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');

    const binaryKey = Buffer.from(pemBody, 'base64');

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, Buffer.from(input));

    return Buffer.from(signature).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
