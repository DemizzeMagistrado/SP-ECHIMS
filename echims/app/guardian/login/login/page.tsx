import { redirect } from 'next/navigation'
import { GuardianLogin } from '@/components/guardian/guardian-login'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string; registered?: string }> }) {
  if (process.env.GUARDIAN_PORTAL_ENABLED !== 'true') return <main className="p-8 text-center">Guardian access is not available yet.</main>
  const { mode, registered } = await searchParams
  if (mode === 'register') redirect('/guardian/register')
  return <GuardianLogin registered={registered === '1'} />
}
