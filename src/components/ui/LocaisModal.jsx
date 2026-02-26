/**
 * LocaisModal.jsx — Modal for managing warehouse locations
 *
 * Extracted from index-legacy.html L5597-5744
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';

export default function LocaisModal({ locaisOrigem, onUpdateLocais, onClose }) {
  const [locais, setLocais] = useState([...(locaisOrigem || ['Loja Principal'])]);
  const [novoLocal, setNovoLocal] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const handleEditLocal = (idx, valor) => {
    const novosLocais = [...locais];
    novosLocais[idx] = valor;
    setLocais(novosLocais);
  };

  const handleAddLocal = () => {
    if (novoLocal.trim()) {
      setLocais([...locais, novoLocal.trim()]);
      setNovoLocal('');
    }
  };

  const handleRemoveLocal = (idx) => {
    if (locais.length > 1) {
      setLocais(locais.filter((_, i) => i !== idx));
    }
  };

  const handleSalvar = async () => {
    // Filtrar locais vazios
    const locaisValidos = locais.filter(l => l.trim());
    if (locaisValidos.length === 0) {
      setMensagem('Adicione pelo menos um depósito');
      return;
    }

    setSalvando(true);
    try {
      await onUpdateLocais(locaisValidos);
      setMensagem('Salvo com sucesso!');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setMensagem('Erro ao salvar: ' + err.message);
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Gerenciar Depósitos</h2>
        <p className="modal-subtitle">Adicione, edite ou remova locais de armazenamento</p>

        {mensagem && (
          <div style={{
            padding: '10px',
            background: mensagem.includes('Salvo') ? 'var(--success-light)' : 'var(--danger-light)',
            borderRadius: 'var(--radius)',
            marginBottom: '16px',
            fontSize: '13px'
          }}>
            {mensagem}
          </div>
        )}

        <div style={{marginBottom: '16px'}}>
          {locais.map((local, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: 'var(--bg-primary)',
              borderRadius: 'var(--radius)',
              marginBottom: '8px'
            }}>
              <Icon name="stock" size={16} />
              <input
                type="text"
                className="form-input"
                value={local}
                onChange={(e) => handleEditLocal(idx, e.target.value)}
                style={{flex: 1}}
                placeholder="Nome do depósito..."
              />
              {locais.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleRemoveLocal(idx)}
                  title="Remover"
                  style={{color: 'var(--danger)', padding: '6px 10px'}}
                ><Icon name="delete" size={14} /></button>
              )}
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          padding: '12px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          border: '2px dashed var(--border)'
        }}>
          <input
            type="text"
            className="form-input"
            placeholder="Nome do novo depósito..."
            value={novoLocal}
            onChange={(e) => setNovoLocal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLocal();
              }
            }}
            style={{flex: 1}}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAddLocal}
            disabled={!novoLocal.trim()}
          >
            Adicionar
          </button>
        </div>

        <div className="btn-group" style={{justifyContent: 'space-between'}}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSalvar}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
