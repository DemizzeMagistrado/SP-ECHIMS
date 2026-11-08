// Re-mounts on every dashboard navigation, so each page eases in instead of popping.
// No fill-mode: once the 300ms entrance ends, nothing stays applied, so fixed-position
// modals inside pages keep positioning against the viewport.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none">
      {children}
    </div>
  )
}
