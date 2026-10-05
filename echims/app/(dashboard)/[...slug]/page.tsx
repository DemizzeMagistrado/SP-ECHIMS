import { ModulePage } from '@/components/dashboard/module-page'
import ChildHealthPage from '@/app/(dashboard)/children/page'
import ChildProfilePage from '@/app/(dashboard)/children/[childId]/page'
import NutritionPage from '@/app/(dashboard)/nutrition/page'

export default async function ModuleRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = slug.join('/')
  if (path === 'child-profiling/children') return <ChildHealthPage />
  // Dynamic child profile under the canonical module path so the sidebar + tab indicators
  // stay highlighted while viewing a single child (/child-profiling/children/<id>).
  if (slug[0] === 'child-profiling' && slug[1] === 'children' && slug.length === 3) {
    return <ChildProfilePage params={Promise.resolve({ childId: slug[2] })} />
  }
  if (path === 'nutritional-assessment/records') return <NutritionPage />
  return <ModulePage slug={slug} />
}