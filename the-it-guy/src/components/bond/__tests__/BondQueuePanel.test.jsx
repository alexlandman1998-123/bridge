/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

;(async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const queueModule = await server.ssrLoadModule('/src/components/bond/BondQueuePanel.jsx')
    const QueuePanel = queueModule.default

    const canonicalItemMarkup = render(QueuePanel, {
      queueKey: 'processing_queue',
      items: [
        {
          transactionId: 'tx-canonical',
          applicationReference: 'APP-CAN-001',
          clientName: 'Canonical Client',
          propertyName: 'Sandton',
          stage: 'Finance',
          financeStatus: 'prepared',
          primaryConsultantUserId: '11111111-1111-4111-8111-111111111111',
          processorUserId: '22222222-2222-4222-8222-222222222222',
          nextAction: 'Submit to bank',
          blockerReason: '',
          overdue: false,
          lastUpdatedAt: '2026-05-20T10:00:00.000Z',
        },
      ],
    })
    assert.match(canonicalItemMarkup, /APP-CAN-001/)
    assert.match(canonicalItemMarkup, /Canonical Client/)

    const legacyFallbackMarkup = render(QueuePanel, {
      queueKey: 'my_applications',
      items: [
        {
          transactionId: 'tx-legacy',
          applicationReference: 'APP-LEG-001',
          clientName: 'Legacy Client',
          propertyName: 'Legacy Property',
          stage: 'Finance',
          financeStatus: 'application_in_progress',
          primaryConsultantUserId: null,
          processorUserId: null,
          nextAction: 'Call client',
          blockerReason: 'Awaiting docs',
          overdue: true,
          lastUpdatedAt: '2026-05-20T10:00:00.000Z',
        },
      ],
    })
    assert.match(legacyFallbackMarkup, /APP-LEG-001/)
    assert.match(legacyFallbackMarkup, /Overdue/)
    assert.match(legacyFallbackMarkup, /Awaiting docs/)

    const emptyMarkup = render(QueuePanel, {
      queueKey: 'bank_feedback',
      items: [],
      loading: false,
      error: '',
    })
    assert.match(emptyMarkup, /No applications in this queue yet/)

    console.log('BondQueuePanel component tests passed')
  } finally {
    await server.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
