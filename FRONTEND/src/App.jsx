import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Explore from './pages/Explore'
import Exchange from './pages/Exchange'
import ProductDetails from './pages/ProductDetails'
import Sell from './pages/Sell'
import Donate from './pages/Donate'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import About from './pages/About'
import ComingSoon from './pages/ComingSoon'

// Pages that need an account send guests to /login and bring them back afterwards.
function Protected({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
}

export default function App() {
  const { pathname } = useLocation()
  const bare = pathname === '/login' || pathname === '/signup' // split-screen pages have their own layout
  return (
    // overflow-x-clip stops stray decorative shapes from causing sideways scrolling (unlike overflow-hidden it keeps the sticky navbar working)
    <div className="min-h-screen flex flex-col overflow-x-clip">
      {!bare && <Navbar />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/exchange" element={<Exchange />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/about" element={<About />} />
          <Route path="/sell" element={<Protected><Sell /></Protected>} />
          <Route path="/donate" element={<Protected><Donate /></Protected>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/admin" element={<Protected><Admin /></Protected>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<ComingSoon name="Page not found" />} />
        </Routes>
      </main>
      {!bare && <Footer />}
    </div>
  )
}
