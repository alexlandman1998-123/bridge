import { useEffect, useState } from 'react'
import { fetchDevelopmentSettings, updateDevelopmentSettings } from '../lib/api'

const SETTINGS_COPY = [
  {
    key: 'client_portal_enabled',
    title: 'Client Portal Enabled',
    description: 'Allow buyers to access their dedicated client portal link.',
  },
  {
    key: 'snag_reporting_enabled',
    title: 'Unit Issues Enabled',
    description: 'Allow clients to submit snag/unit issues.',
  },
  {
    key: 'alteration_requests_enabled',
    title: 'Alteration Requests Enabled',
    description: 'Allow clients to submit alteration/change requests.',
  },
  {
    key: 'service_reviews_enabled',
    title: 'Service Reviews Enabled',
    description: 'Allow clients to leave reviews once registration/handover stage is reached.',
  },
]

function DevelopmentFeatureSettings({ developmentId, onSaved }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!developmentId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const data = await fetchDevelopmentSettings(developmentId)
        setSettings(data)
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [developmentId])

  async function handleSave(event) {
    event.preventDefault()
    if (!settings || !developmentId) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const saved = await updateDevelopmentSettings(developmentId, settings)
      setSettings(saved)
      if (onSaved) {
        onSaved(saved)
      }
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="status-message">Loading client feature controls...</p>
  }

  if (!settings) {
    return null
  }

  return (
    <section className="panel development-feature-settings no-print">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Client Portal Controls</h3>
          <p>Control what buyers can see and submit in the client portal for this development.</p>
        </div>
      </div>

      {error ? <p className="status-message error">{error}</p> : null}

      <form className="feature-settings-form" onSubmit={handleSave}>
        {SETTINGS_COPY.map((item) => (
          <label className="feature-toggle-row" key={item.key}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
            <input
              type="checkbox"
              checked={Boolean(settings[item.key])}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  [item.key]: event.target.checked,
                }))
              }
            />
          </label>
        ))}

        <button type="submit" disabled={saving}>
          Save Controls
        </button>
      </form>
    </section>
  )
}

export default DevelopmentFeatureSettings
