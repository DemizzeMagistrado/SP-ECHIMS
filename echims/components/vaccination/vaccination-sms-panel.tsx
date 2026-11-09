"use client";
import { useAuth } from '@/components/auth/auth-provider'
import { ProgramSmsPanel } from '@/components/sms/program-sms-panel'
import { Spinner } from '@/components/brand/logo-loader'
export function VaccinationSmsPanel({online = true}: {online?: boolean}) {
  const {user, isReady} = useAuth()
  if (!isReady) return <Spinner showLabel label="Checking your session…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
  if (!user) return <p className="text-sm text-muted-foreground">Please sign in to view vaccination SMS reminders.</p>
  return <ProgramSmsPanel key={`${user.id}:VACCINATION`} ownerId={user.id} program="VACCINATION" online={online}/>
}
