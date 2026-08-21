import { useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', studioCode: '', countryRegion: 'GE_Tbilisi' })
  const [status, setStatus] = useState({ loading: false, error: '', message: '' })
  const update = e => setForm({ ...form, [e.target.name]: e.target.value })
  const submit = async e => {
    e.preventDefault(); setStatus({ loading: true, error: '', message: '' })
    try {
      if (!isSupabaseConfigured) throw new Error('Add Supabase credentials to .env.local, then restart Vite.')
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { first_name: form.firstName, last_name: form.lastName, studio_code: form.studioCode, country_region: form.countryRegion, role: 'teacher' } } })
        if (error) throw error
        setStatus({ loading: false, error: '', message: 'Check your email to confirm your account.' }); return
      }
    } catch (error) { setStatus({ loading: false, error: error.message, message: '' }) }
  }
  return <main className="min-h-screen bg-[#e8e7e2] grid place-items-center p-5"><div className="w-full max-w-[1040px] min-h-[650px] bg-[#fbfaf7] rounded-[32px] overflow-hidden shadow-[0_30px_80px_rgba(38,39,34,.12)] grid md:grid-cols-[1.05fr_.95fr]"><section className="hidden md:flex bg-[#30312d] text-white p-12 flex-col relative overflow-hidden"><div className="absolute -right-24 -top-24 w-80 h-80 border border-white/10 rounded-full"/><div className="flex items-center gap-3 text-xl font-bold"><span className="w-10 h-10 rounded-2xl bg-white text-[#30312d] grid place-items-center"><span className="material-symbols-rounded">school</span></span>dayo</div><div className="mt-auto mb-12"><p className="text-sm text-white/45 mb-4">TEACH WITH CLARITY</p><h1 className="text-4xl font-semibold leading-tight max-w-sm">Your students, schedule and payments—in one calm place.</h1><p className="mt-5 text-white/55 leading-relaxed max-w-sm">A focused workspace designed for independent teachers and small studios.</p></div><p className="text-xs text-white/30">Dayo Edu · Built for better teaching days</p></section><section className="p-7 sm:p-12 flex flex-col justify-center"><div className="md:hidden flex items-center gap-3 font-bold text-xl mb-10"><span className="w-9 h-9 bg-[#30312d] text-white rounded-xl grid place-items-center"><span className="material-symbols-rounded">school</span></span>dayo</div><p className="text-xs tracking-[.15em] text-[#989990] font-semibold">{mode === 'signin' ? 'WELCOME BACK' : 'TEACHER REGISTRATION'}</p><h2 className="text-3xl font-semibold mt-3 mb-2">{mode === 'signin' ? 'Sign in to Dayo' : 'Create your workspace'}</h2><p className="text-sm text-[#898a82] mb-8">{mode === 'signin' ? 'Enter your teacher or student account.' : 'Register as a teacher. You can add students after signing in.'}</p><form onSubmit={submit} className="space-y-4">{mode === 'signup' && <><div className="grid grid-cols-2 gap-3"><AuthInput label="First name" name="firstName" value={form.firstName} onChange={update}/><AuthInput label="Last name" name="lastName" value={form.lastName} onChange={update}/></div><div className="grid grid-cols-2 gap-3"><AuthInput label="Teacher/studio code" name="studioCode" value={form.studioCode} onChange={update} placeholder="AD"/><AuthInput label="Country & region" name="countryRegion" value={form.countryRegion} onChange={update}/></div></>}<AuthInput label="Email" name="email" type="email" value={form.email} onChange={update}/><AuthInput label="Password" name="password" type="password" minLength="8" value={form.password} onChange={update}/>{status.error&&<p className="text-xs text-[#a35645] bg-[#f3e3de] rounded-xl p-3">{status.error}</p>}{status.message&&<p className="text-xs text-[#52735d] bg-[#e0ece3] rounded-xl p-3">{status.message}</p>}<button disabled={status.loading} className="w-full h-12 rounded-xl border-0 bg-[#30312d] text-white font-semibold text-sm disabled:opacity-60">{status.loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create teacher account'}</button></form><button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setStatus({loading:false,error:'',message:''})}} className="mt-6 bg-transparent border-0 text-sm text-[#77786f]">{mode === 'signin' ? 'New teacher? Create an account' : 'Already registered? Sign in'}</button></section></div></main>
}

function AuthInput({label,...props}) { return <label className="block text-xs font-semibold text-[#66675f]">{label}<input required {...props} className="mt-2 w-full h-11 rounded-xl border border-[#dedbd3] bg-white px-3 outline-none focus:border-[#8f9d92] text-sm"/></label> }
