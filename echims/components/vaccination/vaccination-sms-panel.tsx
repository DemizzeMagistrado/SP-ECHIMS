"use client";
import { useAuth } from '@/components/auth/auth-provider'
import { ProgramSmsPanel } from '@/components/sms/program-sms-panel'
import { LogoLoader } from '@/components/brand/logo-loader'
export function VaccinationSmsPanel({online = true}: {online?: boolean}) {
  const {user, isReady} = useAuth()
  if (!isReady) return <LogoLoader label="Checking your session…" />
  if (!user) return <p className="text-sm text-muted-foreground">Please sign in to view vaccination SMS reminders.</p>
  return <ProgramSmsPanel key={`${user.id}:VACCINATION`} ownerId={user.id} program="VACCINATION" online={online}/>
}
