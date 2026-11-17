// THE ONE PLACE that talks to the ReWear backend (REAL mode only; MOCK mode never calls this).
//
//   import { get, post, patch, del, getPage, ApiError } from './http'
//
//   await get('/auth/me')                          -> the backend's "data" object, e.g. { user }
//   await post('/auth/login', { email, password }, { auth: false })
//   await patch('/users/me', { name: 'Ananya' })
//   await del('/listings/abc')
//   await post('/listings', formData)              -> pass a FormData and it is sent as multipart
//   const { data, meta } = await getPage('/listings?limit=12')   (lists that come with paging "meta")
//
// What this helper does for every call:
//  - Adds "Authorization: Bearer <JWT>" when a real token is saved (turn off with { auth: false }).
//  - Sends JSON for plain objects. For a FormData it sends the form as it is and does NOT set a
//    Content-Type: the browser must add the multipart boundary itself, a hand-written one breaks uploads.
//  - Unwraps the backend envelope. Success is { success: true, data, meta? }; the caller gets `data`.
//  - Turns every failure into an ApiError with a readable message: network problems, backend errors
//    { success: false, error: { code, message, details? } } and unexpected replies. It never returns
//    a fake "success".
//  - If the server answers 401 to a request that carried a token (expired token, deleted account), the
//    saved session is deleted and SESSION_EXPIRED_EVENT is sent, so AuthContext logs the person out.
import { API_URL } from './config'
import { getToken, clearSession, SESSION_EXPIRED_EVENT } from './session'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status // HTTP status; 0 = the server could not be reached
    this.code = code // the backend's error code, e.g. 'INVALID_CREDENTIALS', 'VALIDATION_ERROR'
    this.details = details // for validation errors: [{ field, message }]
  }
}

// { field: message } from a validation error, for showing text next to form fields. {} for other errors.
export function fieldErrors(error) {
  const result = {}
  if (error && Array.isArray(error.details)) {
    error.details.forEach((d) => {
      if (d && d.field && !result[d.field]) result[d.field] = d.message
    })
  }
  return result
}

// A validation error carries one generic sentence ("Please correct the highlighted fields.") plus the
// real reasons in `details`. The pages show error.message, so put the real reasons in the message.
function messageFor(error, status) {
  if (error && Array.isArray(error.details) && error.details.length > 0) {
    const reasons = [...new Set(error.details.map((d) => d && d.message).filter(Boolean))]
    if (reasons.length > 0) return reasons.join(' ')
  }
  return (error && error.message) || `The server answered with an error (${status}).`
}

async function send(method, path, { body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' }
  const token = auth ? getToken() : undefined
  if (token) headers.Authorization = `Bearer ${token}`

  let payload
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    payload = body // no Content-Type here, on purpose (see the top of this file)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal })
  } catch (err) {
    if (err && err.name === 'AbortError') throw err // the caller cancelled it: not a failure to report
    throw new ApiError('Could not reach the server. Check your connection and try again.', { status: 0, code: 'NETWORK_ERROR' })
  }

  let json = null
  try {
    json = await response.json()
  } catch {
    // not JSON (a proxy error page, an empty body): handled below
  }

  if (!response.ok || (json && json.success === false)) {
    if (response.status === 401 && token) {
      clearSession()
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    const error = (json && json.error) || {}
    throw new ApiError(messageFor(error, response.status), { status: response.status, code: error.code, details: error.details })
  }
  if (!json || json.success !== true) {
    throw new ApiError('The server sent a reply this app does not understand.', { status: response.status, code: 'BAD_RESPONSE' })
  }
  return { data: json.data, meta: json.meta }
}

export const getPage = (path, options) => send('GET', path, options)
export const get = (path, options) => send('GET', path, options).then((r) => r.data)
export const post = (path, body, options) => send('POST', path, { ...options, body }).then((r) => r.data)
export const patch = (path, body, options) => send('PATCH', path, { ...options, body }).then((r) => r.data)
export const del = (path, options) => send('DELETE', path, options).then((r) => r.data)
