import { AlertTriangle, BarChart3, CheckCircle2, Download, Info } from 'lucide-react'
import { downloadProperty24AnalyticsCsv } from '../../services/property24AnalyticsExport'

const icons = { warning: AlertTriangle, positive: CheckCircle2, neutral: Info }

export default function Property24PerformanceInsights({ insights = [], performance = {}, period = {} }) {
  if (!insights.length) return null
  return <section className="mo-card mo-property24-insights" aria-labelledby="property24-insights-title">
    <header><div><h2 id="property24-insights-title">Property24 insights</h2><p>Signals from portal views and contact forms in the selected period.</p></div><div className="mo-insights-actions"><button type="button" className="mo-export" onClick={() => downloadProperty24AnalyticsCsv({ performance, period })} disabled={!performance?.connected}><Download size={14} /> Export CSV</button><BarChart3 size={19} aria-hidden="true" /></div></header>
    <div className="mo-insights-list">{insights.map((insight) => {
      const Icon = icons[insight.tone] || Info
      return <article className={`mo-insight is-${insight.tone || 'neutral'}`} key={insight.key}><Icon size={18} /><div><strong>{insight.title}</strong><p>{insight.detail}</p></div></article>
    })}</div>
  </section>
}
