import { ModulePage } from '@/components/dashboard/module-page'
import ChildHealthPage from '@/app/(dashboard)/children/page'
import NutritionPage from '@/app/(dashboard)/nutrition/page'

export default async function ModuleRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  if (slug.join('/') === 'child-profiling/children') return <ChildHealthPage />
  if (slug.join('/') === 'nutritional-assessment/records') return <NutritionPage />
  return <ModulePage slug={slug} />
}
