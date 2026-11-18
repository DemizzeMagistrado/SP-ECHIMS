// FINAL-POLISH: the former "Archived Children" tab was merged into the Children
// tab as a view toggle. The /child-profiling/archived path is preserved so that
// existing CHILD_AGE_ARCHIVE notification links keep working — it just redirects
// to the Children tab with the archived view pre-selected.
import { redirect } from 'next/navigation'
export default function ArchivedPage() {
  redirect('/child-profiling/children?view=archived')
}
