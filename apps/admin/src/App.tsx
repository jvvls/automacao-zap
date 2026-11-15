import { useEffect, useState } from 'react'
import { supabaseConfig } from './lib/supabase'

type ConnectionStatus = 'checking' | 'ok' | 'error'

// Tela provisória da Fase 0: só confirma que o painel alcança o Supabase.
// O login e as telas reais entram na Fase 2.
function App() {
  const [status, setStatus] = useState<ConnectionStatus>('checking')

  useEffect(() => {
    fetch(`${supabaseConfig.url}/auth/v1/health`, {
      headers: { apikey: supabaseConfig.anonKey },
    })
      .then((response) => setStatus(response.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <main>
      <h1>Scrapbook Store — Painel</h1>
      <p data-testid="supabase-status">
        Supabase: {status === 'checking' ? 'verificando…' : status === 'ok' ? 'conectado' : 'falha na conexão'}
      </p>
    </main>
  )
}

export default App
