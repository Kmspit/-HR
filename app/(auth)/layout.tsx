export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Animated gradient blobs */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px] animate-float" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px] animate-float [animation-delay:1.5s]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-cyan-600/10 blur-[100px] animate-float [animation-delay:3s]" />
      </div>

      {/* Noise overlay */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.03] [background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.03%22/%3E%3C/svg%3E')]" />

      {/* Grid pattern */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.02]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

      <div className="relative z-10">{children}</div>
    </div>
  )
}
