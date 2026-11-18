import { PageGate } from '@/components/brand/page-gate'

// Re-mounts on every dashboard navigation, so only the content area transitions; the sidebar and
// top bar live in the layout and stay still. PageGate holds the page until its first data is in.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageGate>{children}</PageGate>
}
