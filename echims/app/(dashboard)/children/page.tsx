'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Search, Plus, X, Eye, Edit3 } from 'lucide-react'

type ChildProfile = {
  id: string
  householdNumber: string
  name: string
  relationship: string
  barangay: string
  address: string
  dob: string
  age: string
  sex: string
  civilStatus: string
  education: string
  religion: string
  ethnicity: string
  fourPs: string
  philhealthId: string
  philhealthType: string
  philhealthCategory: string
  medicalHistory: string
  risk: string
  lmp: string
  waterSource: string
  toiletFacility: string
  status: string
}

const initialChildren: ChildProfile[] = [
  { id: 'CH-2025-001', householdNumber: 'HH-0182', name: 'Maria Santos', relationship: 'Daughter', barangay: 'San Isidro', address: 'Purok 2, San Isidro', dob: '2022-04-15', age: '2 yrs 4 mos', sex: 'Female', civilStatus: 'Single', education: 'Not applicable', religion: 'Roman Catholic', ethnicity: 'Tagalog', fourPs: 'Yes', philhealthId: 'PH-88219', philhealthType: 'Sponsored', philhealthCategory: '4Ps', medicalHistory: 'No known history', risk: 'Normal', lmp: '', waterSource: 'Level II communal faucet', toiletFacility: 'Sanitary toilet', status: 'Under Monitoring' },
  { id: 'CH-2025-002', householdNumber: 'HH-0247', name: 'Juan Dela Cruz', relationship: 'Son', barangay: 'Poblacion', address: 'Purok 5, Poblacion', dob: '2023-01-22', age: '1 yr 8 mos', sex: 'Male', civilStatus: 'Single', education: 'Not applicable', religion: 'Roman Catholic', ethnicity: 'Cebuano', fourPs: 'No', philhealthId: '', philhealthType: 'None', philhealthCategory: 'None', medicalHistory: 'Recurrent cough', risk: 'At Risk', lmp: '', waterSource: 'Deep well', toiletFacility: 'Shared toilet', status: 'Needs Follow-up' },
]

const emptyProfile: ChildProfile = { id: '', householdNumber: '', name: '', relationship: '', barangay: '', address: '', dob: '', age: '', sex: '', civilStatus: 'Single', education: '', religion: '', ethnicity: '', fourPs: 'No', philhealthId: '', philhealthType: 'None', philhealthCategory: 'None', medicalHistory: '', risk: 'Normal', lmp: '', waterSource: '', toiletFacility: '', status: 'Active' }

const fields: Array<{ key: keyof ChildProfile; label: string; section: string; type?: string; options?: string[] }> = [
  { key: 'name', label: "Child's Full Name", section: 'Child Information' }, { key: 'householdNumber', label: 'Household Number', section: 'Household Information' }, { key: 'relationship', label: 'Relationship to Household Head', section: 'Household Information' }, { key: 'barangay', label: 'Barangay', section: 'Household Information', options: ['San Isidro', 'Poblacion', 'Mabini', 'San Roque'] }, { key: 'address', label: 'Address', section: 'Household Information' }, { key: 'dob', label: 'Date of Birth', section: 'Child Information', type: 'date' }, { key: 'sex', label: 'Sex', section: 'Child Information', options: ['Female', 'Male', 'Intersex'] }, { key: 'civilStatus', label: 'Civil Status', section: 'Socioeconomic and Membership Information', options: ['Single', 'Married', 'Not applicable'] }, { key: 'education', label: 'Educational Attainment', section: 'Socioeconomic and Membership Information' }, { key: 'religion', label: 'Religion', section: 'Socioeconomic and Membership Information' }, { key: 'ethnicity', label: 'Ethnicity', section: 'Socioeconomic and Membership Information' }, { key: 'fourPs', label: '4Ps Membership', section: 'Socioeconomic and Membership Information', options: ['Yes', 'No'] }, { key: 'philhealthId', label: 'PhilHealth ID', section: 'Socioeconomic and Membership Information' }, { key: 'philhealthType', label: 'PhilHealth Membership Type', section: 'Socioeconomic and Membership Information', options: ['None', 'Sponsored', 'Direct contributor'] }, { key: 'philhealthCategory', label: 'PhilHealth Category', section: 'Socioeconomic and Membership Information', options: ['None', '4Ps', 'Indigent', 'Private'] }, { key: 'medicalHistory', label: 'Medical History', section: 'Health Information' }, { key: 'risk', label: 'Age/Health-Risk Classification', section: 'Health Information', options: ['Normal', 'At Risk', 'Needs Follow-up'] }, { key: 'lmp', label: 'LMP, if applicable', section: 'Health Information', type: 'date' }, { key: 'waterSource', label: 'Water Source Type', section: 'Household Facilities', options: ['Level II communal faucet', 'Deep well', 'Spring', 'Other'] }, { key: 'toiletFacility', label: 'Toilet Facility Type', section: 'Household Facilities', options: ['Sanitary toilet', 'Shared toilet', 'None'] },]

