import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('fittrack_token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/api/auth/me')
      .then(res => setUser(res.data))
      .catch(() => localStorage.removeItem('fittrack_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('fittrack_token', res.data.token)
    setUser(res.data.user)
    return res.data.user
  }

  const signup = async (firstName, lastName, email, password) => {
    const res = await api.post('/api/auth/signup', {
      first_name: firstName,
      last_name: lastName,
      email,
      password,
    })
    localStorage.setItem('fittrack_token', res.data.token)
    setUser(res.data.user)
    return res.data.user
  }

  const logout = () => {
    localStorage.removeItem('fittrack_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
