export const madisonDeadline = value => new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Johannesburg',
}).format(new Date(value)) + ' SAST'
