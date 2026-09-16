'use client'

import { Search, Zap } from 'lucide-react'

export function TopNav() {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <div className="h-20 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8 shadow-sm">
      {/* Left side - Date and status */}
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-[#6B7280] uppercase tracking-wider">Today</p>
          <p className="text-sm font-medium text-[#03045E]">{today}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-[#E6F7F2] rounded-full">
          <Zap size={14} className="text-[#10B981]" />
          <span className="text-xs font-medium text-[#059669]">All Systems Operational</span>
        </div>
      </div>

      {/* Right side - Search, notifications, and sync */}
      <div className="flex items-center gap-6">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search size={18} className="absolute left-3 top-3 text-[#9CA3AF]" />
          <input 
            type="text" 
            placeholder="Search..." 
            className="pl-10 pr-4 py-2 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-sm text-[#03045E] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#0077B6] focus:bg-white"
          />
        </div>

        {/* Sync Status */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#F3F4F6] rounded-lg">
          <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-[#6B7280]">Synced</span>
        </div>
      </div>
    </div>
  )
}
