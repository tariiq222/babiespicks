import Image from 'next/image';

export function ProductImage({
  src,
  alt = 'Product image',
  width = 120,
  height = 120,
  radius = 10,
  priority = false,
}: {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  radius?: number;
  priority?: boolean;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="object-contain"
        style={{ borderRadius: radius }}
        priority={priority}
        sizes="(max-width: 768px) 50vw, 25vw"
      />
    );
  }

  return (
    <div
      className="placeholder-stripe flex items-center justify-center text-[11px] text-stone/50 font-mono"
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
