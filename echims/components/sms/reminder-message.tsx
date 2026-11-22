export function ReminderMessage({ body, live }: { body: string; live?: boolean }) {
  // These are the header and footer already used in the eCHIMS iProg preview.
  const text = live ? `eCHIMS: ${body}\nPlease do not reply.` : body
  return <span className="block whitespace-pre-wrap">
    <span className="block">{text}</span>
    {live && <span className="mt-2 block text-xs text-brand-muted">{[...text].length} characters with header and footer</span>}
  </span>
}
