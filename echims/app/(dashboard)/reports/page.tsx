'use client'

import { Download, Eye, FileText } from 'lucide-react'

const reports = [
  {
    id: 1,
    name: 'June 2024 Health Report',
    type: 'Monthly',
    date: '2024-06-30',
    status: 'Completed',
    metrics: {
      children: 1248,
      vaccinated: 94,
      nutrition: 347,
    },
  },
  {
    id: 2,
    name: 'Q2 2024 Quarterly Review',
    type: 'Quarterly',
    date: '2024-06-30',
    status: 'Completed',
    metrics: {
      children: 1189,
      vaccinated: 91,
      nutrition: 312,
    },
  },
  {
    id: 3,
    name: 'Vaccination Campaign Report',
    type: 'Campaign',
    date: '2024-06-20',
    status: 'Completed',
    metrics: {
      children: 450,
      vaccinated: 98,
      nutrition: 0,
    },
  },
  {
    id: 4,
    name: 'May 2024 Health Report',
    type: 'Monthly',
    date: '2024-05-31',
    status: 'Completed',
    metrics: {
      children: 1156,
      vaccinated: 89,
      nutrition: 295,
    },
  },
  {
    id: 5,
    name: 'Nutrition Assessment Report',
    type: 'Special',
    date: '2024-05-15',
    status: 'Completed',
    metrics: {
      children: 340,
      vaccinated: 0,
      nutrition: 340,
    },
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Generate and view comprehensive health reports and analytics
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Reports</p>
          <p className="text-3xl font-bold text-foreground mt-2">{reports.length}</p>
          <p className="text-xs text-muted-foreground mt-2">All time</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Latest Report</p>
          <p className="text-lg font-bold text-foreground mt-2">June 2024</p>
          <p className="text-xs text-muted-foreground mt-2">2024-06-30</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Scheduled Next</p>
          <p className="text-lg font-bold text-foreground mt-2">July 2024</p>
          <p className="text-xs text-muted-foreground mt-2">2024-07-31</p>
        </div>
      </div>

      {/* Report List */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Generated Reports</h2>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm">
            <FileText size={16} />
            New Report
          </button>
        </div>
        <div className="divide-y divide-border">
          {reports.map((report) => (
            <div key={report.id} className="p-6 hover:bg-muted transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText size={24} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{report.name}</h3>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="bg-muted px-2 py-1 rounded">
                        {report.type}
                      </span>
                      <span>{report.date}</span>
                      <span className="text-teal-600 font-medium">{report.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      {report.metrics.children > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Children</p>
                          <p className="font-semibold text-foreground">{report.metrics.children}</p>
                        </div>
                      )}
                      {report.metrics.vaccinated > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Vaccinated</p>
                          <p className="font-semibold text-foreground">{report.metrics.vaccinated}%</p>
                        </div>
                      )}
                      {report.metrics.nutrition > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Nutrition Cases</p>
                          <p className="font-semibold text-foreground">{report.metrics.nutrition}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="p-2 hover:bg-muted rounded-lg transition-colors text-foreground">
                    <Eye size={20} />
                  </button>
                  <button className="p-2 hover:bg-muted rounded-lg transition-colors text-foreground">
                    <Download size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Custom Report Generator</h2>
          <div className="space-y-3">
            <select className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option>Select Report Type</option>
              <option>Monthly Health Report</option>
              <option>Vaccination Coverage</option>
              <option>Nutrition Assessment</option>
              <option>Supplement Distribution</option>
              <option>Quarterly Summary</option>
            </select>
            <select className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option>Select Time Period</option>
              <option>Last Week</option>
              <option>Last Month</option>
              <option>Last Quarter</option>
              <option>Last Year</option>
            </select>
            <button className="w-full bg-primary text-white py-2 rounded-lg hover:bg-primary/90 transition-colors font-medium">
              Generate Report
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Export Options</h2>
          <div className="space-y-2">
            <button className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors font-medium text-sm">
              Export as PDF
            </button>
            <button className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors font-medium text-sm">
              Export as Excel
            </button>
            <button className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors font-medium text-sm">
              Export as CSV
            </button>
            <button className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors font-medium text-sm">
              Schedule Email
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
