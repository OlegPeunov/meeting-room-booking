import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

async function startApp() {
  // Explicitly enabled for both development and the deployed demo.
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { startBrowserMocks } = await import('./mocks/browser')
    await startBrowserMocks()
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void startApp().catch((error: unknown) => {
  console.error('Could not start the demo API', error)
  root.render(<p role="alert">Не удалось запустить демо API. Обновите страницу и попробуйте снова.</p>)
})
