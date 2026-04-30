import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const missingVars = [];
  if (!SUPABASE_URL) missingVars.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missingVars.push('VITE_SUPABASE_ANON_KEY');

  throw new Error(
    `[Orne Estoque] Configuração Supabase ausente: ${missingVars.join(', ')}.\n\n` +
    `Para rodar em desenvolvimento, crie um arquivo .env.local na raiz do projeto com:\n` +
    `  VITE_SUPABASE_URL=https://<seu-projeto-staging>.supabase.co\n` +
    `  VITE_SUPABASE_ANON_KEY=<sua-chave-anon-staging>\n\n` +
    `Veja .env.example como referência. Use credenciais de STAGING para desenvolvimento local — nunca produção.`
  );
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
