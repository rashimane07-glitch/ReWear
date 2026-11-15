import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField, { inputClass } from '../components/FormField'
import PasswordInput from '../components/PasswordInput'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

export default function Login() {
  const { signIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [errors, setErrors] = useState({})
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const er = {}
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email address.'
    if (!form.password) er.password = 'Enter your password.'
    setErrors(er); setLoginError('')
    if (Object.keys(er).length) return
    setLoading(true)
    try {
      await signIn(form.email, form.password, form.remember)
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      setLoginError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <AuthLayout title="Welcome back." subtitle="Log in to manage your listings and requests.">
      {location.state?.from && <p className="bg-blush/60 text-plum text-sm p-3 mb-5">Please log in to continue.</p>}
      {loginError && <p role="alert" className="border border-plum text-plum font-medium text-sm p-3 mb-5">{loginError}</p>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField id="email" label="Email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass(errors.email)} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="current-password" error={errors.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormField>
        <div className="flex justify-between text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#633B4D]" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />Remember me</label>
          <button type="button" onClick={() => toast('Password reset is not available yet.', 'error')} className="text-plum underline">Forgot password?</button>
        </div>
        <Button type="submit" disabled={loading} className="w-full py-4">{loading ? 'Logging in…' : 'Log in'}</Button>
      </form>
      <p className="text-sm mt-6">New to ReWear? <Link to="/signup" className="text-plum underline">Create an account</Link></p>
      {!import.meta.env.VITE_API_URL && <p className="text-xs text-charcoal/60 mt-8 border-t border-plum/15 pt-4">Demo mode: log in with <b>demo@rewear.test</b> / <b>demo1234</b> to see a populated dashboard.</p>}
    </AuthLayout>
  )
}
