export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page title skeleton */}
      <div className="h-8 w-48 bg-opsos-sage-100 rounded" />

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-lg border border-opsos-sage-200 bg-white p-4"
          >
            <div className="h-3 w-20 bg-opsos-sage-100 rounded mb-3" />
            <div className="h-6 w-24 bg-opsos-sage-100 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-opsos-sage-200 bg-white overflow-hidden">
        <div className="h-10 bg-opsos-sage-50 border-b border-opsos-sage-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-opsos-sage-100 px-4 flex items-center gap-4"
          >
            <div className="h-3 w-32 bg-opsos-sage-100 rounded" />
            <div className="h-3 w-20 bg-opsos-sage-100 rounded" />
            <div className="h-3 w-16 bg-opsos-sage-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
