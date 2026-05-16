import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import './index.css'
import App from './App.tsx'

// Initialize Tone.js with 'playback' latencyHint before any components render.
// This increases the underlying Web Audio buffer size, drastically reducing
// audible dropouts and glitches during playback at the cost of slightly higher input latency.
Tone.setContext(new Tone.Context({ latencyHint: 'playback' }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
