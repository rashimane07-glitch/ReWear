import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { inputClass } from './FormField'

export default function PasswordInput({ id, error, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className={`${inputClass(error)} pr-12`} {...props} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-plum">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
