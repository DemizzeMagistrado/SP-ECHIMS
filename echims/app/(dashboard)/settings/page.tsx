'use client'

import { useState } from 'react'
import { Save, Lock, Bell, Shield, User, Building, LogOut } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const { logout, user } = useAuth()
  const isAdmin = user?.role === 'Administrator'

  function handleLogout() {
    logout()
    window.location.assign('/login')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage system settings and user preferences
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b border-border flex-wrap">
        {[
          { id: 'general', label: 'Organization', icon: Building },
          { id: 'account', label: 'Profile', icon: User },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'security', label: 'Security', icon: Lock },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Organization Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Unit Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Rural Health Unit - Barangay A"
                      disabled={!isAdmin}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Unit Code
                  </label>
                  <input
                    type="text"
                    defaultValue="RHU-001"
                      disabled={!isAdmin}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Municipality
                    </label>
                    <input
                      type="text"
                      defaultValue="San Isidro"
                      disabled={!isAdmin}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Province
                    </label>
                    <input
                      type="text"
                      defaultValue="Laguna"
                      disabled={!isAdmin}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Contact Number
                    </label>
                    <input
                      type="tel"
                      defaultValue="+63 912 345 6789"
                      disabled={!isAdmin}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      defaultValue="admin@rhu.gov.ph"
                      disabled={!isAdmin}
                      className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Barangays
                  </label>
                  <input
                    type="text"
                    defaultValue="San Isidro, Poblacion, Mabini, San Roque"
                    disabled={!isAdmin}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">System Preferences</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Data Backup</p>
                    <p className="text-sm text-muted-foreground">Automatic daily backups</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <p className="font-medium text-foreground">Maintenance Mode</p>
                    <p className="text-sm text-muted-foreground">Disable access for maintenance</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Settings */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">User Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Administrator"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    defaultValue="admin"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    defaultValue="admin@rhu.gov.ph"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Contact Number
                    </label>
                    <input type="tel" defaultValue="+63 912 345 6789" className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Employee ID
                    </label>
                    <input type="text" defaultValue="EMP-0001" className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    License Number
                  </label>
                  <input type="text" defaultValue="PRC-123456" className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Account Actions</h2>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted transition-colors font-medium text-sm">
                  Download My Data
                </button>
                <button className="w-full text-left px-4 py-3 border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors font-medium text-sm text-orange-700 rounded-lg">
                  Request Account Deletion
                </button>
                <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-sm text-[#0077B6] border border-[#BDEAF5] bg-[#F0FBFD] hover:bg-[#CAF0F8] transition-colors rounded-lg">
                  <LogOut size={18} />
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Settings */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  { title: 'Vaccination Alerts', desc: 'Receive alerts for overdue vaccinations' },
                  { title: 'Nutrition Alerts', desc: 'Alerts for malnutrition cases' },
                  { title: 'Stock Alerts', desc: 'Low stock and critical alerts' },
                  { title: 'Report Ready', desc: 'Notification when reports are ready' },
                  { title: 'System Updates', desc: 'System maintenance and update notices' },
                  { title: 'Weekly Summary', desc: 'Weekly summary emails' },
                ].map((notif, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{notif.title}</p>
                      <p className="text-sm text-muted-foreground">{notif.desc}</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Alert Channels</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded" />
                  <span className="font-medium text-foreground">Email</span>
                </div>
                <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded" />
                  <span className="font-medium text-foreground">In-App Notifications</span>
                </div>
                <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
                  <input type="checkbox" className="w-5 h-5 rounded" />
                  <span className="font-medium text-foreground">SMS</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Settings */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Lock size={20} />
                Change Password
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield size={20} />
                Security Settings
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Two-Factor Authentication</p>
                    <p className="text-sm text-muted-foreground">Add extra layer of security</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <p className="font-medium text-foreground">Session Timeout</p>
                    <p className="text-sm text-muted-foreground">Auto-logout after inactivity</p>
                  </div>
                  <select className="px-3 py-2 border border-border rounded-lg">
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>2 hours</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Active Sessions</h2>
              <div className="space-y-2">
                <div className="p-3 border border-border rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Current Session</p>
                    <p className="text-xs text-muted-foreground">Chrome - Windows 10</p>
                  </div>
                  <span className="text-xs text-teal-600 font-medium">Active</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors font-medium">
          <Save size={20} />
          Save Changes
        </button>
      </div>
    </div>
  )
}
