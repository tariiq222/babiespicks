import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'BabiesPicks - مراجعات منتجات الأمومة والطفل';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #E8EFE9 0%, #FAF8F5 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            height: 120,
            borderRadius: '22%',
            background: '#6B8E7F',
            color: '#FAF8F5',
            fontSize: 52,
            fontWeight: 700,
            marginBottom: 32,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          BP
        </div>
        <div style={{ fontSize: 64, color: '#2D3A35', letterSpacing: '-0.02em' }}>
          BabiesPicks
        </div>
        <div style={{ fontSize: 32, color: '#6B8E7F', marginTop: 16 }}>
          بيبيز بيكس
        </div>
        <div
          style={{
            fontSize: 22,
            color: '#5F6660',
            marginTop: 24,
            maxWidth: 600,
            textAlign: 'center',
          }}
        >
          Honest baby product reviews powered by AI
        </div>
      </div>
    ),
    { ...size }
  );
}