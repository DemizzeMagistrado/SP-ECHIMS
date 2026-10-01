'use client'

import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

const vaccinationData = [
  {
    vaccine: 'BCG',
    targetAge: 'Birth',
    coverage: 98,
    status: 'Completed',
    icon: CheckCircle,
    color: 'text-teal-600',
  },
  {
    vaccine: 'Polio (OPV-1)',
    targetAge: '6 weeks',
    coverage: 94,
    status: 'In Progress',
    icon: Clock,
    color: 'text-secondary',
  },
  {
    vaccine: 'Polio (OPV-2)',
    targetAge: '10 weeks',
    coverage: 92,
    status: 'In Progress',
    icon: Clock,
    color: 'text-secondary',
  },
  {
    vaccine: 'Polio (OPV-3)',
    targetAge: '14 weeks',
    coverage: 89,
    status: 'In Progress',
    icon: Clock,
    color: 'text-secondary',
  },
  {
    vaccine: 'DPT 1',
    targetAge: '6 weeks',
    coverage: 95,
    status: 'Completed',
    icon: CheckCircle,
    color: 'text-teal-600',
  },
  {
    vaccine: 'DPT 2',
    targetAge: '10 weeks',
    coverage: 91,
    status: 'In Progress',
    icon: Clock,
    color: 'text-secondary',
  },
  {
    vaccine: 'DPT 3',
    targetAge: '14 weeks',
    coverage: 87,
    status: 'Pending',
    icon: AlertCircle,
    color: 'text-orange-500',
  },
  {
    vaccine: 'Hepatitis B',
    targetAge: 'Birth',
    coverage: 96,
    status: 'Completed',
    icon: CheckCircle,
    color: 'text-teal-600',
  },
]

export default function VaccinationsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Vaccination Tracking</h1>
        <p className="text-muted-foreground mt-1">
          Monitor immunization coverage and track vaccination schedules
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Vaccines Tracked</p>
          <p className="text-3xl font-bold text-foreground mt-2">{vaccinationData.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Avg. Coverage Rate</p>
          <p className="text-3xl font-bold text-foreground mt-2">
            {Math.round(
              vaccinationData.reduce((sum, v) => sum + v.coverage, 0) / vaccinationData.length
            )}
            %
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-3xl font-bold text-teal-600 mt-2">
            {vaccinationData.filter((v) => v.status === 'Completed').length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-3xl font-bold text-orange-500 mt-2">
            {vaccinationData.filter((v) => v.status === 'Pending').length}
          </p>
        </div>
      </div>

      {/* Vaccination Schedule */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="text-xl font-semibold text-foreground mb-6">Vaccination Schedule</h2>
        <div className="space-y-3">
          {vaccinationData.map((vac, idx) => {
            const IconComponent = vac.icon
            return (
              <div key={idx} className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted transition-colors">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <IconComponent size={20} className={vac.color} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">{vac.vaccine}</h3>
                    <span className="text-sm text-muted-foreground">{vac.targetAge}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${vac.coverage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-foreground w-12 text-right">
                      {vac.coverage}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Campaign Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Campaigns</h2>
          <div className="space-y-3">
            <div className="p-3 border border-border rounded-lg">
              <h3 className="font-medium text-foreground">Polio Immunization Drive</h3>
              <p className="text-sm text-muted-foreground mt-1">Scheduled: July 15-20, 2024</p>
            </div>
            <div className="p-3 border border-border rounded-lg">
              <h3 className="font-medium text-foreground">DPT Campaign</h3>
              <p className="text-sm text-muted-foreground mt-1">Scheduled: August 1-5, 2024</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Coverage Goals</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-foreground">95% by Q3 2024</span>
                <span className="text-sm text-muted-foreground">94% achieved</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-secondary h-2 rounded-full" style={{ width: '94%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
