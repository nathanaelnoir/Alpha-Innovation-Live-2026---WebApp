import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdminDashboard } from './AdminDashboard'
import { ParticipantDeviceGate } from './ParticipantDeviceGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? (
      <AdminDashboard />
    ) : (
      <ParticipantDeviceGate>
        <App />
      </ParticipantDeviceGate>
    )}
  </StrictMode>,
)
