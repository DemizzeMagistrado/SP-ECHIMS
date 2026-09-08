'use client'

import { FormEvent, useState } from 'react'

type View = 'signin' | 'register' | 'forgot'
type Role = 'Administrator' | 'Health Worker' | 'Public Health Nurse' | 'Barangay Health Worker' | 'Rural Health Midwife' | 'Nutrition Scholar'

const roles: Role[] = ['Administrator', 'Health Worker', 'Public Health Nurse', 'Barangay Health Worker', 'Rural Health Midwife', 'Nutrition Scholar']

const roleDescriptions: Record<Role, string> = {
  Administrator: 'System administrator access is reviewed before activation.',
  'Public Health Nurse': 'Public health nurses coordinate approved RHU activities.',
  'Barangay Health Worker': 'Barangay health workers are assigned to a barangay after review.',
  'Rural Health Midwife': 'Rural health midwives support maternal and child health services.',
  'Nutrition Scholar': 'Nutrition scholars support community nutrition monitoring.',
  'Health Worker': ''
}

function BrandPanel() {
  return (
    <section className="brand-panel" aria-label="eCHIMS introduction">
      <div className="brand-mark" aria-label="eCHIMS logo"><span>e</span>chims</div>
      <div className="brand-copy">
        <h2>Early Child Health Information and Monitoring System</h2>
        <p>Comprehensive healthcare management for Rural Health Units</p>
      </div>
      <div className="brand-stats" aria-label="System statistics">
        <div><strong>500+</strong><span>Children Tracked</span></div>
        <div><strong>50+</strong><span>Barangays</span></div>
      </div>
      <footer>
        <span>Bachelor of Science in Information Technology</span>
        <small>© 2025 Rural Health Units</small>
      </footer>
    </section>
  )
}

function InputField({ label, id, type = 'text', placeholder, required = true }: { label: string; id: string; type?: string; placeholder: string; required?: boolean }) {
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} name={id} type={type} placeholder={placeholder} required={required} /></label>
}

function AuthCard({ view, setView }: { view: View; setView: (view: View) => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<Role>('Public Health Nurse')
  const [submitted, setSubmitted] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = form.elements.namedItem('password') as HTMLInputElement
    const confirmPassword = form.elements.namedItem('confirmPassword') as HTMLInputElement | null
    if (confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setCustomValidity('Passwords must match.')
      confirmPassword.reportValidity()
      return
    }
    confirmPassword?.setCustomValidity('')
    setSubmitted(true)
  }

  if (view === 'forgot') {
    return <div className="auth-card"><div className="auth-content compact">
      <button className="back-link" onClick={() => { setView('signin'); setSubmitted(false) }}>← Back to sign in</button>
      <h1>Reset your password</h1><p className="subtitle">Enter the email linked to your RHU account and we&apos;ll send reset instructions.</p>
      {submitted ? <div className="success-message"><strong>Check your inbox</strong><span>If an account exists for that email, a password reset link is on its way.</span></div> : <form onSubmit={submit}><InputField label="Email Address" id="email" type="email" placeholder="you@example.com" /><button className="primary-button" type="submit">Send Reset Link</button></form>}
      <p className="form-switch">Remember your password? <button onClick={() => setView('signin')}>Sign in</button></p>
    </div></div>
  }

  return <div className="auth-card"><div className="auth-content">
    <h1>{view === 'signin' ? 'Welcome Back' : 'Create your account'}</h1>
    <p className="subtitle">{view === 'signin' ? 'Sign in to your RHU account' : 'Register for the eCHIMS health network'}</p>
    {submitted && <div className="success-message"><strong>{view === 'signin' ? 'Demo sign in ready' : 'Registration request submitted'}</strong><span>{view === 'signin' ? 'Supabase Auth is not connected yet. This UI is ready for wiring.' : 'Your role request will be reviewed by an administrator before access is granted.'}</span></div>}
    <form onSubmit={submit}>
      {view === 'register' && <>
        <InputField label="Full Name" id="fullName" placeholder="Juan Dela Cruz" />
        <InputField label="Username" id="username" placeholder="juan.delacruz" />
        <InputField label="Contact Number" id="contactNumber" type="tel" placeholder="09XX XXX XXXX" />
      </>}
      <InputField label="Email Address" id="email" type="email" placeholder="you@example.com" />
      {view === 'register' && <>
        <label className="field" htmlFor="role"><span>Account Role</span><select id="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item}>{item}</option>)}</select><small>{roleDescriptions[role]}</small></label>
        {(role === 'Health Worker' || role === 'Public Health Nurse' || role === 'Barangay Health Worker' || role === 'Rural Health Midwife' || role === 'Nutrition Scholar') && <InputField label="Employee ID" id="employeeId" placeholder="Official employee number" />}
        {(role === 'Health Worker' || role === 'Public Health Nurse' || role === 'Barangay Health Worker' || role === 'Rural Health Midwife') && <InputField label="License Number" id="licenseNumber" placeholder="Professional license number" required={role !== 'Barangay Health Worker'} />}
        {(role === 'Barangay Health Worker' || role === 'Nutrition Scholar') && <InputField label="Barangay Assignment" id="barangay" placeholder="Select or enter barangay" />}
      </>}
      <label className="field" htmlFor="password"><span>Password</span><div className="password-wrap"><input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder={view === 'signin' ? 'Enter your password' : 'Create a secure password'} required minLength={8} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
      {view === 'register' && <InputField label="Confirm Password" id="confirmPassword" type="password" placeholder="Re-enter your password" />}
      {view === 'signin' && <div className="form-options"><label className="check"><input type="checkbox" /> <span>Remember me</span></label><button type="button" onClick={() => setView('forgot')}>Forgot Password?</button></div>}
      <button className="primary-button" type="submit">{view === 'signin' ? 'Sign In' : 'Submit Registration'}</button>
    </form>
    <div className="divider"><span>{view === 'signin' ? 'NEW USER?' : 'ALREADY REGISTERED?'}</span></div>
    <p className="form-switch">{view === 'signin' ? <>Need an account? <button onClick={() => { setView('register'); setSubmitted(false) }}>Register here</button></> : <>Already have an account? <button onClick={() => { setView('signin'); setSubmitted(false) }}>Sign in</button></>}</p>
    {view === 'signin' && <div className="demo-box"><strong>Demo Credentials</strong><span>Email: <b>demo@rhu.gov.ph</b></span><span>Password: <b>Demo@123</b></span></div>}
    <p className="terms">By signing in, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a></p>
  </div></div>
}
import { redirect } from 'next/navigation'

export default function Page() {
  const [view, setView] = useState<View>('signin')
  return <main className="auth-page"><div className="auth-shell"><BrandPanel /><AuthCard view={view} setView={setView} /></div></main>
  redirect('/sign-in')
}