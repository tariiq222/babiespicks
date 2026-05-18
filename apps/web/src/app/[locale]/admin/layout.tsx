export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-linen">
      {/* Admin Header */}
      <header className="bg-charcoal text-cream">
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sage text-cream flex items-center justify-center text-sm font-medium">
            ب
          </div>
          <div>
            <h1 className="text-sm font-medium text-cream leading-none">لوحة التحكم</h1>
            <p className="text-[11px] text-sage mt-0.5">BabiesPicks Admin</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-8">
        {children}
      </main>
    </div>
  );
}