import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

const alerts = [
  {
    id: 1,
    type: 'critical',
    title: 'Vaccination Overdue',
    description: 'Child ID: C-2024-001 (Maria Santos) - Polio vaccine overdue',
    time: '2 hours ago',
  },
  {
    id: 2,
    type: 'warning',
    title: 'Malnutrition Risk',
    description: 'Child ID: C-2024-045 (Juan Dela Cruz) - Weight below threshold',
    time: '4 hours ago',
  },
  {
    id: 3,
    type: 'critical',
    title: 'Supplement Stock Low',
    description: 'Vitamin A supplements - Only 15 units remaining',
    time: '6 hours ago',
  },
  {
    id: 4,
    type: 'info',
    title: 'Monthly Report Ready',
    description: 'June health report has been generated and is ready for review',
    time: '1 day ago',
  },
  {
    id: 5,
    type: 'warning',
    title: 'Follow-up Required',
    description: 'Child ID: C-2024-089 (Anna Garcia) - 3-month checkup due',
    time: '1 day ago',
  },
]

export function RecentAlerts() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm hover:shadow-lg transition-all duration-200">
      <div className="p-6 border-b border-[#E5E7EB]">
        <h3 className="text-lg font-semibold text-[#03045E]">Critical Alerts</h3>
        <p className="text-sm text-[#6B7280] mt-1">Immediate attention required</p>
      </div>
      <div className="divide-y divide-[#F3F4F6]">
        {alerts.map((alert) => {
          const isWarning = alert.type === 'warning'
          const isInfo = alert.type === 'info'
          const isCritical = alert.type === 'critical'

          const bgColor = isCritical ? 'bg-red-50' : isWarning ? 'bg-yellow-50' : 'bg-blue-50'
          const borderColor = isCritical ? 'border-l-red-500' : isWarning ? 'border-l-yellow-500' : 'border-l-blue-500'
          const iconBg = isCritical ? 'bg-red-100' : isWarning ? 'bg-yellow-100' : 'bg-blue-100'
          const iconColor = isCritical ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-blue-600'

          return (
            <div key={alert.id} className={`p-4 ${bgColor} border-l-4 ${borderColor} hover:bg-opacity-75 transition-colors`}>
              <div className="flex gap-4">
                <div className={`${iconBg} p-2 rounded-lg flex-shrink-0 flex items-center justify-center h-10 w-10`}>
                  {isCritical && (
                    <AlertTriangle size={20} className={iconColor} />
                  )}
                  {isWarning && (
                    <AlertCircle size={20} className={iconColor} />
                  )}
                  {isInfo && <Info size={20} className={iconColor} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-[#03045E] text-sm">
                      {alert.title}
                    </h4>
                    <span className="text-xs text-[#6B7280] whitespace-nowrap bg-white px-2 py-1 rounded">
                      {alert.time}
                    </span>
                  </div>
                  <p className="text-sm text-[#6B7280]">
                    {alert.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="p-4 border-t border-[#E5E7EB] bg-[#F9FAFB]">
        <button className="text-sm text-[#0077B6] font-semibold hover:text-[#03045E] transition-colors">
          View All Alerts →
        </button>
      </div>
    </div>
  )
}
