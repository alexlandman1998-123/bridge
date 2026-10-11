import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart3, Eye, Globe2, Monitor, MousePointerClick, RefreshCw, Send, Smartphone, Tablet, Users } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import './development-website-analytics.css'

const number = value => new Intl.NumberFormat('en-ZA').format(Number(value) || 0)
const count = value => Math.max(0, Number(value) || 0)
const METRICS = [
  { key: 'sessions', label: 'Sessions', icon: Users, description: 'Recorded browsing sessions' },
  { key: 'sceneViews', label: 'Views', icon: Eye, description: 'Views of development scenes' },
  { key: 'unitOpens', label: 'Property opens', icon: MousePointerClick, description: 'Times a property was opened' },
  { key: 'enquiries', label: 'Enquiries started', icon: Send, description: 'Enquiry form starts' }
]
const RANKINGS = {
  units: { label: 'Popular properties', name: 'Property', value: 'opens', valueLabel: 'Opens', detail: 'shortlists', detailLabel: 'Saves' },
  scenes: { label: 'Popular views', name: 'View', value: 'views', valueLabel: 'Views', detail: 'enquiries', detailLabel: 'Enquiry starts' },
  dropoffs: { label: 'Drop-off points', name: 'View', value: 'abandonments', valueLabel: 'Drop-offs' }
}
const DEVICE_STYLE = { mobile: { icon: Smartphone, colour: '#23845b', label: 'Mobile' }, desktop: { icon: Monitor, colour: '#6b99b8', label: 'Desktop' }, tablet: { icon: Tablet, colour: '#d0b378', label: 'Tablet' } }
const rowName = row => row.name || row.unit_number || row.id || 'Unknown'

