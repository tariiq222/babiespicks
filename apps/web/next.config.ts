import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@babiespicks/shared-types', '@babiespicks/ui'],
};

export default nextConfig;
