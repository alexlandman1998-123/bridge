import CommercialPipelineColumn from './CommercialPipelineColumn'

function CommercialPipelineBoard({ stages = [], records = [], loading = false, error = '', getStage, getStageSummary, renderCard }) {
  if (loading) {
    return (
      <section className="flex gap-4 overflow-x-auto pb-3">
        {stages.map((stage) => (
          <div key={stage.value} className="min-h-[460px] w-[310px] shrink-0 rounded-3xl border border-slate-200 bg-white p-4 sm:w-[330px]">
            <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="mt-5 grid gap-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </section>
    )
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
        {error}
      </div>
    )
  }

  return (
    <section className="flex gap-4 overflow-x-auto pb-3">
      {stages.map((stage) => {
        const stageRecords = records.filter((record) => String(getStage?.(record) || '') === stage.value)
        return (
          <CommercialPipelineColumn
            key={stage.value}
            stage={stage}
            records={stageRecords}
            summary={getStageSummary?.(stageRecords, stage) || ''}
            renderCard={renderCard}
          />
        )
      })}
    </section>
  )
}

export default CommercialPipelineBoard
