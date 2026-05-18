export function CategoryTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-lavender text-lavender-text text-[11px] px-3 py-[3px] rounded-full">
      {children}
    </span>
  );
}

export function DiscountTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-terracotta text-cream text-[11px] px-2 py-[2px] rounded-lg font-medium">
      {children}
    </span>
  );
}
