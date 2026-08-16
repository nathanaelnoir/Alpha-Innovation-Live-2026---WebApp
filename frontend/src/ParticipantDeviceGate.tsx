import type { ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArtworkBrand } from './ArtworkBrand'
import { detectLikelyDesktopDevice } from './deviceDetection'

const PARTICIPANT_URL = 'https://eigenvalue.space/'

interface ParticipantDeviceGateProps {
  children: ReactNode
  isDesktop?: boolean
}

export function ParticipantDeviceGate({
  children,
  isDesktop = detectLikelyDesktopDevice(),
}: ParticipantDeviceGateProps) {
  if (!isDesktop) return children

  return (
    <main className="app-shell">
      <div className="signal-field" aria-hidden="true">
        <span>10010100101101001011001001110100101100100110101100101</span>
        <span>00110101001011010011101001001101010100110100100101110</span>
        <span>10100100110100101101001001011010100110100111001001001</span>
      </div>
      <header className="site-header">
        <ArtworkBrand />
        <div className="header-data" aria-hidden="true">
          <span>SYSTEM/01</span><span>INPUT/MOBILE</span><span>STATUS/WAIT</span>
        </div>
      </header>
      <section className="survey-card survey-card--device-gate" aria-labelledby="device-gate-title">
        <div className="center-state device-gate">
          <p className="eyebrow">MOBILE INPUT REQUIRED</p>
          <h1 id="device-gate-title">Please use a phone or tablet</h1>
          <p>Open eigenvalue.space on your mobile device to participate.</p>
          <div className="device-gate__translations">
            <p lang="de">Bitte öffnen Sie eigenvalue.space auf einem Smartphone oder Tablet.</p>
            <p lang="it">Apra eigenvalue.space su uno smartphone o tablet.</p>
          </div>
          <div className="device-gate__qr">
            <QRCodeSVG
              value={PARTICIPANT_URL}
              size={180}
              level="M"
              marginSize={4}
              title="Scan to open eigenvalue.space on a mobile device"
            />
          </div>
          <code className="device-gate__address">eigenvalue.space</code>
        </div>
      </section>
    </main>
  )
}
