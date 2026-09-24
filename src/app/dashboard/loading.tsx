export default function DashboardLoading() {
  return (
    <main className="dashboard-loading" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <p>Loading your workspace…</p>
    </main>
  );
}
