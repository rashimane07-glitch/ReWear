import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import FormField, { inputClass } from './FormField'
import ImageUploader from './ImageUploader'
import ImageWithFallback from './ImageWithFallback'
import { API_MODE } from '../services/config'
import { OPTIONS, uiFieldErrors, BACKEND_DESCRIPTION_MAX } from '../services/listingMapper'
import { updateListing } from '../services/api'

const MAX_PHOTOS = 5

// A select that still shows a value that is not in the list (e.g. an old demo size like "28"), so nothing is lost.
function Choice({ id, label, value, onChange, options, error, placeholder }) {
  const all = value && !options.includes(value) ? [value, ...options] : options
  return (
    <FormField id={id} label={label} error={error}>
      <select id={id} value={value} onChange={onChange} className={inputClass(error)}>
        <option value="">{placeholder}</option>
        {all.map((o) => <option key={o}>{o}</option>)}
      </select>
    </FormField>
  )
}

// Edit one of my listings (only while it is available). Sends only the changed fields; photos can be ADDED
// (the backend cannot remove or replace photos). onSaved(listing, changed) is called after a successful save;
// onStale() when a failed save may still have changed something (the dashboard reloads, the dialog stays open).
export default function EditListingModal({ item, onClose, onSaved, onStale }) {
  const isSell = item.listingType === 'sell'
  const [values, setValues] = useState({
    name: item.name || '', description: item.description || '', category: item.category || '', gender: item.gender || '',
    size: item.size || '', condition: item.condition || '', colour: item.colour || '', price: isSell ? String(item.price ?? '') : '',
  })
  const [newImages, setNewImages] = useState([])
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const existingPhotos = item.images || []
  const photosLeft = Math.max(0, MAX_PHOTOS - existingPhotos.length)

  const set = (key) => (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setErrors((er) => ({ ...er, [key]: '' })) }

  const validate = () => {
    const e = {}
    const name = values.name.trim()
    if (name.length < 3 || name.length > 100) e.name = 'The name must be 3-100 characters long.'
    if (!values.category) e.category = 'Choose a category.'
    if (!values.size) e.size = 'Choose a size.'
    if (!values.condition) e.condition = 'Choose a condition.'
    if (OPTIONS.colourRequired && (values.colour.trim().length < 2 || values.colour.trim().length > 30)) e.colour = 'Enter the main colour (2-30 characters).'
    const price = Number(values.price)
    if (isSell && (!Number.isInteger(price) || price < 1 || price > 99999)) e.price = 'Enter a whole number of rupees from ₹1 to ₹99,999.'
    const description = values.description.trim()
    if (description.length < 10) e.description = 'Add a short description (at least 10 characters).'
    else if (API_MODE && description.length > BACKEND_DESCRIPTION_MAX) e.description = `Keep the description under ${BACKEND_DESCRIPTION_MAX} characters.`
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (saving) return
    setFormError('')
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const { listing, changed } = await updateListing(item, values, newImages)
      onSaved(listing, changed)
    } catch (err) {
      const fieldErrors = uiFieldErrors(err) // the backend's messages next to the fields
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
      setFormError(err.message || 'Could not save your changes.')
      // Changes saved but photos failed, or the listing can no longer be edited: the dashboard must reload.
      if (err.code === 'PHOTOS_NOT_UPLOADED' || err.code === 'LISTING_LOCKED' || err.status === 404) onStale()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit listing" onClose={saving ? () => {} : onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <p role="alert" className="border border-plum text-plum text-sm p-3">{formError}</p>}
        <FormField id="edit-name" label="Item name" error={errors.name}>
          <input id="edit-name" value={values.name} onChange={set('name')} className={inputClass(errors.name)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <Choice id="edit-category" label="Category" value={values.category} onChange={set('category')} options={OPTIONS.categories} error={errors.category} placeholder="Select category" />
          <Choice id="edit-gender" label="For" value={values.gender} onChange={set('gender')} options={OPTIONS.genders} error={errors.gender} placeholder="Not specified" />
          <Choice id="edit-size" label="Size" value={values.size} onChange={set('size')} options={OPTIONS.formSizes} error={errors.size} placeholder="Select size" />
          <Choice id="edit-condition" label="Condition" value={values.condition} onChange={set('condition')} options={OPTIONS.conditions} error={errors.condition} placeholder="Select condition" />
          <FormField id="edit-colour" label={OPTIONS.colourRequired ? 'Colour' : 'Colour (optional)'} error={errors.colour}>
            <input id="edit-colour" value={values.colour} onChange={set('colour')} className={inputClass(errors.colour)} />
          </FormField>
          {isSell && (
            <FormField id="edit-price" label="Price (₹)" error={errors.price}>
              <input id="edit-price" type="number" min="1" inputMode="numeric" value={values.price} onChange={set('price')} className={inputClass(errors.price)} />
            </FormField>
          )}
        </div>
        <FormField id="edit-description" label="Description" error={errors.description}>
          <textarea id="edit-description" rows="4" value={values.description} onChange={set('description')} className={inputClass(errors.description)} />
        </FormField>

        <div>
          <p className="text-sm font-medium mb-2">Photos</p>
          {existingPhotos.length > 0 ? (
            <ul className="grid grid-cols-5 gap-2 mb-3">
              {existingPhotos.map((src, i) => <li key={src}><ImageWithFallback src={src} alt={`Photo ${i + 1}`} className="w-full aspect-square" /></li>)}
            </ul>
          ) : <p className="text-xs text-charcoal/60 mb-3">No photos yet.</p>}
          {photosLeft > 0
            ? <ImageUploader images={newImages} onChange={setNewImages} maxImages={photosLeft} />
            : <p className="text-xs text-charcoal/60">This listing already has {MAX_PHOTOS} photos (the maximum).</p>}
          <p className="text-xs text-charcoal/60 mt-2">You can add photos here. Existing photos cannot be removed or replaced yet.</p>
        </div>

        <div className="flex gap-3 mt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        </div>
      </form>
    </Modal>
  )
}
