import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('fittrack_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fittrack_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const getExercises = (params) => api.get('/api/exercises', { params })
export const createExercise = (data) => api.post('/api/exercises', data)
export const deleteExercise = (id) => api.delete(`/api/exercises/${id}`)

export const getWorkouts = (params) => api.get('/api/workouts', { params })
export const getWorkout = (id) => api.get(`/api/workouts/${id}`)
export const createWorkout = (data) => api.post('/api/workouts', data)
export const deleteWorkout = (id) => api.delete(`/api/workouts/${id}`)

export const getSummary = () => api.get('/api/analytics/summary')
export const getVolume = (params) => api.get('/api/analytics/volume', { params })
export const getStrength = (params) => api.get('/api/analytics/strength', { params })
export const getFrequency = (params) => api.get('/api/analytics/frequency', { params })

export const getFoodTrend = (params) => api.get('/api/analytics/food-trend', { params })
export const getCaloriesBurned = (params) => api.get('/api/analytics/calories-burned', { params })

export const exportCSV = () => {
  const token = localStorage.getItem('fittrack_token')
  window.open(`${BASE}/api/export/csv?token=${token}`)
}
export const exportPDF = () => {
  const token = localStorage.getItem('fittrack_token')
  window.open(`${BASE}/api/export/pdf?token=${token}`)
}

export const searchFood = (q) => api.get('/api/food/search', { params: { q } })
export const getFoodLogs = (date) => api.get('/api/food', { params: { date } })
export const createFoodLog = (data) => api.post('/api/food', data)
export const updateFoodLog = (id, data) => api.put(`/api/food/${id}`, data)
export const deleteFoodLog = (id) => api.delete(`/api/food/${id}`)

export const getProfile = () => api.get('/api/profile')
export const updateProfile = (data) => api.put('/api/profile', data)

export default api
