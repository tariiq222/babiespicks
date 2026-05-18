import Image from 'next/image';

export function ProductImage({
  src,
  alt = 'Product image',
  width = 120,
  height = 120,
  radius = 10,
  priority = false,
  fill = false,
  className = '',
  quality = 90,
  sizes,
}: {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  radius?: number;
  priority?: boolean;
  fill?: boolean;
  className?: string;
  quality?: number;
  sizes?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        fill={fill}
        className={className || 'object-contain'}
        style={{ borderRadius: radius }}
        priority={priority}
        quality={quality}
        sizes={sizes ?? '(max-width: 768px) 50vw, 25vw'}
      />
    );
  }

  return (
    <div
      className={`placeholder-stripe flex items-center justify-center text-[11px] text-stone/50 font-mono ${className}`}
      style={{
        width: width >= 500 ? '100%' : width,
        height,
        borderRadius: radius,
        aspectRatio: `${width}/${height}`,
      }}
    >
      {alt}
    </div>
  );
}
