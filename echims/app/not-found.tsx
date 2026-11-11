import { createClient } from '@/lib/supabase/server'
import { LoadingGate } from '@/components/brand/loading-gate'
import { HomeLink, StatusPage } from '@/components/ui/status-page'

export default async function NotFound() {
  let signedIn = false
  try {
    const supabase = await createClient()
    signedIn = !!(await supabase.auth.getUser()).data.user
  } catch {
    // No session available: treat as signed out.
  }
  return (
    <main className="bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)]">
      <LoadingGate ready doneLabel="">
        <StatusPage code="404" title="We couldn't find that page" message="The link may be old, or the page may have moved. Check the address, or head back and pick up where you left off." actions={<HomeLink signedIn={signedIn} />} />
      </LoadingGate>
    </main>
  )
}
