import { notFound } from 'next/navigation'
import ChildHealthPage from '@/app/(dashboard)/children/page'
import ChildProfilePage from '@/app/(dashboard)/children/[childId]/page'
import NutritionPage from '@/app/(dashboard)/nutrition/page'

export default async function ModuleRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = slug.join('/')

  // URL aliases kept so sidebar/manuscript URLs keep working.
  if (path === 'child-profiling/children') return <ChildHealthPage />
  if (slug[0] === 'child-profiling' && slug[1] === 'children' && slug.length === 3) {
    return <ChildProfilePage params={Promise.resolve({ childId: slug[2] })} />
  }
  if (path === 'nutritional-assessment/records') return <NutritionPage />

  notFound()
}