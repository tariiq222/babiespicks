import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/:locale(ar|en)/tools/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/best/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/compare/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/categories/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/guides/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/reviews/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/search/:path*', destination: '/:locale', permanent: false },
      { source: '/:locale(ar|en)/faq/:path*', destination: '/:locale/about', permanent: false },
      { source: '/:locale(ar|en)/contact/:path*', destination: '/:locale/about', permanent: false },
      { source: '/:locale(ar|en)/offers', destination: '/:locale', permanent: false },
    ];
  },
  transpilePackages: ['@babiespicks/db', '@babiespicks/domain'],
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
    remotePatterns: [
      { protocol: 'https', hostname: '**.babiespicks.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
    ],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
