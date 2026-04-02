/**
 * EntregadorUpload.jsx — Public page for delivery drivers to upload proof photos
 *
 * No authentication required. Uses delivery token for validation.
 * Mobile-first design — used on driver's phone.
 */
import React, { useState, useEffect, useRef } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ppslljqxsdsdmwfiayok.supabase.co';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Compress image using canvas before uploading.
 */
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

/**
 * Convert a Blob/File to base64 data URI.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function EntregadorUpload({ token }) {
  const [estado, setEstado] = useState('carregando'); // carregando, valido, invalido, expirado, limite, enviando, sucesso
  const [dados, setDados] = useState(null);
  const [fotos, setFotos] = useState([]); // { file, preview, compressed }
  const [uploadsRestantes, setUploadsRestantes] = useState(0);
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState(null); // { current, total }
  const fileInputRef = useRef(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setEstado('invalido');
      return;
    }

    fetch(`${FUNCTIONS_URL}/delivery-upload?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.valid) {
          setDados(data);
          setUploadsRestantes(data.uploads_restantes);
          setEstado('valido');
        } else {
          if (data.error === 'TOKEN_EXPIRADO') setEstado('expirado');
          else if (data.error === 'LIMITE_UPLOADS') setEstado('limite');
          else setEstado('invalido');
        }
      })
      .catch(() => {
        setErro('Erro de conexão. Verifique sua internet e tente novamente.');
        setEstado('invalido');
      });
  }, [token]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const maxToAdd = Math.min(files.length, uploadsRestantes - fotos.length);
    if (maxToAdd <= 0) return;

    const novasFotos = [];
    for (let i = 0; i < maxToAdd; i++) {
      const file = files[i];
      const compressed = await comprimirImagem(file);
      const preview = URL.createObjectURL(compressed);
      novasFotos.push({ file, preview, compressed });
    }
    setFotos(prev => [...prev, ...novasFotos]);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removerFoto = (idx) => {
    setFotos(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx, 1);
      return copy;
    });
  };

  const enviarComprovantes = async () => {
    if (fotos.length === 0) return;
    setEstado('enviando');
    setErro('');
    setProgresso({ current: 0, total: fotos.length });

    let enviados = 0;
    let errosCount = 0;

    for (let i = 0; i < fotos.length; i++) {
      setProgresso({ current: i + 1, total: fotos.length });
      try {
        const base64 = await blobToBase64(fotos[i].compressed);
        const res = await fetch(`${FUNCTIONS_URL}/delivery-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, foto: base64 }),
        });
        const result = await res.json();
        if (result.success) {
          enviados++;
          setUploadsRestantes(result.uploads_restantes);
        } else {
          errosCount++;
        }
      } catch {
        errosCount++;
      }
    }

    // Cleanup previews
    fotos.forEach(f => URL.revokeObjectURL(f.preview));
    setFotos([]);
    setProgresso(null);

    if (enviados > 0 && errosCount === 0) {
      setEstado('sucesso');
    } else if (enviados > 0) {
      setErro(`${enviados} foto(s) enviada(s), ${errosCount} com erro.`);
      setEstado('valido');
    } else {
      setErro('Erro ao enviar fotos. Tente novamente.');
      setEstado('valido');
    }
  };

  // ── Styles ──
  const pageStyle = {
    minHeight: '100vh',
    background: '#f8f9fa',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 16px',
  };

  const cardStyle = {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  };

  const logoStyle = {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: '20px',
    letterSpacing: '-0.5px',
  };

  const btnStyle = {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };

  // ── Loading ──
  if (estado === 'carregando') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>ORNE</div>
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
            Carregando...
          </div>
        </div>
      </div>
    );
  }

  // ── Error states ──
  if (estado === 'invalido' || estado === 'expirado' || estado === 'limite') {
    const messages = {
      invalido: 'Link inválido. Verifique o link ou solicite um novo ao operador.',
      expirado: 'Este link expirou. Solicite um novo link ao operador.',
      limite: 'Limite de fotos atingido para esta entrega.',
    };
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>ORNE</div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>
              {estado === 'limite' ? '\u2705' : '\u26A0\uFE0F'}
            </div>
            <p style={{ color: '#374151', fontSize: '15px', lineHeight: 1.5 }}>
              {erro || messages[estado]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (estado === 'sucesso') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>ORNE</div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {'\u2705'}
            </div>
            <h2 style={{ margin: '0 0 8px', color: '#059669', fontSize: '20px' }}>
              Comprovante enviado!
            </h2>
            {dados && (
              <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '12px' }}>
                <p style={{ margin: '4px 0' }}>NF: {dados.nf_numero}</p>
                <p style={{ margin: '4px 0' }}>Cliente: {dados.cliente}</p>
              </div>
            )}
            <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '20px' }}>
              Obrigado!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Sending ──
  if (estado === 'enviando') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>ORNE</div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: '#374151', fontSize: '15px', marginBottom: '16px' }}>
              Enviando {progresso?.current || 0} de {progresso?.total || 0}...
            </p>
            <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: progresso ? `${(progresso.current / progresso.total) * 100}%` : '0%',
                height: '100%',
                background: '#059669',
                transition: 'width 0.3s',
              }} />
            </div>
            <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '12px' }}>
              Não feche esta página
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Valid — upload form ──
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>ORNE</div>

        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: '#1a1a1a' }}>
          Comprovante de Entrega
        </h2>

        {/* Delivery info */}
        {dados && (
          <div style={{
            background: '#f3f4f6',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '20px',
            fontSize: '14px',
            color: '#374151',
            lineHeight: 1.6,
          }}>
            <div><strong>NF:</strong> {dados.nf_numero}</div>
            <div><strong>Cliente:</strong> {dados.cliente}</div>
            {dados.endereco && <div><strong>Endereço:</strong> {dados.endereco}</div>}
          </div>
        )}

        {erro && (
          <div style={{
            background: '#fef2f2',
            color: '#dc2626',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {erro}
          </div>
        )}

        {/* Photo input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="foto-input"
        />

        {fotos.length < uploadsRestantes && (
          <label htmlFor="foto-input" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            padding: '28px 16px',
            cursor: 'pointer',
            marginBottom: '16px',
            transition: 'border-color 0.2s',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>
              {'\uD83D\uDCF7'}
            </div>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: '14px' }}>
              Tirar foto ou selecionar
            </div>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
              Toque para abrir a câmera
            </div>
          </label>
        )}

        {/* Photo previews */}
        {fotos.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
              Fotos selecionadas ({fotos.length}):
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {fotos.map((f, idx) => (
                <div key={idx} style={{ position: 'relative', width: '80px', height: '80px' }}>
                  <img
                    src={f.preview}
                    alt={`Foto ${idx + 1}`}
                    style={{
                      width: '80px',
                      height: '80px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                    }}
                  />
                  <button
                    onClick={() => removerFoto(idx)}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remaining uploads info */}
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px', textAlign: 'center' }}>
          Restam {uploadsRestantes - fotos.length} envio(s)
        </div>

        {/* Submit button */}
        <button
          onClick={enviarComprovantes}
          disabled={fotos.length === 0}
          style={{
            ...btnStyle,
            background: fotos.length > 0 ? '#059669' : '#d1d5db',
            color: fotos.length > 0 ? 'white' : '#9ca3af',
          }}
        >
          Enviar Comprovante{fotos.length > 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
