import { createRoot } from 'react-dom/client'
import './base.css'
import { ControlScreen } from './control/ControlScreen'
import { DisplayScreen } from './display/DisplayScreen'

const route = window.location.hash.replace(/^#\/?/, '')

createRoot(document.getElementById('root')!).render(route === 'display' ? <DisplayScreen /> : <ControlScreen />)
