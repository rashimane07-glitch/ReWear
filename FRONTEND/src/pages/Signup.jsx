import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField, { inputClass } from '../components/FormField'
import PasswordInput from '../components/PasswordInput'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

export default function Signup() {
  const { signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', college: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: '' }) }

  const submit = async (e) => {
    e.preventDefault()
    const er = {}
    if (form.name.trim().length < 2) er.name = 'Enter your full name.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email address.'
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) er.password = 'Use at least 8 characters with a letter and a number.'
    if (form.confirm !== form.password) er.confirm = 'Passwords do not match.'
    if (!form.college.trim()) er.college = 'Enter your college name.'
    setErrors(er); setFormError('')
    if (Object.keys(er).length) return
    setLoading(true)
    try {
      const user = await signUp(form)
      toast(`Welcome to ReWear, ${user.name.split(' ')[0]}! Your account is ready.`)
      navigate('/dashboard', { replace: true })
    } catch (err) { setFormError(err.message) } finally { setLoading(false) }
  }

  return (
    <AuthLayout title="Join ReWear." subtitle="Sell, swap and donate clothes with students on your campus.">
      {formError && <p role="alert" className="border border-plum text-plum font-medium text-sm p-3 mb-5">{formError}</p>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField id="name" label="Full name" error={errors.name}><input id="name" autoComplete="name" value={form.name} onChange={set('name')} className={inputClass(errors.name)} /></FormField>
        <FormField id="email" label="Email" error={errors.email}><input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} className={inputClass(errors.email)} /></FormField>
        <FormField id="college" label="College name" error={errors.college}><input id="college" value={form.college} onChange={set('college')} className={inputClass(errors.college)} /></FormField>
        <FormField id="password" label="Password" error={errors.password}><PasswordInput id="password" autoComplete="new-password" error={errors.password} value={form.password} onChange={set('password')} /></FormField>
        <FormField id="confirm" label="Confirm password" error={errors.confirm}><PasswordInput id="confirm" autoComplete="new-password" error={errors.confirm} value={form.confirm} onChange={set('confirm')} /></FormField>
        <Button type="submit" disabled={loading} className="w-full py-4">{loading ? 'Creating account…' : 'Create account'}</Button>
      </form>
      <p className="text-sm mt-6">Already have an account? <Link to="/login" className="text-plum underline">Log in</Link></p>
    </AuthLayout>
  )
}
