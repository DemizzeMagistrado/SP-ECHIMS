'use client'
import { Component,type ReactNode } from 'react'
export class ProfileErrorBoundary extends Component<{children:ReactNode},{error:string|null}>{
  state:{error:string|null}={error:null}
  static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:'Unable to render this saved child profile.'}}
  componentDidCatch(error:Error){console.error('Child profile render failed:',error)}
  render(){
    if(this.state.error)return <section role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-white p-6">
      <h1 className="text-xl font-bold">Child profile could not open</h1>
      <p className="text-sm">{this.state.error}</p>
      <p className="text-sm">Reconnect and open this child online to refresh its saved profile. Your local drafts are retained.</p>
      <a href="/child-profiling/children" className="inline-block rounded-lg border px-3 py-2 text-sm">Back to children</a>
    </section>
    return this.props.children
  }
}
