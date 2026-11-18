import {householdFailure} from '@/lib/household-access'
export async function POST(){return householdFailure('Direct household moves are retired. Submit a transfer request through /api/child-transfers.',410)}
