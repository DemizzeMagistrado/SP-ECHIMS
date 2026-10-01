import { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  trend: string
  color: string
  iconColor: string
  isAlert?: boolean
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
  iconColor,
  isAlert,
}: StatCardProps) {
  const isPositive = !trend.includes('-') && !isAlert
  const TrendIcon = isPositive ? TrendingUp : TrendingDown

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm hover:shadow-lg transition-all duration-200 hover:border-[#00B4D8]">
      <div className="flex items-start justify-between mb-4">
        <div className={`${color} p-4 rounded-xl`}>
          <Icon size={28} className={iconColor} />
        </div>
      </div>
      
      <div>
        <p className="text-xs uppercase tracking-wider text-[#9CA3AF] font-semibold mb-2">{label}</p>
        <h3 className="text-4xl font-bold text-[#03045E] mb-3">{value}</h3>
        
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            isAlert 
              ? 'bg-red-50 text-red-700'
              : isPositive 
                ? 'bg-green-50 text-green-700'
                : 'bg-yellow-50 text-yellow-700'
          }`}>
            <TrendIcon size={14} />
            <span>{trend}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
