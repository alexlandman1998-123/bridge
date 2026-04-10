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
                ? 'bg-danger text-textInverse shadow-floating hover:brightness-95'
                : ''
            }
          >
            {confirming ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-secondary text-textBody">{description}</p>
    </Modal>
  )
}

export default ConfirmDialog
