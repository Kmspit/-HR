export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-slate-950">
      {/* Defense-in-depth for the iOS white-flash bug (see app/styles/base.css
          body.auth-bg): synchronous inline script so <body> gets the dark
          background before hydration, not after — avoids a flash on first paint.
          Safe to run on every mount: navigation away from (auth) to (dashboard) in
          this app always happens via a hard reload (window.location.href / signOut),
          never a client-side soft-nav across the two route groups, so a fresh
          document is guaranteed and there's nothing to clean up on unmount. */}
      <script dangerouslySetInnerHTML={{ __html: "document.body.classList.add('auth-bg')" }} />

      {/* Decorative background layer — overflow-hidden lives HERE now, not on
          the outer wrapper above. It used to sit there (see git blame) to
          contain these blobs' negative-offset bleed, but that also capped
          the whole page's vertical scroll at one viewport — harmless while
          every auth page fit on one screen, but it silently broke /register
          once Phase 1 grew that form past a single viewport's height. absolute
          (not fixed) so this layer's own height tracks the page's real
          scrollable height rather than just one viewport — these blobs scroll
          with the page now instead of staying pinned, which is fine since
          they're purely decorative. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-green-600/20 blur-[120px] animate-float" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px] animate-float [animation-delay:1.5s]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-cyan-600/10 blur-[100px] animate-float [animation-delay:3s]" />

        {/* Noise overlay */}
        <div className="absolute inset-0 opacity-[0.03] [background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.03%22/%3E%3C/svg%3E')]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  )
}
