export function PrimaryButton({
  children,
  onClick,
  full = false,
  icon,
  size = 'md',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
  icon?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'bg-sage text-cream rounded-lg transition-colors inline-flex items-center justify-center gap-2',
        'hover:bg-sage-hover active:bg-sage-active',
        size === 'lg' ? 'px-6 py-[14px] text-[15px]' : 'px-4 py-3 text-[14px]',
        full && 'w-full',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{children}</span>
      {icon && <i className={`ti ${icon} text-[16px]`}></i>}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  full = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'border border-sage text-sage rounded-lg px-4 py-2 text-[13px] hover:bg-sage-hover-bg transition-colors',
        full && 'w-full',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
