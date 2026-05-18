import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #6B8E7F 0%, #4d6c60 100%)',
            borderRadius: '22%',
            color: '#FAF8F5',
            fontSize: 72,
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