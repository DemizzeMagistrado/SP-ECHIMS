import { GuardianRegister } from '@/components/guardian/guardian-register'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ activate?: string }> }) {
  if (process.env.GUARDIAN_PORTAL_ENABLED !== 'true') return <main className="p-8 text-center">Guardian access is not available yet.</main>
  return <GuardianRegister activation={(await searchParams).activate === '1'} />
}
