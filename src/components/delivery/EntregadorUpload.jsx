/**
 * EntregadorUpload.jsx — Public page for delivery drivers to upload proof photos
 *
 * Supports both legacy (single-NF) and multi-NF tokens.
 * No authentication required. Mobile-first design.
 */
import React, { useState, useEffect, useRef } from 'react';

async function comprimirImagem(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function tempoAtras(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// ── Styles ──
const pageStyle = {
  minHeight: '100vh', background: '#f8f9fa',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px',
};
const cardStyle = {
  background: 'white', borderRadius: '16px', padding: '24px',
  maxWidth: '440px', width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
};
const logoStyle = { fontSize: '20px', fontWeight: 700, color: '#1a1a1a', textAlign: 'center', marginBottom: '20px', letterSpacing: '-0.5px' };
const btnPrimary = {
  width: '100%', padding: '14px', fontSize: '15px', fontWeight: 600,
  border: 'none', borderRadius: '10px', cursor: 'pointer', background: '#059669', color: 'white',
};
const btnDisabled = { ...btnPrimary, background: '#d1d5db', color: '#9ca3af', cursor: 'default' };

export default function EntregadorUpload({ token }) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  // Fail-loud contido: se a variável não foi injetada (build/dev sem .env.local),
  // não tentamos cair em produção silenciosamente. O resto do app (rota admin)
  // segue funcionando — só esta rota pública mostra UI de erro.
  if (!SUPABASE_URL) {
    console.error(
      '[EntregadorUpload] VITE_SUPABASE_URL não configurada. ' +
      'Crie .env.local na raiz do projeto com credenciais de STAGING. Veja .env.example.'
    );
    return (
      <div style={pageStyle}><div style={cardStyle}><div style={logoStyle}>ORNE</div>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'⚠️'}</div>
          <p style={{ color: '#374151', fontSize: '15px', lineHeight: 1.5 }}>
            Página em manutenção. Entre em contato com o administrador.
          </p>
        </div>
      </div></div>
    );
  }

  const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

  const [estado, setEstado] = useState('carregando');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  // Multi-NF state
  const [activeEntrega, setActiveEntrega] = useState(null); // shipping being uploaded
  const [fotos, setFotos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const fileInputRef = useRef(null);

  const fetchToken = () => {
    if (!token) { setEstado('invalido'); return; }
    fetch(`${FUNCTIONS_URL}/delivery-upload?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.valid) {
          setDados(data);
          setEstado('valido');
        } else {
          if (data.error === 'TOKEN_EXPIRADO') setEstado('expirado');
          else if (data.error === 'LIMITE_UPLOADS' || data.error === 'TOKEN_USADO') setEstado('limite');
          else setEstado('invalido');
        }
      })
      .catch(() => { setErro('Erro de conexão. Verifique sua internet.'); setEstado('invalido'); });
  };

  useEffect(() => { fetchToken(); }, [token]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const maxToAdd = Math.min(files.length, 5 - fotos.length);
    if (maxToAdd <= 0) return;
    const novas = [];
    for (let i = 0; i < maxToAdd; i++) {
      const compressed = await comprimirImagem(files[i]);
      novas.push({ preview: URL.createObjectURL(compressed), compressed });
    }
    setFotos(prev => [...prev, ...novas]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removerFoto = (idx) => {
    setFotos(prev => { const c = [...prev]; URL.revokeObjectURL(c[idx].preview); c.splice(idx, 1); return c; });
  };

  const enviarComprovante = async () => {
    if (!fotos.length || !activeEntrega) return;
    setEnviando(true); setErro('');
    setProgresso({ current: 0, total: fotos.length });
    let ok = 0, errs = 0;
    for (let i = 0; i < fotos.length; i++) {
      setProgresso({ current: i + 1, total: fotos.length });
      try {
        const base64 = await blobToBase64(fotos[i].compressed);
        const payload = { token, foto: base64 };
        // Multi-NF: include shipping_id
        if (dados?.multi) payload.shipping_id = activeEntrega.shipping_id;
        const res = await fetch(`${FUNCTIONS_URL}/delivery-upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (result.success) ok++; else errs++;
      } catch { errs++; }
    }
    fotos.forEach(f => URL.revokeObjectURL(f.preview));
    setFotos([]); setProgresso(null); setEnviando(false);

    if (ok > 0) {
      // Refresh data from server
      setActiveEntrega(null);
      fetchToken();
    } else {
      setErro('Erro ao enviar. Tente novamente.');
    }
  };

  // ── Loading ──
  if (estado === 'carregando') {
    return (<div style={pageStyle}><div style={cardStyle}><div style={logoStyle}>ORNE</div>
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>Carregando...</div>
    </div></div>);
  }

  // ── Error states ──
  if (['invalido', 'expirado', 'limite'].includes(estado)) {
    const msgs = { invalido: 'Link inválido. Solicite um novo ao operador.', expirado: 'Este link expirou. Solicite um novo.', limite: 'Todas as entregas já foram comprovadas.' };
    return (<div style={pageStyle}><div style={cardStyle}><div style={logoStyle}>ORNE</div>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>{estado === 'limite' ? '\u2705' : '\u26A0\uFE0F'}</div>
        <p style={{ color: '#374151', fontSize: '15px', lineHeight: 1.5 }}>{erro || msgs[estado]}</p>
      </div>
    </div></div>);
  }

  if (!dados) return null;

  // ── MULTI-NF: All done ──
  if (dados.multi && dados.pendentes === 0) {
    return (<div style={pageStyle}><div style={cardStyle}><div style={logoStyle}>ORNE</div>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>{'\uD83C\uDF89'}</div>
        <h2 style={{ margin: '0 0 8px', color: '#059669', fontSize: '20px' }}>Todas as entregas comprovadas!</h2>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>{dados.total} de {dados.total} concluídas</p>
        <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '16px' }}>Obrigado, {dados.entregador_nome || 'entregador'}!</p>
      </div>
    </div></div>);
  }

  // ── Sending state ──
  if (enviando) {
    return (<div style={pageStyle}><div style={cardStyle}><div style={logoStyle}>ORNE</div>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: '#374151', fontSize: '15px', marginBottom: '16px' }}>Enviando {progresso?.current || 0} de {progresso?.total || 0}...</p>
        <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: progresso ? `${(progresso.current / progresso.total) * 100}%` : '0%', height: '100%', background: '#059669', transition: 'width 0.3s' }} />
        </div>
        <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '12px' }}>Não feche esta página</p>
      </div>
    </div></div>);
  }

  // ── MULTI-NF: Upload screen for a specific NF ──
  if (dados.multi && activeEntrega) {
    return (
      <div style={pageStyle}><div style={cardStyle}>
        <div style={logoStyle}>ORNE</div>
        <button onClick={() => { fotos.forEach(f => URL.revokeObjectURL(f.preview)); setFotos([]); setActiveEntrega(null); }}
          style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '14px', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {'\u2190'} Voltar
        </button>

        <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
          <div><strong>NF:</strong> {activeEntrega.nf_numero}</div>
          <div><strong>Cliente:</strong> {activeEntrega.cliente}</div>
          {activeEntrega.endereco && <div><strong>Endereço:</strong> {activeEntrega.endereco}</div>}
        </div>

        {erro && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{erro}</div>}

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFileSelect} style={{ display: 'none' }} id="foto-input" />

        {fotos.length < 5 && (
          <label htmlFor="foto-input" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed #d1d5db', borderRadius: '12px', padding: '28px 16px', cursor: 'pointer', marginBottom: '16px',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCF7'}</div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: '14px' }}>Tirar foto ou selecionar</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>Toque para abrir a câmera</div>
          </label>
        )}

        {fotos.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Fotos ({fotos.length}):</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {fotos.map((f, i) => (
                <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                  <img src={f.preview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <button onClick={() => removerFoto(i)} style={{
                    position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px',
                    borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={enviarComprovante} disabled={fotos.length === 0} style={fotos.length > 0 ? btnPrimary : btnDisabled}>
          Enviar Comprovante{fotos.length > 1 ? 's' : ''}
        </button>
      </div></div>
    );
  }

  // ── MULTI-NF: List of deliveries ──
  if (dados.multi) {
    const pendentes = dados.entregas.filter(e => e.status === 'pendente');
    const comprovados = dados.entregas.filter(e => e.status === 'comprovado');

    return (
      <div style={pageStyle}><div style={{ ...cardStyle, padding: '20px' }}>
        <div style={logoStyle}>ORNE</div>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '17px', color: '#1a1a1a' }}>Entregas de {dados.entregador_nome || 'Entregador'}</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            {dados.pendentes} pendente{dados.pendentes !== 1 ? 's' : ''} · {dados.comprovados} enviado{dados.comprovados !== 1 ? 's' : ''}
          </p>
        </div>

        {pendentes.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Pendentes</div>
            {pendentes.map(e => (
              <div key={e.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{'\uD83D\uDCE6'}</span>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a1a' }}>NF {e.nf_numero}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>{e.cliente}</div>
                {e.endereco && <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>{e.endereco}</div>}
                <button onClick={() => { setActiveEntrega(e); setErro(''); }} style={{
                  width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600,
                  background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
                }}>
                  {'\uD83D\uDCF7'} Enviar Comprovante
                </button>
              </div>
            ))}
          </>
        )}

        {comprovados.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: '16px' }}>Comprovados</div>
            {comprovados.map(e => (
              <div key={e.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{'\u2705'}</span>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#065f46' }}>NF {e.nf_numero}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#374151' }}>{e.cliente}</div>
                {e.comprovado_at && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Enviado {tempoAtras(e.comprovado_at)}</div>}
              </div>
            ))}
          </>
        )}
      </div></div>
    );
  }

  // ── LEGACY single-NF ──
  return (
    <div style={pageStyle}><div style={cardStyle}>
      <div style={logoStyle}>ORNE</div>
      <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: '#1a1a1a' }}>Comprovante de Entrega</h2>

      {dados && (
        <div style={{ background: '#f3f4f6', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
          <div><strong>NF:</strong> {dados.nf_numero}</div>
          <div><strong>Cliente:</strong> {dados.cliente}</div>
          {dados.endereco && <div><strong>Endereço:</strong> {dados.endereco}</div>}
        </div>
      )}

      {erro && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{erro}</div>}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFileSelect} style={{ display: 'none' }} id="foto-input-legacy" />

      {fotos.length < (dados?.uploads_restantes || 5) && (
        <label htmlFor="foto-input-legacy" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '2px dashed #d1d5db', borderRadius: '12px', padding: '28px 16px', cursor: 'pointer', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCF7'}</div>
          <div style={{ fontWeight: 600, color: '#374151', fontSize: '14px' }}>Tirar foto ou selecionar</div>
        </label>
      )}

      {fotos.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Fotos ({fotos.length}):</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                <img src={f.preview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <button onClick={() => removerFoto(i)} style={{
                  position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px',
                  borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px', textAlign: 'center' }}>
        Restam {(dados?.uploads_restantes || 5) - fotos.length} envio(s)
      </div>

      <button onClick={enviarComprovante} disabled={fotos.length === 0}
        style={fotos.length > 0 ? btnPrimary : btnDisabled}>
        Enviar Comprovante{fotos.length > 1 ? 's' : ''}
      </button>
    </div></div>
  );
}
