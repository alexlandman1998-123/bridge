function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function ClientAppointmentInstructions({ instructions = '', linkedStage = '' }) {
  const message = toText(instructions, 'Your transaction team will guide you through this appointment step.')
  const stage = toText(linkedStage)

  return (
    <div className="space-y-2 rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
      <h5 className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Instructions</h5>
      <p className="text-sm leading-6 text-[#35546c]">{message}</p>
      {stage ? (
        <p className="text-xs leading-5 text-[#6b7d93]">
          This appointment is part of your <span className="font-semibold text-[#2f5478]">{stage.replaceAll('_', ' ')}</span> stage.
        </p>
      ) : null}
    </div>
  )
}

export default ClientAppointmentInstructions
