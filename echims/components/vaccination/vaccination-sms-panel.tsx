"use client";
import { useAuth } from '@/components/auth/auth-provider'
import { ProgramSmsPanel } from '@/components/sms/program-sms-panel'
export function VaccinationSmsPanel({online = true}: {online?: boolean}) {
  const {user, isReady} = useAuth()
  if (!isReady) return <p className="text-sm text-muted-foreground">Checking your session…</p>
  if (!user) return <p className="text-sm text-muted-foreground">Please sign in to view vaccination SMS reminders.</p>
  return <ProgramSmsPanel key={`${user.id}:VACCINATION`} ownerId={user.id} program="VACCINATION" online={online}/>
}
