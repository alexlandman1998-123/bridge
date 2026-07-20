import {
  CheckCircle2,
  CircleDot,
  CopyPlus,
  Eye,
  FileText,
  MoreHorizontal,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  studioPrimaryButtonClass,
  studioSecondaryButtonClass,
} from '../../pages/settings/contractStudioConstants'

export function TemplateEditorActionBar({
  activeTab,
  canEdit,
  cloning,
  focused,
  hasUnsavedChanges,
  isDefault,
  onArchive,
  onDuplicate,
  onEdit,
  onPreview,
  onPublish,
  onSave,
  saving,
  selectedIsOrgOwned,
  selectedTemplate,
}) {
  const duplicateDisabled = !selectedTemplate || !canEdit || saving || cloning || hasUnsavedChanges
  const archiveDisabled = !selectedTemplate || !selectedIsOrgOwned || !canEdit || saving || cloning || Boolean(isDefault)
  const duplicateTitle = hasUnsavedChanges
    ? 'Save changes before duplicating this template.'
    : 'Create another independent company template variant.'
  const archiveTitle = isDefault
    ? 'Publish another default before archiving this template.'
    : 'Archive this template without removing existing documents.'

  return (
    <div className="flex min-w-0 flex-col gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Template view">
        {!focused ? (
          <button
            type="button"
            aria-pressed={activeTab !== 'preview'}
            onClick={onEdit}
            className={[
              'inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold transition',
              activeTab !== 'preview'
                ? 'border-[#96d7ad] bg-[#eef9f1] text-[#128642]'
                : 'border-[#dbe7f3] bg-white text-[#42566d] hover:border-[#b9dfc8] hover:bg-[#f8fbff]',
            ].join(' ')}
          >
            <FileText size={15} />
            <span>Edit Template</span>
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={activeTab === 'preview'}
          onClick={onPreview}
          disabled={!selectedTemplate}
          className={[
            'inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
            activeTab === 'preview'
              ? 'border-[#96d7ad] bg-[#eef9f1] text-[#128642]'
              : 'border-[#dbe7f3] bg-white text-[#42566d] hover:border-[#b9dfc8] hover:bg-[#f8fbff]',
          ].join(' ')}
        >
          <Eye size={15} />
          <span>Preview</span>
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        {focused ? (
          <span
            className={`inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-semibold ${isDefault ? 'border-[#b9e1c8] bg-[#eef9f2] text-[#167449]' : 'border-[#ead9b5] bg-[#fff8e9] text-[#8a650f]'}`}
            aria-label={`Template status: ${isDefault ? 'Live' : 'Draft'}`}
          >
            {isDefault ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
            <span>{isDefault ? 'Live' : 'Draft'}</span>
          </span>
        ) : (
          <>
            <span className="min-h-10 rounded-[12px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm font-semibold text-[#607387]">
              {selectedIsOrgOwned ? 'Editing your agency version' : cloning ? 'Preparing agency version...' : 'Agency version opens automatically'}
            </span>
            <button type="button" className={studioSecondaryButtonClass} onClick={onDuplicate} disabled={duplicateDisabled} title={duplicateTitle}>
              <CopyPlus size={14} />
              <span>{cloning ? 'Copying...' : 'Duplicate'}</span>
            </button>
            <button type="button" className={studioSecondaryButtonClass} onClick={onArchive} disabled={archiveDisabled} title={archiveTitle}>
              <Trash2 size={14} />
              <span>Archive</span>
            </button>
          </>
        )}
        <button
          type="button"
          className={focused ? studioPrimaryButtonClass : studioSecondaryButtonClass}
          onClick={onSave}
          disabled={!selectedTemplate || !canEdit || saving || cloning}
        >
          <Save size={14} />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
        {!focused || !isDefault ? (
          <button
            type="button"
            className={focused ? studioSecondaryButtonClass : studioPrimaryButtonClass}
            onClick={onPublish}
            disabled={!selectedTemplate || !canEdit || saving || cloning || Boolean(isDefault)}
          >
            <ShieldCheck size={14} />
            <span>{isDefault ? 'Live' : 'Publish'}</span>
          </button>
        ) : null}
        {focused ? (
          <details className="relative">
            <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer px-3`} aria-label="More template actions" title="More template actions">
              <MoreHorizontal size={16} />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-[14px] border border-[#dbe7f3] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm font-semibold text-[#42566d] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onDuplicate}
                disabled={duplicateDisabled}
                title={duplicateTitle}
              >
                <CopyPlus size={14} />
                <span>{cloning ? 'Copying...' : 'Duplicate'}</span>
              </button>
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm font-semibold text-[#9c5a50] transition hover:bg-[#fff6f4] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onArchive}
                disabled={archiveDisabled}
                title={archiveTitle}
              >
                <Trash2 size={14} />
                <span>Archive</span>
              </button>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}
