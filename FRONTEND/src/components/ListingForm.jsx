import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, MapPin, CheckCircle2 } from 'lucide-react'
import Button from './Button'
import FormField, { inputClass } from './FormField'
import ImageUploader from './ImageUploader'
import { useToast } from './Toast'
import { useAuth } from '../context/AuthContext'
import { createListing } from '../services/api'
import { API_MODE } from '../services/config'
import { OPTIONS, uiFieldErrors, encodeDescription, BACKEND_DESCRIPTION_MAX } from '../services/listingMapper'

const empty = { name: '', category: '', gender: '', size: '', condition: '', colour: '', price: '', lookingFor: '', description: '', location: '' }

// mode: 'sell' (shows price) or 'donate' (no price, listingType = donate)
export default function ListingForm({ mode }) {
  const isDonate = mode === 'donate'
  const [params] = useSearchParams()
  const [type, setType] = useState(isDonate ? 'donate' : params.get('type') === 'exchange' ? 'exchange' : 'sell')
  const isSell = !isDonate // the Sell page covers both selling and exchanging
  const needsPrice = type === 'sell'
  const toast = useToast()
  const { user } = useAuth()
  const [values, setValues] = useState(empty)
  const [images, setImages] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)
  const [savedWithoutPhotos, setSavedWithoutPhotos] = useState(null) // REAL mode: the listing was saved but its photos failed

  const set = (key) => (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setErrors((er) => ({ ...er, [key]: '' })) }

  const validate = () => {
    const e = {}
    if (!images.length) e.images = 'Add at least one photo.'
    if (values.name.trim().length < 3) e.name = 'Give the item a name (at least 3 characters).'
    else if (API_MODE && values.name.trim().length > 100) e.name = 'Keep the name under 100 characters.'
    if (!values.category) e.category = 'Choose a category.'
    if (!values.gender) e.gender = 'Choose who it is for.'
    if (!values.size) e.size = 'Choose a size.'
    if (!values.condition) e.condition = 'Choose a condition.'
    if (OPTIONS.colourRequired && (values.colour.trim().length < 2 || values.colour.trim().length > 30)) e.colour = 'Enter the main colour (2-30 characters).'
    if (type === 'exchange' && values.lookingFor.trim().length < 3) e.lookingFor = 'Tell people what you would like in return.'
    if (needsPrice && !(Number(values.price) > 0)) e.price = 'Enter a price above ₹0.'
    else if (needsPrice && API_MODE && (!Number.isInteger(Number(values.price)) || Number(values.price) > 99999)) e.price = 'Enter a whole number of rupees, up to ₹99,999.'
    if (values.description.trim().length < 10) e.description = 'Add a short description (at least 10 characters).'
    else if (API_MODE && encodeDescription(values).length > BACKEND_DESCRIPTION_MAX) e.description = `Too long: the description, location and exchange wish together can be at most ${BACKEND_DESCRIPTION_MAX} characters.`
    if (!values.location.trim()) e.location = 'Add your campus or neighbourhood.'
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return toast('Please fix the highlighted fields.', 'error')
    setSubmitting(true)
    try {
      const listing = await createListing({ owner: user, ...values, price: needsPrice ? Number(values.price) : undefined, listingType: type, images })
      setDone(listing)
      toast(isSell ? 'Listing published.' : 'Donation submitted.')
    } catch (err) {
      if (err && err.code === 'PHOTOS_NOT_UPLOADED') {
        // The listing EXISTS (it is never deleted automatically). Show a message that stays, and block a second submit.
        setSavedWithoutPhotos(err)
        toast('Listing saved, but its photos were not uploaded.', 'error')
        return
      }
      const fe = uiFieldErrors(err) // the backend's field messages, shown next to the form fields
      if (Object.keys(fe).length) setErrors(fe)
      toast(err.message || 'Something went wrong. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => { setValues(empty); setImages([]); setErrors({}); setDone(null); setSavedWithoutPhotos(null) }

  if (done) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <CheckCircle2 size={48} className="text-plum mx-auto mb-5" />
        <h2 className="text-4xl">{isSell ? 'Your piece is listed.' : 'Thank you for giving.'}</h2>
        <p className="mt-3 text-charcoal/70">{isSell ? 'Interested students can now send you requests.' : 'Students can now request your donation.'}{!API_MODE && ' (Demo mode: visible in Explore until you refresh the page.)'}</p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to={`/product/${done.id}`}><Button>View listing</Button></Link>
          <Button variant="secondary" onClick={reset}>{isSell ? 'List another piece' : 'Donate another piece'}</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="grid lg:grid-cols-2 gap-12">
      {savedWithoutPhotos && (
        <div role="alert" className="lg:col-span-2 border border-plum text-plum text-sm p-4 flex flex-col gap-3">
          <p className="font-medium">{savedWithoutPhotos.message}</p>
          <div className="flex flex-wrap gap-3">
            <Link to={isDonate || type === 'donate' ? '/dashboard?tab=donations' : '/dashboard?tab=listings'}><Button type="button">{isDonate || type === 'donate' ? 'Go to My Donations' : 'Go to My Listings'}</Button></Link>
            <Button type="button" variant="secondary" onClick={reset}>Start a new listing</Button>
          </div>
        </div>
      )}
      <section>
        <h2 className="text-3xl mb-1">Add your best photos</h2>
        <p className="text-sm text-charcoal/70 mb-6">Clear photos help the right person find it.</p>
        <ImageUploader images={images} onChange={(i) => { setImages(i); setErrors((e) => ({ ...e, images: '' })) }} error={errors.images} />
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-3xl -mb-2">Tell us about it</h2>
        {isSell && (
          <div role="group" aria-label="Listing type" className="flex border border-plum w-fit">
            {[['sell', 'Sell it'], ['exchange', 'Swap it']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={`px-5 py-2 text-sm ${type === k ? 'bg-plum text-cream' : 'text-plum'}`}>{l}</button>))}
          </div>
        )}
        <FormField id="name" label="Item name" error={errors.name}>
          <input id="name" value={values.name} onChange={set('name')} placeholder="e.g. Vintage denim jacket" className={inputClass(errors.name)} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="category" label="Category" error={errors.category}>
            <select id="category" value={values.category} onChange={set('category')} className={inputClass(errors.category)}>
              <option value="">Select category</option>{OPTIONS.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField id="gender" label="For" error={errors.gender}>
            <select id="gender" value={values.gender} onChange={set('gender')} className={inputClass(errors.gender)}>
              <option value="">Men / Women / Unisex</option>{OPTIONS.genders.map((g) => <option key={g}>{g}</option>)}
            </select>
          </FormField>
          <FormField id="size" label="Size" error={errors.size}>
            <select id="size" value={values.size} onChange={set('size')} className={inputClass(errors.size)}>
              <option value="">Select size</option>{OPTIONS.formSizes.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField id="condition" label="Condition" error={errors.condition}>
            <select id="condition" value={values.condition} onChange={set('condition')} className={inputClass(errors.condition)}>
              <option value="">Select condition</option>{OPTIONS.conditions.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField id="colour" label={OPTIONS.colourRequired ? 'Colour' : 'Colour (optional)'} error={errors.colour}>
            <input id="colour" value={values.colour} onChange={set('colour')} placeholder="e.g. Navy blue" className={inputClass(errors.colour)} />
          </FormField>
          {needsPrice && (
            <FormField id="price" label="Price (₹)" error={errors.price}>
              <input id="price" type="number" min="1" inputMode="numeric" value={values.price} onChange={set('price')} placeholder="650" className={inputClass(errors.price)} />
            </FormField>
          )}
        </div>
        {type === 'exchange' && (
          <FormField id="lookingFor" label="Looking for in exchange" error={errors.lookingFor} hint="e.g. Knitwear, jackets · Size M">
            <input id="lookingFor" value={values.lookingFor} onChange={set('lookingFor')} className={inputClass(errors.lookingFor)} />
          </FormField>
        )}
        <FormField id="description" label="Description" error={errors.description}>
          <textarea id="description" rows="4" value={values.description} onChange={set('description')} placeholder="Share the fit, fabric, how often it was worn, and anything else worth knowing…" className={inputClass(errors.description)} />
        </FormField>
        <FormField id="location" label={isSell ? 'Campus or location' : 'Pickup location'} error={errors.location} hint={API_MODE ? 'Shown at the end of your description so people can see it.' : undefined}>
          <div className="relative">
            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-rose" />
            <input id="location" value={values.location} onChange={set('location')} placeholder="e.g. North Campus, Delhi" className={`${inputClass(errors.location)} pl-11`} />
          </div>
        </FormField>
        <Button type="submit" disabled={submitting || Boolean(savedWithoutPhotos)} className="w-full py-4">
          {submitting ? 'Submitting…' : isSell ? <>Publish listing <ArrowRight size={16} /></> : <>Submit donation <ArrowRight size={16} /></>}
        </Button>
        <p className="text-xs text-center text-charcoal/60 -mt-2">{isSell ? 'Payments and hand-over are arranged directly between students after you accept a request.' : 'Hand-over is arranged directly with the student you accept.'}</p>
      </section>
    </form>
  )
}
