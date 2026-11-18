export type GuardianChild = {
  childId: number; childCode: string | null; firstName: string; middleName: string | null; lastName: string;
  dateOfBirth: string; sex: string | null; address: string | null; birthWeightKg: number | null; birthLengthCm: number | null;
}
export type GuardianContext = { currentUserId: string; registered: boolean; linked: boolean; name?: string; message?: string; children: GuardianChild[] }
export type HistoryRecord = { id: number; date: string; name: string; status: string | null; dose?: number; batch?: string; weightKg?: number; heightCm?: number; muacCm?: number; weightForAge?: string; heightForAge?: string; weightForHeight?: string; doseValue?: number; doseUnit?: string; quantity?: number; completedOn?: string }
export const guardianPrograms = [
  { key: 'vaccination', label: 'Vaccinations' }, { key: 'nutrition', label: 'Nutrition' },
  { key: 'supplementation', label: 'Supplementation' }, { key: 'checkups', label: 'Follow-up checkups' },
] as const
export type GuardianProgram = typeof guardianPrograms[number]['key']
export const childName = (child: GuardianChild) => [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ')
