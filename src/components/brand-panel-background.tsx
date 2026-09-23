// Decorative background for the login brand panel: an abstract graphic
// (dot-grid texture + large gauge-like rings, evoking fuel gauges/tanks)
// with a flat brand-color wash on top – no gradient, matching a
// photo-plus-color-overlay treatment without needing a real photo asset.
export function BrandPanelBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="petrox-dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="white" fillOpacity="0.18" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#petrox-dot-grid)" />
        <circle cx="0%" cy="8%" r="220" fill="none" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" />
        <circle cx="0%" cy="8%" r="150" fill="none" stroke="white" strokeOpacity="0.14" strokeWidth="1.5" />
        <circle cx="102%" cy="96%" r="280" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1.5" />
        <circle cx="102%" cy="96%" r="190" fill="none" stroke="white" strokeOpacity="0.13" strokeWidth="1.5" />
        <circle cx="88%" cy="18%" r="60" fill="white" fillOpacity="0.05" />
      </svg>
      {/* flat color wash on top of the graphic – not a gradient */}
      <div className="absolute inset-0 bg-sidebar/80" />
    </div>
  )
}
