import { GuardianPortal } from '@/components/guardian/guardian-portal'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.GUARDIAN_PORTAL_ENABLED !== 'true') return <main className="p-8 text-center">Guardian access is not available yet.</main>
  return <GuardianPortal />
}
