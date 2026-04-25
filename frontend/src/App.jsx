import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import LogWorkout from './pages/LogWorkout'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Export from './pages/Export'
import FoodLog from './pages/FoodLog'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-[#0d0b1e] via-[#0d0b1e] to-[#0a1020] text-white">
        <Navbar />
        <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<LogWorkout />} />
            <Route path="/history" element={<History />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/export" element={<Export />} />
            <Route path="/food" element={<FoodLog />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
