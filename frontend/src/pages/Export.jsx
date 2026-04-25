import { useState } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function Export() {
  const [exporting, setExporting] = useState(null)

  const handleExport = (type) => {
    setExporting(type)
    const a = document.createElement('a')
    a.href = `${BASE}/api/export/${type}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => setExporting(null), 2000)
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-white mb-2">Export Data</h2>
      <p className="text-zinc-500 text-sm mb-8">
        Download your complete workout history for research and analysis.
      </p>

      <div className="space-y-4">
        <div className="bg-ft-card border border-ft-border rounded-xl p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">📊</span>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-1">CSV Export</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Flat spreadsheet with all exercises, sets, reps, weight, and volume. Compatible
                with Excel, Google Sheets, R, and SPSS.
              </p>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting === 'csv'}
                className="bg-green-500 hover:bg-green-400 disabled:bg-ft-surface disabled:text-zinc-600 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {exporting === 'csv' ? 'Downloading…' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-ft-card border border-ft-border rounded-xl p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">📄</span>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-1">PDF Report</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Formatted workout report for NCSSM project submission and academic review.
                Includes exercise tables with volume totals.
              </p>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting === 'pdf'}
                className="bg-green-500 hover:bg-green-400 disabled:bg-ft-surface disabled:text-zinc-600 text-black font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {exporting === 'pdf' ? 'Generating…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-ft-surface/40 border border-ft-border rounded-xl p-4">
          <p className="text-xs text-zinc-500 leading-relaxed">
            <span className="text-zinc-300 font-medium">Privacy:</span> All data is stored
            exclusively on your server. No telemetry, no external AI processing, no third-party
            cloud uploads. Your research data remains yours.
          </p>
        </div>
      </div>
    </div>
  )
}