export default function ChildHealthPage() {
  const { data: liveChildren, mutate } = useSWR<ChildProfile[]>('/api/children', (url: string) => fetch(url).then((response) => response.json()))
  const [children, setChildren] = useState(initialChildren)
  const records = liveChildren ?? children
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<ChildProfile | null>(null)
  const filteredChildren = useMemo(() => records.filter((child) => `${child.name} ${child.id} ${child.barangay}`.toLowerCase().includes(searchTerm.toLowerCase())), [records, searchTerm])
  const grouped = fields.reduce<Record<string, typeof fields>>((acc, field) => { (acc[field.section] ??= []).push(field); return acc }, {})
  function saveProfile() { if (!editing?.name.trim()) return; const next = { ...editing, id: editing.id || `CH-2025-${String(children.length + 1).padStart(3, '0')}`, age: editing.dob ? 'Recorded' : editing.age }; setChildren((current) => editing.id ? current.map((child) => child.id === editing.id ? next : child) : [...current, next]); setEditing(null) }
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold text-foreground">Child Profiling</h1><p className="mt-1 text-muted-foreground">Household and child records for {children.length} registered children</p></div><button onClick={() => setEditing({ ...emptyProfile })} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white"><Plus size={20} />Add New Child</button></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} /><input aria-label="Search children" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name, ID, or barangay..." className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4" /></div><div className="overflow-hidden rounded-2xl border border-border bg-white"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted"><tr>{['ID','Name','Household','Barangay','Age','Risk','Status','Actions'].map((heading) => <th key={heading} className="px-5 py-4 text-left text-sm font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-border">{filteredChildren.map((child) => <tr key={child.id} className="hover:bg-muted"><td className="px-5 py-4 text-sm font-medium">{child.id}</td><td className="px-5 py-4 text-sm">{child.name}</td><td className="px-5 py-4 text-sm">{child.householdNumber}</td><td className="px-5 py-4 text-sm">{child.barangay}</td><td className="px-5 py-4 text-sm">{child.age}</td><td className="px-5 py-4 text-sm"><span className="rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-700">{child.risk}</span></td><td className="px-5 py-4 text-sm">{child.status}</td><td className="px-5 py-4 text-sm"><div className="flex gap-3"><button aria-label={`View ${child.name}`} onClick={() => setEditing(child)} className="text-primary"><Eye size={17} /></button><button aria-label={`Edit ${child.name}`} onClick={() => setEditing({ ...child })} className="text-primary"><Edit3 size={17} /></button></div></td></tr>)}</tbody></table></div></div>{editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-2xl font-bold text-[#03045E]">{editing.id ? 'Child and Household Profile' : 'Add Child Profile'}</h2><p className="text-sm text-muted-foreground">Complete the household profiling form.</p></div><button aria-label="Close profile form" onClick={() => setEditing(null)}><X /></button></div>{Object.entries(grouped).map(([section, sectionFields]) => <section key={section} className="mb-6"><h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">{section}</h3><div className="grid gap-4 md:grid-cols-2">{sectionFields.map((field) => <label key={field.key} className="text-sm font-medium text-foreground">{field.label}{field.options ? <select value={String(editing[field.key])} onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 font-normal"><option value="">Select...</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={field.type ?? 'text'} value={String(editing[field.key])} onChange={(event) => setEditing({ ...editing, [field.key]: event.target.value })} className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-normal" />}</label>)}</div></section>)}<div className="flex justify-end gap-3"><button onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2">Cancel</button><button onClick={saveProfile} className="rounded-lg bg-primary px-4 py-2 text-white">Save Profile</button></div></div></div>}</div>
}
