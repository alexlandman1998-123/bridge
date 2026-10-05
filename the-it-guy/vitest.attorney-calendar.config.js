import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const supabaseJsEntry = fileURLToPath(import.meta.resolve('@supabase/supabase-js'))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { supabase: supabaseJsEntry },
  },
  test: {
    include: [
      'src/components/attorney/scheduling/__tests__/CreateInviteDrawer.test.jsx',
      'src/pages/__tests__/AttorneySchedulingPage.test.jsx',
      'src/services/__tests__/attorneyAppointmentInviteService.test.js',
      'src/services/__tests__/attorneyAppointmentManagement.test.js',
      'src/services/__tests__/appointmentReminderReschedule.test.js',
      'src/components/attorney/scheduling/__tests__/AppointmentManagement.test.jsx',
      'supabase-tests/attorneyAppointmentManagement.test.js',
      'src/services/__tests__/attorneyCalendarRolloutService.test.js',
      'supabase-tests/appointmentCalendarInvite.test.js',
      'supabase-tests/attorneyAppointmentDelivery.test.js',
      'src/core/appointments/__tests__/attorneyCalendarModel.test.js',
      'src/components/attorney/scheduling/__tests__/CalendarCorrectness.test.jsx',
    ],
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
  },
})
