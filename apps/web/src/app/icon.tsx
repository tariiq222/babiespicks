import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6B8E7F',
          borderRadius: 6,
          color: '#FAF8F5',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        BP
      </div>
    ),
    { ...size }
  );
}