export default function DevelopmentWebsiteAnalyticsDashboard({ analytics, days, onDaysChange, onRefresh, loading, error, isDemo, hasDemo, onSourceChange }) {
  const headingId = useId()
  const [metricKey, setMetricKey] = useState('sessions')
  const [selectedDevice, setSelectedDevice] = useState('')
  const [ranking, setRanking] = useState('units')
  const [sort, setSort] = useState({ key: 'value', direction: 'desc' })
  const [selectedRow, setSelectedRow] = useState('')
  const summary = analytics?.summary || {}
  const activeMetric = METRICS.find(metric => metric.key === metricKey)
  const config = RANKINGS[ranking]
  const rows = [...(analytics?.[ranking] || [])].sort((a, b) => {
    const comparison = sort.key === 'name' ? rowName(a).localeCompare(rowName(b), undefined, { numeric: true }) : count(a[sort.key === 'detail' ? config.detail : config.value]) - count(b[sort.key === 'detail' ? config.detail : config.value])
    return sort.direction === 'asc' ? comparison : -comparison
  })
  const devices = (analytics?.devices || []).map(device => ({ ...device, sessions: count(device.sessions), ...(DEVICE_STYLE[device.device] || { icon: Monitor, colour: '#80958b', label: device.device }) }))
  // A session can appear on several viewports. Chart shares use device-session totals.
  const deviceTotal = devices.reduce((total, device) => total + device.sessions, 0)
  const activeDevice = devices.find(device => device.device === selectedDevice)
  let angle = 0
  const donut = devices.map(device => {
    const start = angle
    angle += deviceTotal ? device.sessions / deviceTotal * 360 : 0
    return `${device.colour} ${start}deg ${angle}deg`
  }).join(', ')
  const maximum = Math.max(1, ...METRICS.map(metric => count(summary[metric.key])))
  const rowMaximum = Math.max(1, ...rows.map(row => count(row[config.value])))
  const selected = rows.find(row => row.id === selectedRow)
  const unavailable = !analytics && !loading && !error
  const display = value => loading ? '…' : analytics ? number(value) : '—'
  function sortBy(key) { setSort(previous => ({ key, direction: previous.key === key && previous.direction === 'desc' ? 'asc' : 'desc' })) }
  function sortHeading(key, label) {
    const Icon = sort.direction === 'desc' ? ArrowDown : ArrowUp
    return <button type="button" onClick={() => sortBy(key)} className="website-sort">{label}{sort.key === key ? <Icon size={13} aria-hidden="true" /> : null}</button>
  }

  return (
    <section className="development-website-analytics" aria-labelledby={headingId} aria-busy={loading}>
      <header className="website-heading">
        <div><span className="website-eyebrow"><Globe2 size={15} aria-hidden="true" /> Website performance</span><h3 id={headingId}>Understand your audience.</h3><p>Explore how buyers use your development website and which properties catch their eye.</p></div>
        <div className="website-toolbar">
          {hasDemo ? <label className="sr-only" htmlFor={`${headingId}-source`}>Analytics data source</label> : null}
          {hasDemo ? <Field id={`${headingId}-source`} as="select" value={isDemo ? 'demo' : 'tracked'} onChange={event => { setSelectedRow(''); setSelectedDevice(''); onSourceChange(event.target.value) }}><option value="demo">Demo data</option><option value="tracked">Tracked activity</option></Field> : null}
          <label className="sr-only" htmlFor={`${headingId}-days`}>Analytics period</label>
          <Field id={`${headingId}-days`} as="select" value={days} onChange={event => { setSelectedRow(''); setSelectedDevice(''); onDaysChange(Number(event.target.value)) }}>{[7, 30, 90].map(value => <option key={value} value={value}>Last {value} days</option>)}</Field>
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={onRefresh}><RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />Refresh</Button>
        </div>
      </header>

      <div className={`website-source ${isDemo ? 'is-demo' : ''}`} role="status">
        <span className="website-source-dot" aria-hidden="true" />
        <span>{isDemo ? 'Demo data · Harbour Heights' : 'Tracked website activity'}<span className="website-source-note">{isDemo ? 'Illustrative figures for previewing this dashboard.' : `Recorded activity over the last ${days} days.`}</span></span>
      </div>
      {error ? <div role="alert" className="website-notice is-error">{error}</div> : null}
      {unavailable ? <div className="website-notice">Website analytics are unavailable for this development. Refresh to check again.</div> : null}
      {analytics && !loading && !count(summary.sessions) ? <div className="website-notice">No website activity recorded in this period. Choose a longer period or refresh after buyers explore the website.</div> : null}

      <div className="website-metrics" aria-label="Website activity metrics">
        {METRICS.map(({ key, label, icon, description }) => { const Icon = icon; return <button key={key} type="button" className={`website-metric ${key === metricKey ? 'is-active' : ''}`} aria-pressed={key === metricKey} onClick={() => setMetricKey(key)}><span className="website-metric-top"><Icon size={18} aria-hidden="true" /><ArrowUpRight size={15} aria-hidden="true" /></span><strong>{display(summary[key])}</strong><span className="website-metric-label">{label}</span><span className="website-metric-description">{description}</span></button> })}
      </div>

      <div className="website-charts">
        <article className="website-panel website-activity">
          <div className="website-panel-heading"><div><span className="website-eyebrow">Buyer activity</span><h4>From exploring to enquiring</h4></div><BarChart3 size={20} aria-hidden="true" /></div>
          <div className="website-activity-selected" aria-live="polite"><strong>{display(summary[metricKey])}</strong><span>{activeMetric.label.toLowerCase()}<small>in the selected period</small></span></div>
          <div className="website-bars" aria-label="Website activity comparison">
            {METRICS.map(metric => <button type="button" key={metric.key} aria-pressed={metricKey === metric.key} onClick={() => setMetricKey(metric.key)} className={metricKey === metric.key ? 'is-active' : ''}><span className="website-bar-label"><span>{metric.label}</span><strong>{display(summary[metric.key])}</strong></span><span className="website-bar-track"><span style={{ width: loading ? '0%' : `${count(summary[metric.key]) / maximum * 100}%` }} /></span></button>)}
          </div>
          <p className="website-chart-note">Views, opens and enquiry starts are event counts. One session can include multiple events.</p>
        </article>
        <article className="website-panel">
          <div className="website-panel-heading"><div><span className="website-eyebrow">Your audience</span><h4>Where buyers browse</h4></div><Smartphone size={20} aria-hidden="true" /></div>
          <div className="website-device-chart">
            <div className="website-donut" role="img" aria-label={analytics && !loading ? `Device sessions: ${devices.map(device => `${device.label} ${number(device.sessions)}`).join(', ')}` : 'Device chart unavailable'} style={{ background: !loading && deviceTotal ? `conic-gradient(${donut})` : '#e5eee8' }}><div><strong>{display(activeDevice ? activeDevice.sessions : deviceTotal)}</strong><span>{activeDevice ? activeDevice.label : 'Device sessions'}</span>{activeDevice && deviceTotal ? <small>{(activeDevice.sessions / deviceTotal * 100).toFixed(1)}% share</small> : null}</div></div>
            <div className="website-device-legend">{devices.map(({ device, sessions, colour, label, icon }) => { const Icon = icon; return <button key={device} type="button" aria-pressed={selectedDevice === device} onClick={() => setSelectedDevice(previous => previous === device ? '' : device)}><span className="website-device-dot" style={{ background: colour }} /><Icon size={16} aria-hidden="true" /><span>{label}</span><strong>{display(sessions)}</strong><small>{deviceTotal ? (sessions / deviceTotal * 100).toFixed(1) : 0}%</small></button> })}{!devices.length ? <p>{loading ? 'Loading devices…' : 'No device activity available.'}</p> : null}</div>
          </div>
          <p className="website-chart-note">Select a device to inspect its share. Sessions across multiple screen sizes can appear in more than one group.</p>
        </article>
      </div>

      <article className="website-panel website-ranking">
        <div className="website-panel-heading"><div><span className="website-eyebrow">Explore the detail</span><h4>What gets buyers’ attention</h4></div><span className="website-period-label">Last {days} days</span></div>
        <div className="website-ranking-tabs" aria-label="Analytics rankings">{Object.entries(RANKINGS).map(([key, item]) => <button key={key} type="button" aria-pressed={ranking === key} onClick={() => { setRanking(key); setSort({ key: 'value', direction: 'desc' }); setSelectedRow('') }}>{item.label}</button>)}</div>
        <div className="website-table-wrap"><table><thead><tr><th scope="col" aria-sort={sort.key === 'name' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('name', config.name)}</th><th scope="col" aria-sort={sort.key === 'value' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('value', config.valueLabel)}</th>{config.detail ? <th scope="col" aria-sort={sort.key === 'detail' ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('detail', config.detailLabel)}</th> : null}</tr></thead><tbody>
          {!loading && rows.map(row => <tr key={row.id} className={selectedRow === row.id ? 'is-selected' : ''}><th scope="row"><button type="button" aria-pressed={selectedRow === row.id} onClick={() => setSelectedRow(previous => previous === row.id ? '' : row.id)}>{ranking === 'units' ? `Unit ${rowName(row)}` : rowName(row)}</button></th><td><div className="website-table-value"><span className="website-table-bar"><span style={{ width: `${count(row[config.value]) / rowMaximum * 100}%` }} /></span><strong>{number(row[config.value])}</strong></div></td>{config.detail ? <td>{number(row[config.detail])}</td> : null}</tr>)}
          {(loading || !rows.length) ? <tr><td colSpan={config.detail ? 3 : 2} className="website-table-empty">{loading ? 'Loading website activity…' : error || unavailable ? 'Activity is unavailable.' : 'No activity recorded in this period.'}</td></tr> : null}
        </tbody></table></div>
        <div className="website-ranking-footer" aria-live="polite">{selected && !loading ? <span><strong>{ranking === 'units' ? 'Unit ' : ''}{rowName(selected)}</strong> · {number(selected[config.value])} {config.valueLabel.toLowerCase()}{config.detail ? ` · ${number(selected[config.detail])} ${config.detailLabel.toLowerCase()}` : ''}</span> : <span>Select a row for its activity summary. Rankings show up to 20 tracked results.</span>}</div>
      </article>
    </section>
  )
}
