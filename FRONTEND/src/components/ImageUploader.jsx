import { useRef, useState } from 'react'
import { Camera, X, RefreshCw } from 'lucide-react'

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MB = 10
const MAX_IMAGES = 5

// images: [{ id, file, url }]. The parent owns the list; we call onChange with the new list.
export default function ImageUploader({ images, onChange, error }) {
  const inputRef = useRef(null)
  const replaceRef = useRef(null)
  const replaceIndex = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')

  // Returns an image object, or sets an error message and returns null.
  const check = (file) => {
    if (!TYPES.includes(file.type)) return setMessage(`"${file.name}" is not supported. Use JPG, PNG or WebP.`) || null
    if (file.size > MAX_MB * 1024 * 1024) return setMessage(`"${file.name}" is larger than ${MAX_MB}MB.`) || null
    return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }
  }

  const addFiles = (fileList) => {
    setMessage('')
    const next = [...images]
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_IMAGES) { setMessage(`You can add up to ${MAX_IMAGES} photos.`); break }
      const img = check(file)
      if (img) next.push(img)
    }
    onChange(next)
  }

  const remove = (id) => {
    const img = images.find((i) => i.id === id)
    if (img) URL.revokeObjectURL(img.url)
    onChange(images.filter((i) => i.id !== id))
    setMessage('')
  }

  const replace = (file) => {
    setMessage('')
    const img = check(file)
    if (!img) return
    URL.revokeObjectURL(images[replaceIndex.current].url)
    onChange(images.map((x, i) => (i === replaceIndex.current ? img : x)))
  }

  const shownError = message || error
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        className={`border border-dashed p-8 text-center transition-colors ${dragging ? 'bg-blush' : 'bg-blush/30'} ${shownError ? 'border-plum' : 'border-rose'}`}
      >
        <div className="w-16 h-16 rounded-full bg-blush mx-auto flex items-center justify-center mb-4"><Camera className="text-plum" /></div>
        <p className="font-display text-2xl text-plum">Drop your photos here</p>
        <p className="text-xs text-charcoal/70 mt-2">Use natural light and show the full piece.<br />JPG, PNG or WebP · up to {MAX_MB}MB each · max {MAX_IMAGES} photos</p>
        {/* accept="image/*" lets phones offer the camera as well as the gallery */}
        <input ref={inputRef} type="file" accept={TYPES.join(',')} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <button type="button" onClick={() => inputRef.current.click()} className="mt-5 border border-plum text-plum px-5 py-2.5 text-sm font-medium hover:bg-plum hover:text-cream">Choose from device</button>
      </div>
      {shownError && <p role="alert" className="text-xs text-plum font-medium mt-2">{shownError}</p>}

      <input ref={replaceRef} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { if (e.target.files[0]) replace(e.target.files[0]); e.target.value = '' }} />
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 mt-4">
          {images.map((img, i) => (
            <li key={img.id} className="relative aspect-square bg-blush">
              <img src={img.url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-1 left-1 bg-cream text-plum text-[10px] px-1.5 py-0.5">Cover</span>}
              <div className="absolute bottom-1 right-1 flex gap-1">
                <button type="button" aria-label={`Replace photo ${i + 1}`} onClick={() => { replaceIndex.current = i; replaceRef.current.click() }} className="w-7 h-7 bg-cream text-plum flex items-center justify-center"><RefreshCw size={14} /></button>
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(img.id)} className="w-7 h-7 bg-cream text-plum flex items-center justify-center"><X size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
