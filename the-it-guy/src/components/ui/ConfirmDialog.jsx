import Button from './Button'
import Modal from './Modal'

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  confirmDisabled = false,
  confirming = false,
  variant = 'default',
}) {
  const destructive = variant === 'destructive'

  return (
    <Modal
      open={open}
      onClose={confirming ? undefined : onCancel}
      title={title}
      className="max-w-[560px]"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || confirming}
            className={
              destructive
                ? 'bg-danger text-textInverse shadow-[0_10px_24px_rgba(180,35,24,0.22)] hover:brightness-95 hover:shadow-[0_12px_28px_rgba(152,27,19,0.26)]'
                : ''
            }
          >
            {confirming ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-textBody">{description}</p>
    </Modal>
  )
}

export default ConfirmDialog
