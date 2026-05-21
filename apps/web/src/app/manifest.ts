import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BabiesPicks - مراجعات منتجات الأطفال',
    short_name: 'BabiesPicks',
    description: 'AI-powered baby product reviews for Saudi families',
    start_url: '/ar',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#6B8E7F',
    orientation: 'portrait',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      { src: '/babiespicks-logo.png', sizes: '192x192', type: 'image/png' },
      { src: '/babiespicks-logo.png', sizes: '512x512', type: 'image/png' },
      { src: '/babiespicks-logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['shopping', 'lifestyle'],
  };
}
