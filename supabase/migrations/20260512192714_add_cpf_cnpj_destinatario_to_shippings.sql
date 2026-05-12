ALTER TABLE shippings
  ADD COLUMN cpf_cnpj_destinatario TEXT;

COMMENT ON COLUMN shippings.cpf_cnpj_destinatario IS
  'CPF (11 digitos) ou CNPJ (14 digitos) do destinatario, sem formatacao. '
  'Forward-fill desde 12/05/2026 via Frente 8.9. '
  'Origem: XML SEFAZ (<dest><CPF> ou <dest><CNPJ>) propagado via separation -> shipping. '
  'Usado como termo de busca extra (E5) em buscarPorNF quando NFs curtas (< 4 chars) '
  'nao vinculam via estrategias E1-E4. NULL para shippings criados antes do forward-fill '
  'ou via fluxo manual sem dado disponivel. PII - nao logar nem expor em UI.';
