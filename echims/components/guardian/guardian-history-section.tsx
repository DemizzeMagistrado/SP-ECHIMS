'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/children/child-profile-cards'
import { guardianDate, guardianLabel } from './guardian-child-profile'
import type { GuardianProgram, HistoryRecord } from '@/lib/guardian/types'

const sectionTitles: Record<GuardianProgram, string> = {
  vaccination: 'Vaccination history',
  nutrition: 'Nutrition history',
  supplementation: 'Supplementation',
  checkups: 'Checkups',
}

type HistoryResponse = {
  currentUserId?: string
  records?: HistoryRecord[]
  nextBeforeId?: number | null
  error?: string
}

function recordDetails(program: GuardianProgram, record: HistoryRecord) {
  const details: string[] = []
  if (program === 'vaccination') {
    if (record.dose != null) details.push(`Dose ${record.dose}`)
    if (record.batch) details.push(`Batch ${record.batch}`)
  } else if (program === 'nutrition') {
    if (record.weightKg != null) details.push(`Weight ${record.weightKg} kg`)
    if (record.heightCm != null) details.push(`Height ${record.heightCm} cm`)
    if (record.muacCm != null) details.push(`MUAC ${record.muacCm} cm`)
    if (record.weightForAge) details.push(`Weight-for-age ${guardianLabel(record.weightForAge)}`)
    if (record.heightForAge) details.push(`Height-for-age ${guardianLabel(record.heightForAge)}`)
    if (record.weightForHeight) details.push(`Weight-for-height ${guardianLabel(record.weightForHeight)}`)
  } else if (program === 'supplementation') {
    if (record.doseValue != null) details.push(`Dose ${record.doseValue}${record.doseUnit ? ` ${record.doseUnit}` : ''}`)
    if (record.quantity != null) details.push(`Quantity ${record.quantity}`)
  } else if (record.completedOn) {
    details.push(`Completed ${guardianDate(record.completedOn)}`)
  }
  return details.length ? details.join(' · ') : '—'
}

export function GuardianHistorySection({
  childId,
  ownerId,
  program,
  onAccessChanged,
}: {
  childId: number
  ownerId: string
  program: GuardianProgram
  onAccessChanged: () => void
}) {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [failedBefore, setFailedBefore] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const load = useCallback(async (before: number | null = null) => {
    const turn = ++generation.current
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    setFailedBefore(null)
    if (before === null) {
      setRecords([])
      setCursor(null)
    }

    try {
      const query = new URLSearchParams({ program })
      if (before !== null) query.set('beforeId', String(before))
      const response = await fetch(`/api/guardian/children/${childId}?${query}`, {
        cache: 'no-store',
        signal: request.signal,
      })
      const result: HistoryResponse = await response.json()
      if (turn !== generation.current) return
      if ([401, 403, 404].includes(response.status) || (response.ok && result.currentUserId !== ownerId)) {
        onAccessChanged()
        return
      }
      if (!response.ok || !Array.isArray(result.records)) {
        throw new Error(result.error || 'Unable to load history.')
      }

      setRecords(previous => before === null ? result.records! : [...previous, ...result.records!])
      setCursor(typeof result.nextBeforeId === 'number' ? result.nextBeforeId : null)
    } catch (problem) {
      if (request.signal.aborted || turn !== generation.current) return
      setError(problem instanceof Error ? problem.message : 'Unable to load history.')
      setFailedBefore(before)
    } finally {
      if (!request.signal.aborted && turn === generation.current) setBusy(false)
    }
  }, [childId, onAccessChanged, ownerId, program])

  useEffect(() => {
    void load()
    return () => {
      generation.current++
      controller.current?.abort()
    }
  }, [load])

  const title = sectionTitles[program]
  return (
    <div id={`${program}-history`} className="scroll-mt-[var(--subnav-offset,8rem)]">
      <SectionCard title={title} subtitle="Recorded services and appointments">
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => void load(failedBefore)}>Try again</Button>
          </div>
        )}
        {busy && records.length === 0 && <p role="status" className="py-8 text-center text-sm text-brand-muted">Loading {title.toLowerCase()}…</p>}
        {!busy && !error && records.length === 0 && (
          <p className="py-8 text-center text-sm text-brand-muted">No recorded {title.toLowerCase()} yet.</p>
        )}
        {records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-brand-line text-xs uppercase tracking-wide text-brand-muted">
                  <th scope="col" className="px-3 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Record</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Details</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-line">
                {records.map(record => (
                  <tr key={record.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 text-brand-muted">{guardianDate(record.date)}</td>
                    <td className="px-3 py-3 font-medium text-brand-navy">{record.name}</td>
                    <td className="px-3 py-3 text-brand-muted">{recordDetails(program, record)}</td>
                    <td className="px-3 py-3 text-brand-muted">{guardianLabel(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {busy && records.length > 0 && <p role="status" className="mt-4 text-sm text-brand-muted">Loading more records…</p>}
        {cursor !== null && !error && (
          <Button className="mt-4" variant="secondary" loading={busy} onClick={() => void load(cursor)}>
            Load more records
          </Button>
        )}
        {program === 'vaccination' && (
          <p className="mt-4 text-xs text-brand-muted">Only approved vaccination records are displayed. Records awaiting staff review are excluded.</p>
        )}
      </SectionCard>
    </div>
  )
}
