// @vitest-environment jsdom
import React, {lazy, Suspense, useEffect} from 'react'
import {afterEach, expect, it, vi} from 'vitest'
import {act, cleanup, render, screen} from '@testing-library/react'
import {MemoryRouter, Route, Routes} from 'react-router-dom'

vi.mock('../../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({role:'agent',profile:{id:'fixture-user'},workspaceType:'agency',
    currentWorkspace:{id:'fixture-agency',type:'agency'},
    currentMembership:{status:'active',role:'agent',workspaceRole:'agent',workspaceType:'agency'}}),
}))

afterEach(cleanup)

function delayedGate(loader) {
  let finish;
  const ready = new Promise(resolve => { finish = resolve })
  return {Gate:lazy(async () => { await ready; return loader() }),finish}
}

function ProtectedScreen({read}) {
  useEffect(() => { read() },[read])
  return <p>Protected screen</p>
}

for (const valid of [false,true]) it(`a deferred token gate ${valid ? 'opens a valid route after loading' : 'rejects an invalid link without mounting the protected screen'}`, async () => {
  const {Gate,finish} = delayedGate(() => import('../TokenRouteGate.jsx'))
  const read = vi.fn()
  render(<MemoryRouter initialEntries={[`/secure/${valid ? 'valid-fixture-token' : 'bad'}`]}>
    <Suspense fallback={<p>Loading route</p>}><Routes>
      <Route path="/secure/:token" element={<Gate><ProtectedScreen read={read}/></Gate>}/>
    </Routes></Suspense>
  </MemoryRouter>)
  expect(screen.getByText('Loading route')).toBeTruthy()
  expect(read).not.toHaveBeenCalled()
  await act(async () => { finish() })
  if (valid) {
    expect(await screen.findByText('Protected screen')).toBeTruthy()
    expect(read).toHaveBeenCalledOnce()
  } else {
    expect(await screen.findByRole('heading',{name:'Invalid access link'})).toBeTruthy()
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByText('Protected screen')).toBeNull()
  }
})

for (const allowed of [false,true]) it(`a deferred permission gate ${allowed ? 'opens authorized content only after loading' : 'preserves denial before the protected screen mounts'}`, async () => {
  const {Gate,finish} = delayedGate(() => import('../../PermissionGate.jsx'))
  const read = vi.fn()
  render(<Suspense fallback={<p>Loading route</p>}>
    <Gate capability="manage_users" isSuperAdmin={allowed}><ProtectedScreen read={read}/></Gate>
  </Suspense>)
  expect(screen.getByText('Loading route')).toBeTruthy()
  expect(read).not.toHaveBeenCalled()
  await act(async () => { finish() })
  if (allowed) {
    expect(await screen.findByText('Protected screen')).toBeTruthy()
    expect(read).toHaveBeenCalledOnce()
  } else {
    expect(await screen.findByRole('heading',{name:'Permission required'})).toBeTruthy()
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByText('Protected screen')).toBeNull()
  }
})
