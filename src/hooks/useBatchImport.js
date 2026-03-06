/**
 * useBatchImport.js — Hook for batch NF import via Tiny ERP
 *
 * Manages state machine: idle → confirming → fetching → summary → editing → completed
 * Handles sequential fetching with delay and cancel support.
 *
 * Constants:
 *   BATCH_MAX_NFS        = 15   (max NFs per batch)
 *   BATCH_FETCH_DELAY_MS = 1500 (delay between sequential fetches)
 *   BATCH_FETCH_TIMEOUT_MS = 30000 (timeout per individual fetch)
 */
import { useState, useCallback, useRef } from 'react';

export const BATCH_MAX_NFS = 15;
export const BATCH_FETCH_DELAY_MS = 1500;
export const BATCH_FETCH_TIMEOUT_MS = 30000;

/**
 * Hook for managing batch NF import flow.
 *
 * Phases:
 *   idle       – textarea input
 *   confirming – parsed list preview
 *   fetching   – sequential API calls with progress
 *   summary    – results (success/error per NF)
 *   editing    – sequential editing queue (one NF at a time)
 *   completed  – all NFs processed
 */
export function useBatchImport() {
  const [batchPhase, setBatchPhase] = useState('idle');
  const [rawInput, setRawInput] = useState('');
  const [parsedNfs, setParsedNfs] = useState([]);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0, currentNf: '' });
  const [fetchResults, setFetchResults] = useState([]); // [{ nf, success, data, error }]
  const [editQueue, setEditQueue] = useState([]);        // successful results only
  const [editIndex, setEditIndex] = useState(0);
  const cancelRef = useRef(false);

  /**
   * Parse raw input into unique NF numbers.
   * Splits by comma, semicolon, whitespace, or newline. Deduplicates preserving order.
   */
  const parseNfNumbers = useCallback((input) => {
    const raw = input.split(/[,;\s\n]+/).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const unique = [];
    for (const nf of raw) {
      if (!seen.has(nf)) {
        seen.add(nf);
        unique.push(nf);
      }
    }
    return unique;
  }, []);

  /**
   * Parse rawInput and move to confirming phase.
   * Returns { nfs } on success or { error } on validation failure.
   */
  const prepareBatch = useCallback(() => {
    const nfs = parseNfNumbers(rawInput);
    if (nfs.length === 0) return { error: 'Nenhum numero de NF informado.' };
    if (nfs.length > BATCH_MAX_NFS) {
      return { error: `Maximo de ${BATCH_MAX_NFS} NFs por lote. Voce informou ${nfs.length}.` };
    }
    setParsedNfs(nfs);
    setBatchPhase('confirming');
    return { nfs };
  }, [rawInput, parseNfNumbers]);

  /**
   * Start sequential fetching. Calls fetchFn(nfNumber) for each NF
   * with BATCH_FETCH_DELAY_MS between calls. Supports cancellation.
   *
   * @param {Function} fetchFn - async (nfNumber) => nfeData
   * @returns {Array} results
   */
  const startBatchFetch = useCallback(async (fetchFn) => {
    cancelRef.current = false;
    setBatchPhase('fetching');
    setFetchProgress({ current: 0, total: parsedNfs.length, currentNf: '' });
    setFetchResults([]);

    const results = [];

    for (let i = 0; i < parsedNfs.length; i++) {
      if (cancelRef.current) break;

      const nf = parsedNfs[i];
      setFetchProgress({ current: i + 1, total: parsedNfs.length, currentNf: nf });

      try {
        const data = await fetchFn(nf);
        results.push({ nf, success: true, data, error: null });
      } catch (err) {
        results.push({ nf, success: false, data: null, error: err.message || 'Erro desconhecido' });
      }

      // Delay between requests (skip after last or if cancelled)
      if (i < parsedNfs.length - 1 && !cancelRef.current) {
        await new Promise(resolve => setTimeout(resolve, BATCH_FETCH_DELAY_MS));
      }
    }

    setFetchResults(cancelRef.current ? [...results] : results);
    setBatchPhase('summary');
    return results;
  }, [parsedNfs]);

  /** Cancel ongoing batch fetch. Partial results will still be shown in summary. */
  const cancelFetch = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /**
   * Move from summary to editing phase.
   * Builds edit queue from successful fetch results.
   * @returns {boolean} true if there are items to edit
   */
  const startEditing = useCallback(() => {
    const successResults = fetchResults.filter(r => r.success);
    if (successResults.length === 0) return false;
    setEditQueue(successResults);
    setEditIndex(0);
    setBatchPhase('editing');
    return true;
  }, [fetchResults]);

  /** Current item being edited (or null). */
  const currentEditItem = editQueue[editIndex] || null;

  /** Advance to next item in editing queue (or complete). */
  const advanceQueue = useCallback(() => {
    if (editIndex + 1 >= editQueue.length) {
      setBatchPhase('completed');
    } else {
      setEditIndex(prev => prev + 1);
    }
  }, [editIndex, editQueue.length]);

  /** Skip current item and advance to next. */
  const skipCurrent = useCallback(() => {
    advanceQueue();
  }, [advanceQueue]);

  /** Cancel entire batch and reset to idle. */
  const cancelBatch = useCallback(() => {
    setBatchPhase('idle');
    setRawInput('');
    setParsedNfs([]);
    setFetchResults([]);
    setEditQueue([]);
    setEditIndex(0);
    cancelRef.current = false;
  }, []);

  /** Full reset to idle state. */
  const resetBatch = useCallback(() => {
    setBatchPhase('idle');
    setRawInput('');
    setParsedNfs([]);
    setFetchResults([]);
    setEditQueue([]);
    setEditIndex(0);
    cancelRef.current = false;
  }, []);

  return {
    // State
    batchPhase,
    rawInput,
    setRawInput,
    parsedNfs,
    fetchProgress,
    fetchResults,
    editQueue,
    editIndex,
    currentEditItem,
    // Actions
    prepareBatch,
    startBatchFetch,
    cancelFetch,
    startEditing,
    advanceQueue,
    skipCurrent,
    cancelBatch,
    resetBatch,
  };
}
