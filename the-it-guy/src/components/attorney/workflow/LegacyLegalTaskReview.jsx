import { getAttorneyStageDefinition } from '../../../constants/attorneyWorkflowStages.js'
import Button from '../../ui/Button.jsx'

// Saved identifiers and outcomes remain intact; older granular tasks must not
// inherit the completion rules of a newer combined review automatically.
export default function LegacyLegalTaskReview({ task, laneKey, documents = [], notes = [], activity = [], onOpenDocumentLibrary }) {
  const definition = getAttorneyStageDefinition(task.key, laneKey)
  return <div className="legal-task-shell min-w-0 bg-white">
    <header className="legal-task-header"><div className="legal-task-eyebrow">Saved task</div><h2 className="mt-2 text-2xl font-semibold text-slate-950">{task.label}</h2><p className="mt-3 text-sm text-slate-600">{task.statusLabel || String(task.status || 'Not started').replaceAll('_', ' ')}</p>{task.completedAt || task.updatedAt ? <p className="mt-2 text-xs text-slate-500">Last recorded: {new Date(task.completedAt || task.updatedAt).toLocaleString('en-ZA')}</p> : null}</header>
    <div className="legal-task-content space-y-5">
      <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{definition ? `This saved task belongs to an older workflow. Its outcome and history are preserved; the current review is “${definition.label}”.` : 'This saved task uses a workflow definition unavailable in this version. Its outcome and history are preserved.'} Review is available here. Editing requires a supported task definition.</p>
      {task.description ? <p className="text-sm text-slate-600">{task.description}</p> : null}
      {task.comment ? <section><h3 className="text-sm font-semibold text-slate-900">Recorded outcome note</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.comment}</p></section> : null}
      <section><h3 className="text-sm font-semibold text-slate-900">Related documents</h3>{documents.length ? <ul className="mt-2 space-y-2">{documents.map((doc, i) => <li key={doc.id || doc.key || i} className="text-sm text-slate-700">{doc.displayName || doc.label || doc.name || 'Document'} · {doc.statusLabel || doc.status || 'Status unavailable'}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No documents are linked to this saved task.</p>}{onOpenDocumentLibrary ? <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onOpenDocumentLibrary}>Open matter documents</Button> : null}</section>
      {notes.length ? <section><h3 className="text-sm font-semibold text-slate-900">Saved notes</h3>{notes.map((entry, i) => <p key={entry.id || i} className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.message || entry.body || entry.text || entry.title}</p>)}</section> : null}
      <details><summary className="cursor-pointer text-sm font-semibold text-slate-900">Saved activity ({activity.length})</summary>{activity.length ? activity.map((entry, i) => <p key={entry.id || i} className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.message || entry.body || entry.text || entry.title || 'Workflow update'}</p>) : <p className="mt-2 text-sm text-slate-500">No activity is available for this saved task.</p>}</details>
    </div>
  </div>
}
