// Bundled copy starters work without shared-template database storage.
export const EMAIL_TEMPLATE_STARTERS = [
  {
    id: 'property-showcase', name: 'Property showcase', theme: 'forest',
    description: 'Introduce a home worth a closer look.', title: 'Your next chapter in [area]',
    body: 'Hi [first name],\n\nLooking for a home in [area]? Take a look at [property name]: [key feature], [key feature] and a location that puts [local highlight] within reach.\n\nReply to arrange a viewing or tell me what you are looking for.\n\n[agent name]',
    cta_label: 'Explore the property',
  },
  {
    id: 'seller-valuation', name: 'Seller valuation', theme: 'sand',
    description: 'Turn local curiosity into a conversation.', title: 'What could your [area] home be worth?',
    body: 'Hi [first name],\n\nThinking about your next move? I can help you understand where your home fits in today’s [area] market, with a personalised valuation and a clear view of recent local sales.\n\nReply with a convenient time for a conversation.\n\n[agent name]',
    cta_label: 'Request a valuation',
  },
  {
    id: 'local-newsletter', name: 'Local newsletter', theme: 'blue',
    description: 'Share useful news from your neighbourhood.', title: 'Your [area] property update',
    body: 'Hi [first name],\n\nHere is your latest update from [area].\n\nMarket snapshot\n[Add a verified local market insight.]\n\nAround the neighbourhood\n[Share a local story or upcoming event.]\n\nHomes to explore\n[Add your featured properties.]\n\nHave a property question? Reply and let’s chat.\n\n[agent name]',
    cta_label: 'See local listings',
  },
  {
    id: 'viewing-follow-up', name: 'Viewing follow-up', theme: 'rose',
    description: 'Keep the conversation going after a viewing.', title: 'What did you think of [property name]?',
    body: 'Hi [first name],\n\nThank you for viewing [property name]. I would love to hear what you thought. Did the home feel right, or is there something you would change?\n\nReply with your feedback and I can answer your questions, arrange another visit or suggest other homes that fit your brief.\n\n[agent name]',
    cta_label: 'Share your thoughts',
  },
].map((template) => ({ ...template, channel: 'email', visibility: 'personal' }))
