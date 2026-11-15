import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './context/AuthContext'
import { WishlistProvider } from './context/WishlistContext'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><ToastProvider><AuthProvider><WishlistProvider><App /></WishlistProvider></AuthProvider></ToastProvider></BrowserRouter></React.StrictMode>
)
