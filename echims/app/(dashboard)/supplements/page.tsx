'use client'

import { AlertTriangle, Plus, Package } from 'lucide-react'

const supplements = [
  {
    id: 'S-001',
    name: 'Vitamin A Syrup',
    stock: 15,
    capacity: 100,
    unit: 'bottles',
    status: 'Low Stock',
    distributed: 563,
    expiryDate: '2025-12-31',
    batchNo: 'VAC-2024-001',
  },
  {
    id: 'S-002',
    name: 'Iron Syrup',
    stock: 42,
    capacity: 100,
    unit: 'bottles',
    status: 'Good',
    distributed: 248,
    expiryDate: '2025-11-15',
    batchNo: 'IRS-2024-002',
  },
  {
    id: 'S-003',
    name: 'Calcium Tablets',
    stock: 8,
    capacity: 50,
    unit: 'boxes',
    status: 'Critical',
    distributed: 89,
    expiryDate: '2025-09-30',
    batchNo: 'CAL-2024-003',
  },
  {
    id: 'S-004',
    name: 'Zinc Supplements',
    stock: 35,
    capacity: 80,
    unit: 'bottles',
    status: 'Good',
    distributed: 156,
    expiryDate: '2025-10-20',
    batchNo: 'ZIN-2024-004',
  },
  {
    id: 'S-005',
    name: 'Multi-Vitamin',
    stock: 3,
    capacity: 60,
    unit: 'boxes',
    status: 'Critical',
    distributed: 92,
    expiryDate: '2025-08-15',
    batchNo: 'MUL-2024-005',
  },
]

export default function SupplementsPage() {
  const lowStockCount = supplements.filter(
    (s) => s.status === 'Low Stock' || s.status === 'Critical'
  ).length
  const totalDistributed = supplements.reduce((sum, s) => sum + s.distributed, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Supplements & Inventory Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track supplement inventory and distribution
          </p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
          <Plus size={20} />
          Add Inventory
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Supplement Types</p>
          <p className="text-3xl font-bold text-foreground mt-2">{supplements.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total Distributed</p>
          <p className="text-3xl font-bold text-secondary mt-2">{totalDistributed}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Low Stock Items</p>
          <p className="text-3xl font-bold text-orange-500 mt-2">{lowStockCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Avg. Coverage</p>
          <p className="text-3xl font-bold text-accent mt-2">
            {Math.round(supplements.reduce((sum, s) => sum + (s.stock / s.capacity) * 100, 0) / supplements.length)}
            %
          </p>
        </div>
      </div>

      {/* Alerts */}
      {lowStockCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={24} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-orange-900">Stock Alert</h3>
            <p className="text-sm text-orange-800 mt-1">
              {lowStockCount} supplement(s) require immediate restocking
            </p>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Supplement Inventory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">ID</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Supplement Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Stock Level</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Distributed</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Expiry Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {supplements.map((supp) => {
                const percentage = Math.round((supp.stock / supp.capacity) * 100)
                const statusColor =
                  supp.status === 'Good'
                    ? 'bg-teal-100 text-teal-700'
                    : supp.status === 'Low Stock'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-red-100 text-red-700'

                return (
                  <tr key={supp.id} className="hover:bg-muted transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground font-medium">{supp.id}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{supp.name}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {supp.stock}/{supp.capacity}
                          </span>
                          <span className="text-muted-foreground text-xs">{supp.unit}</span>
                        </div>
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              percentage > 50
                                ? 'bg-teal-600'
                                : percentage > 20
                                ? 'bg-orange-500'
                                : 'bg-destructive'
                            }`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground font-medium">
                      {supp.distributed}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {supp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{supp.expiryDate}</td>
                    <td className="px-6 py-4 text-sm">
                      <button className="text-primary hover:text-secondary transition-colors font-medium">
                        Manage
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution History */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Package size={20} />
          Recent Distribution
        </h2>
        <div className="space-y-3">
          {[
            {
              date: '2024-06-20',
              supplement: 'Vitamin A Syrup',
              quantity: 45,
              recipient: 'Urban Health Center',
            },
            {
              date: '2024-06-19',
              supplement: 'Iron Syrup',
              quantity: 30,
              recipient: 'Rural Clinic A',
            },
            {
              date: '2024-06-18',
              supplement: 'Zinc Supplements',
              quantity: 25,
              recipient: 'Rural Clinic B',
            },
          ].map((dist, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 border border-border rounded-lg"
            >
              <div>
                <p className="font-medium text-foreground">{dist.supplement}</p>
                <p className="text-xs text-muted-foreground">{dist.recipient}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">{dist.quantity}</p>
                <p className="text-xs text-muted-foreground">{dist.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
