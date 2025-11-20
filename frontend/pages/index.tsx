import { useState } from 'react'
import Head from 'next/head'
import Papa from 'papaparse'

interface Result {
  prompt: string
  brandName: string
  mentioned: string
  position: number | null
  geminiResponse?: string
  usedCannedResponse?: boolean
  errorOccurred?: boolean
}

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [brandName, setBrandName] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!prompt.trim() || !brandName.trim()) {
      setError('Please fill in both fields')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/check-brand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, brandName }),
      })

      const data = await response.json()

      if (data.success && data.data) {
        // Add new result to the beginning of the array
        setResults([data.data, ...results])
        setError('')
      } else {
        setError(data.error || 'An error occurred while processing your request')
      }
    } catch (err) {
      console.error('Request error:', err)
      setError('Failed to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const downloadCSV = () => {
    if (results.length === 0) {
      setError('No results to download')
      return
    }

    // Prepare data for CSV
    const csvData = results.map(result => ({
      'Prompt': result.prompt,
      'Brand Name': result.brandName,
      'Mentioned': result.mentioned,
      'Position': result.position || 'N/A'
    }))

    // Generate CSV
    const csv = Papa.unparse(csvData)
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `brand-mentions-${Date.now()}.csv`)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const clearResults = () => {
    setResults([])
    setError('')
  }

  return (
    <>
      <Head>
        <title>Gemini Brand Mention Checker</title>
        <meta name="description" content="Check if your brand is mentioned by Gemini AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Gemini Brand Mention Checker
            </h1>
            <p className="text-gray-600 text-lg">
              Check if your brand is mentioned by Google Gemini AI
            </p>
          </div>

          {/* Form Card */}
          <div className="card mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="prompt" className="block text-sm font-semibold text-gray-700 mb-2">
                  Enter Prompt
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., Recommend the best CRM software for enterprise businesses"
                  rows={3}
                  className="input-field resize-none"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="brandName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Enter Brand Name
                </label>
                <input
                  type="text"
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g., Salesforce"
                  className="input-field"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking...
                  </span>
                ) : (
                  'Run Check'
                )}
              </button>
            </form>
          </div>

          {/* Results Section */}
          {results.length > 0 && (
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Results</h2>
                <div className="flex gap-3">
                  <button
                    onClick={downloadCSV}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download CSV
                  </button>
                  <button
                    onClick={clearResults}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-all duration-200"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Prompt
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Brand Name
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Mentioned
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Position
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.map((result, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                          <div className="line-clamp-2" title={result.prompt}>
                            {result.prompt}
                          </div>
                          {result.usedCannedResponse && (
                            <span className="inline-block mt-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                              Fallback response
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {result.brandName}
                        </td>
                        <td className="px-6 py-4 text-sm text-center">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            result.mentioned === 'Yes' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {result.mentioned}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-center font-semibold">
                          {result.position || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {results.length === 0 && (
            <div className="card text-center py-12">
              <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results yet</h3>
              <p className="text-gray-600">Enter a prompt and brand name above to start checking</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

