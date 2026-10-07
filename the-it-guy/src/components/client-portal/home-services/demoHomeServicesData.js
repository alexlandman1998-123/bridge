// Local fixtures for the prospect demo. No directory, booking or quoting API is used.
export const HOME_SERVICES_NOTICE = 'Demo providers and illustrative prices. Nothing is booked or sent.'

export const MAINTENANCE_CATEGORIES = [
  { id: 'plumbing', label: 'Plumbers', services: [
    { id: 'tap', name: 'Repair a leaking tap', detail: 'One standard tap, including replacement washers.', labour: 550, materials: 250, duration: 'About 1 hour' },
    { id: 'drain', name: 'Unblock a drain', detail: 'Clear one accessible household drain.', labour: 850, materials: 100, duration: '1–2 hours' },
    { id: 'geyser', name: 'Geyser inspection', detail: 'Inspect the geyser and connections. Repairs quoted separately.', labour: 650, materials: 0, duration: 'About 1 hour' },
  ], providers: [
    { id: 'flow', name: 'Flow & Co.', initials: 'F&', description: 'Everyday fixes. A home that flows.', callout: 350, area: 'City & surrounding suburbs' },
    { id: 'tap', name: 'The Tap Team', initials: 'TT', description: 'A small team for the little leaks and bigger jobs.', callout: 450, area: 'City & surrounding suburbs' },
    { id: 'clear', name: 'Clearwater Plumbing', initials: 'CP', description: 'From blocked drains to a fresh start.', callout: 400, area: 'City & surrounding suburbs' },
  ] },
  { id: 'electrical', label: 'Electrical', services: [
    { id: 'socket', name: 'Replace a plug socket', detail: 'Replace one standard wall socket.', labour: 500, materials: 180, duration: 'About 1 hour' },
    { id: 'light', name: 'Install a light fitting', detail: 'Fit one customer-supplied light to an existing connection.', labour: 650, materials: 100, duration: '1–2 hours' },
    { id: 'fault', name: 'Find an electrical fault', detail: 'Initial fault finding. Further repairs quoted separately.', labour: 850, materials: 0, duration: 'Up to 2 hours' },
  ], providers: [
    { id: 'bright', name: 'Bright Spark', initials: 'BS', description: 'A brighter home starts with the basics.', callout: 400, area: 'City & surrounding suburbs' },
    { id: 'current', name: 'Good Current', initials: 'GC', description: 'Thoughtful electrical care for your home.', callout: 450, area: 'City & surrounding suburbs' },
    { id: 'wired', name: 'Wired Well', initials: 'WW', description: 'Small installations and everyday repairs.', callout: 350, area: 'City & surrounding suburbs' },
  ] },
  { id: 'painting', label: 'Painting', services: [
    { id: 'room', name: 'Refresh one room', detail: 'Two coats on the walls of a sample 12 m² room.', labour: 1800, materials: 900, duration: '1–2 days' },
    { id: 'touchup', name: 'Wall touch-ups', detail: 'Small scuffs and patches across up to three walls.', labour: 750, materials: 300, duration: 'Half a day' },
    { id: 'door', name: 'Repaint a door', detail: 'Prepare and paint one standard interior door.', labour: 650, materials: 250, duration: 'Half a day' },
  ], providers: [
    { id: 'fresh', name: 'Fresh Coat', initials: 'FC', description: 'New keys. A fresh palette.', callout: 250, area: 'City & surrounding suburbs' },
    { id: 'colour', name: 'Colour House', initials: 'CH', description: 'Make the space feel a little more like you.', callout: 350, area: 'City & surrounding suburbs' },
    { id: 'brush', name: 'Brush & Bloom', initials: 'BB', description: 'A considered finish, room by room.', callout: 300, area: 'City & surrounding suburbs' },
  ] },
  { id: 'cleaning', label: 'Cleaning', services: [
    { id: 'deep', name: 'Move-in deep clean', detail: 'A sample two-bedroom home, before your furniture arrives.', labour: 1350, materials: 250, duration: 'Half a day' },
    { id: 'carpet', name: 'Clean two carpets', detail: 'Two standard bedroom carpets, up to 24 m² in total.', labour: 700, materials: 150, duration: '2–3 hours' },
    { id: 'window', name: 'Window clean', detail: 'Up to eight accessible ground-floor windows.', labour: 550, materials: 100, duration: 'About 2 hours' },
  ], providers: [
    { id: 'neat', name: 'Neat Nest', initials: 'NN', description: 'Settle into a home that feels fresh.', callout: 200, area: 'City & surrounding suburbs' },
    { id: 'clean', name: 'Clean Slate', initials: 'CS', description: 'The finishing touch before move-in day.', callout: 300, area: 'City & surrounding suburbs' },
    { id: 'shine', name: 'Little Shine', initials: 'LS', description: 'A little care in every corner.', callout: 250, area: 'City & surrounding suburbs' },
  ] },
  { id: 'garden', label: 'Garden', services: [
    { id: 'tidy', name: 'Garden tidy-up', detail: 'Mow, edge and tidy a sample garden up to 100 m².', labour: 650, materials: 150, duration: '2–3 hours' },
    { id: 'hedge', name: 'Trim a hedge', detail: 'Trim and remove cuttings from up to 10 metres of hedge.', labour: 550, materials: 100, duration: 'About 2 hours' },
    { id: 'plant', name: 'Refresh a flower bed', detail: 'Prepare and plant one small bed with sample seasonal plants.', labour: 800, materials: 450, duration: 'Half a day' },
  ], providers: [
    { id: 'green', name: 'Green Hands', initials: 'GH', description: 'Room to grow, right outside your door.', callout: 200, area: 'City & surrounding suburbs' },
    { id: 'roots', name: 'Good Roots', initials: 'GR', description: 'A little love for your outdoor space.', callout: 300, area: 'City & surrounding suburbs' },
    { id: 'leaf', name: 'Leaf & Lawn', initials: 'LL', description: 'From the first mow to the last leaf.', callout: 250, area: 'City & surrounding suburbs' },
  ] },
]

