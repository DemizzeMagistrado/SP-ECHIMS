export function object(value:unknown):value is Record<string,unknown> {return !!value && typeof value==='object' && !Array.isArray(value)}
export function positive(value:unknown):value is number {return typeof value==='number' && Number.isSafeInteger(value) && value>0}
export function uuid(value:unknown):value is string {return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}
export function notes(value:unknown):value is string {return typeof value==='string' && value.trim().length>0 && value.length<=2000}
export function failureStatus(code:string) {return code==='42501'?403:['40001','23505'].includes(code)?409:['22023','22007','22008','23514','23502','23503'].includes(code)?400:500}
