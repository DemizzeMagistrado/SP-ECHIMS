'use client'

import { AlertTriangle, AlertCircle, Info, CheckCircle, X } from 'lucide-react'
import { useState } from 'react'

const initialAlerts = [
  {
    id: 1,
    type: 'critical',
    title: 'Vaccination Overdue',
    description: 'Child ID: C-2024-001 (Maria Santos) - Polio vaccine overdue by 2 weeks',
    time: '2 hours ago',
    resolved: false,
  },
  {
    id: 2,
    type: 'critical',
    title: 'Supplement Stock Critical',
    description: 'Vitamin A supplements - Only 15 units remaining, need restocking',
    time: '4 hours ago',
    resolved: false,
  },
  {
    id: 3,
    type: 'warning',
    title: 'Malnutrition Risk',
    description: 'Child ID: C-2024-045 (Juan Dela Cruz) - Weight below threshold',
    time: '6 hours ago',
    resolved: false,
  },
  {
    id: 4,
    type: 'warning',
    title: 'Follow-up Required',
    description: 'Child ID: C-2024-089 (Anna Garcia) - 3-month checkup due',
    time: '1 day ago',
    resolved: false,
  },
  {
    id: 5,
    type: 'info',
    title: 'Monthly Report Ready',
    description: 'June health report has been generated and is ready for review',
    time: '1 day ago',
    resolved: false,
  },
  {
    id: 6,
    type: 'success',
    title: 'Vaccination Completed',
    description: 'Child ID: C-2024-156 (Rosa Diaz) - DPT vaccination completed successfully',
    time: '2 days ago',
    resolved: true,
  },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filter, setFilter] = useState('all')

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'all') return true
    if (filter === 'unresolved') return !alert.resolved
    if (filter === 'critical') return alert.type === 'critical' && !alert.resolved
    return alert.type === filter
  })

  const handleResolve = (id: number) => {
    setAlerts(alerts.map((alert) => (alert.id === id ? { ...alert, resolved: true } : alert)))
  }

  const handleDismiss = (id: number) => {
    setAlerts(alerts.filter((alert) => alert.id !== id))
  }

  const criticalCount = alerts.filter((a) => a.type === 'critical' && !a.resolved).length
  const warningCount = alerts.filter((a) => a.type === 'warning' && !a.resolved).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Alert Management</h1>
        <p className="text-muted-foreground mt-1">
          Monitor and manage system alerts and health notifications
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Alerts</p>
          <p className="text-3xl font-bold text-foreground mt-2">{alerts.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Critical</p>
          <p className="text-3xl font-bold text-destructive mt-2">{criticalCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Warning</p>
          <p className="text-3xl font-bold text-orange-500 mt-2">{warningCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Resolved</p>
          <p className="text-3xl font-bold text-teal-600 mt-2">
            {alerts.filter((a) => a.resolved).length}
          </p>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'unresolved', 'critical', 'warning', 'info'].map((btn) => (
          <button
            key={btn}
            onClick={() => setFilter(btn)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors capitalize ${
              filter === btn
                ? 'bg-primary text-white'
                : 'bg-white border border-border text-foreground hover:bg-muted'
            }`}
          >
            {btn}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-teal-600 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No Alerts</h3>
            <p className="text-muted-foreground mt-2">All systems operating normally</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            let IconComponent, iconColor, bgColor, borderColor
            if (alert.type === 'critical') {
              IconComponent = AlertTriangle
              iconColor = 'text-destructive'
              bgColor = 'bg-red-50'
              borderColor = 'border-red-200'
            } else if (alert.type === 'warning') {
              IconComponent = AlertCircle
              iconColor = 'text-orange-500'
              bgColor = 'bg-orange-50'
              borderColor = 'border-orange-200'
            } else if (alert.type === 'info') {
              IconComponent = Info
              iconColor = 'text-secondary'
              bgColor = 'bg-blue-50'
              borderColor = 'border-blue-200'
            } else {
              IconComponent = CheckCircle
              iconColor = 'text-teal-600'
              bgColor = 'bg-teal-50'
              borderColor = 'border-teal-200'
            }

            return (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 transition-all ${
                  alert.resolved
                    ? 'bg-muted border-border opacity-60'
                    : `${bgColor} ${borderColor}`
                }`}
              >
                <div className="flex gap-4">
                  <div className="pt-1">
                    <IconComponent size={24} className={iconColor} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{alert.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {alert.time}
                      </span>
                    </div>
                    {!alert.resolved && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-foreground text-white hover:bg-foreground/90 transition-colors"
                        >
                          Mark as Resolved
                        </button>
                        <button
                          onClick={() => handleDismiss(alert.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
