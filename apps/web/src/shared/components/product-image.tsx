export function ProductImage({
  src,
  alt = 'صورة المنتج',
  width = 120,
  height = 120,
  radius = 10,
}: {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  radius?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="object-contain"
        style={{ borderRadius: radius }}
      />
    );
  }

  return (
    <div
      className="placeholder-stripe flex items-center justify-center text-[10px] text-stone/50 font-mono"
      style={{ width, height, borderRadius: radius, aspectRatio: `${width}/${height}` }}
    >
      {alt}
    </div>
  );
}
