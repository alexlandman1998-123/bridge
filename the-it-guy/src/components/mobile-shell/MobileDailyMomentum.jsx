export default function MobileDailyMomentum({ momentum, onRefresh }) {
  const { model, feedback, available } = momentum
  const circumference = 2 * Math.PI * 24
  return <section className={`mobile-momentum${feedback?.kind === 'clear' ? ' is-clear' : ''}`} aria-label="Today’s progress">
    <div className="mobile-momentum-row">
      <div className="mobile-momentum-ring" role="progressbar" aria-label="Today’s progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={available ? model.percent : undefined} aria-valuetext={available ? `${model.doneTasks} of ${model.totalTasks} tasks done, ${model.contacted} buyers contacted` : 'Progress unavailable'}>
        <svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="24" className="momentum-track" /><circle cx="30" cy="30" r="24" className="momentum-fill" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (available ? model.percent : 0) / 100)} /></svg>
        <span>{available ? `${model.percent}%` : '—'}</span>
      </div>
      <div className="mobile-momentum-copy"><h2>Today’s progress</h2>{available ? <p>{model.doneTasks} of {model.totalTasks} tasks done · {model.contacted} {model.contacted === 1 ? 'buyer' : 'buyers'} contacted</p> : <p>Progress unavailable. <button type="button" onClick={onRefresh}>Retry</button></p>}</div>
    </div>
    {available && model.overdueTasks > 0 && <p className="mobile-momentum-overdue">{model.overdueTasks} overdue {model.overdueTasks === 1 ? 'task' : 'tasks'} · listed below</p>}
    <p className="mobile-momentum-feedback" role="status" aria-live="polite">{feedback?.message || (available && model.total === 0 ? 'A fresh start. Your next action counts.' : '')}</p>
  </section>
}
