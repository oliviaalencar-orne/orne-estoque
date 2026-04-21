/**
 * businessDays.js — Contagem de dias úteis (seg-sex) entre duas datas.
 *
 * v1 intencionalmente ignora feriados nacionais/estaduais — os thresholds
 * de "Confiança de Rastreio" são conservadores o suficiente para
 * absorver 1-2 feriados por mês sem gerar falsos 🔴. Quando o volume
 * de verificação manual indicar que vale a pena, podemos integrar
 * com uma lib de feriados BR.
 *
 * A função é pura e determinística (injetável em testes via `now`).
 */

/**
 * Conta dias úteis "inteiros" entre `from` e `to` (exclusivo em `to`).
 *
 * Mesmo dia → 0. Se `to < from`, retorna valor negativo. Apenas dias
 * de segunda a sexta-feira são contados (getDay() 1-5).
 *
 * A contagem é feita sobre a data-calendário local (ignora horário)
 * para evitar off-by-one quando `to` é "agora" e `from` é 9h da manhã
 * do mesmo dia.
 *
 * @param {Date|string|number} from
 * @param {Date|string|number} to
 * @returns {number} dias úteis (pode ser negativo)
 */
export function diffBusinessDays(from, to) {
  if (from == null || to == null) return 0;
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;

  const startCal = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const endCal = new Date(b.getFullYear(), b.getMonth(), b.getDate());

  if (startCal.getTime() === endCal.getTime()) return 0;

  const sign = endCal > startCal ? 1 : -1;
  const lo = sign === 1 ? startCal : endCal;
  const hi = sign === 1 ? endCal : startCal;

  let count = 0;
  const cursor = new Date(lo);
  while (cursor < hi) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return sign * count;
}

/**
 * Verifica se uma data é dia útil (seg-sex).
 * @param {Date|string|number} date
 * @returns {boolean}
 */
export function isBusinessDay(date) {
  if (date == null) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day !== 0 && day !== 6;
}
