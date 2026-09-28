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
      'src/services/__tests__/attorneyAppointmentInviteService.test.js',
      'src/services/__tests__/attorneyCalendarRolloutService.test.js',
      'supabase-tests/appointmentCalendarInvite.test.js',
    ],
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
  },
})
