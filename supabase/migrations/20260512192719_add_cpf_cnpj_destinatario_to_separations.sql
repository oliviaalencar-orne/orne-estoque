ALTER TABLE separations
  ADD COLUMN cpf_cnpj_destinatario TEXT;

COMMENT ON COLUMN separations.cpf_cnpj_destinatario IS
  'CPF (11 digitos) ou CNPJ (14 digitos) do destinatario, sem formatacao. '
  'Forward-fill desde 12/05/2026 via Frente 8.9. '
  'Origem: XML SEFAZ (<dest><CPF> ou <dest><CNPJ>) capturado no import XML. '
  'Propagado para shipping.cpf_cnpj_destinatario quando separation -> shipping '
  '(SeparationManager.jsx callsites onAddShipping). NULL para separations '
  'criadas antes do forward-fill ou sem dado disponivel. PII - nao logar nem expor em UI.';
