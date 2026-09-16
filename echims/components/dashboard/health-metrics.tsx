'use client'

export function HealthMetrics() {
  const metrics = [
    { label: 'Fully Vaccinated', value: 89, color: 'bg-[#03045E]' },
    { label: 'Partially Vaccinated', value: 5, color: 'bg-[#0077B6]' },
    { label: 'Not Started', value: 6, color: 'bg-[#E5E7EB]' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-8 hover:shadow-lg transition-all duration-200">
      <h3 className="text-lg font-semibold text-[#03045E] mb-2">
        Vaccination Status
      </h3>
      <p className="text-sm text-[#6B7280] mb-6">Overall coverage rate</p>

      <div className="space-y-8">
        {/* Progress Circles */}
        <div className="flex justify-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-[#E5E7EB]"
              />
              {/* Progress circle for fully vaccinated */}
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={`${Math.PI * 100 * 0.89} ${Math.PI * 100}`}
                className="text-[#03045E] transition-all"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-[#03045E]">89%</span>
              <span className="text-xs text-[#6B7280] mt-1">Fully Vaccinated</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${metric.color} flex-shrink-0`}></div>
              <div className="flex items-center justify-between flex-1 text-sm">
                <span className="text-[#6B7280]">{metric.label}</span>
                <span className="font-semibold text-[#03045E]">{metric.value}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <button className="w-full bg-[#0077B6] text-white rounded-lg py-3 font-semibold hover:bg-[#03045E] transition-colors text-sm">
          View Vaccination Details
        </button>
      </div>
    </div>
  )
}