export const MOVE_TRUCKS = [
  { id: 'small', label: 'Small truck', volume: '8 m³', home: 'Studio / 1 bedroom', description: 'A few big pieces and your everyday essentials.', crew: '2 movers' },
  { id: 'medium', label: 'Medium truck', volume: '16 m³', home: '2-bedroom home', description: 'Room for furniture, boxes and a little extra.', crew: '3 movers' },
  { id: 'large', label: 'Large truck', volume: '24 m³', home: '3-bedroom home', description: 'For a fuller home and the things you love.', crew: '4 movers' },
]

export const MOVE_QUOTES = [
  { id: 'easy', name: 'Easy Street Movers', initials: 'ES', tagline: 'Keep moving day simple.', prices: { small: 2400, medium: 3900, large: 5600 }, features: ['Loading & unloading', 'Furniture blankets', 'One collection & delivery'], detail: 'Furniture disassembly and packing are optional extras, quoted separately.' },
  { id: 'nest', name: 'Nest to Nest', initials: 'NN', tagline: 'A little more help along the way.', prices: { small: 2850, medium: 4450, large: 6300 }, features: ['Loading & unloading', 'Furniture blankets', 'Basic furniture disassembly'], detail: 'Basic disassembly covers a sample bed frame and dining table. Packing materials are extra.' },
  { id: 'hello', name: 'Hello Home Moves', initials: 'HH', tagline: 'Make yourself at home, sooner.', prices: { small: 3300, medium: 5100, large: 7100 }, features: ['Loading & unloading', 'Furniture blankets', 'Disassembly & reassembly'], detail: 'Sample quote includes basic furniture reassembly. Specialist items and packing are extra.' },
]

export const MOVE_QUOTE_ASSUMPTION = 'Sample local move within 30 km, with ground-floor access and one trip. Final pricing depends on distance, inventory, date and access.'
