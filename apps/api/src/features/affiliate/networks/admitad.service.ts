import { Injectable } from '@nestjs/common';

export interface AdmitadStore {
  affiliateNetwork: string | null;
}

@Injectable()
export class AdmitadService {
  private readonly campaignCode: string;

  constructor() {
    this.campaignCode = process.env.ADMITAD_CAMPAIGN_CODE ?? 'CAMPAIGN';
  }

  /**
   * Wraps a product URL in an Admitad deep link for attribution tracking.
   * Format: https://ad.admitad.com/g/CAMPAIGN_CODE/?ulp=ENCODED_PRODUCT_URL
   */
  generateDeepLink(productUrl: string): string {
    const encoded = encodeURIComponent(productUrl);
    return `https://ad.admitad.com/g/${this.campaignCode}/?ulp=${encoded}`;
  }

  /**
   * Returns true if the store's affiliate network is Admitad.
   */
  isAdmitadStore(store: AdmitadStore): boolean {
    return store.affiliateNetwork === 'Admitad';
  }
}
