import { HomeLink, StatusPage } from '@/components/ui/status-page'

// Renders inside the dashboard layout, so the sidebar and top bar stay; only signed-in users get here.
export default function DashboardNotFound() {
  return <StatusPage area="content" code="404" title="We couldn't find that page" message="The link may be old, or the page may have moved. Use the sidebar or head back to your dashboard." actions={<HomeLink signedIn />} />
}
