'use client';

import Image from 'next/image';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 36, className = '' }: LogoMarkProps) {
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 rounded-[22%] bg-sage shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/babiespicks-logo.png"
        alt="BabiesPicks"
        width={size}
        height={size}
        className="object-cover"
        priority
      />
    </div>
  );
}
