// The masterlist upload is a popup in Child Profiling › Children now. This path stays so old
// links (dashboard Imports widget, bookmarks) keep working: it opens the Children tab with the popup.
import { redirect } from 'next/navigation'
export default function MasterlistUploadPage() {
  redirect('/child-profiling/children?masterlist=1')
}
