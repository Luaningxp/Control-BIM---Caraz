export const CDE_COLORS = { WIP: 'background:#f1f5f9;color:#334155;', Shared: 'background:#fef3c7;color:#92400e;', Published: 'background:#ccfbf1;color:#115e59;', Archived: 'background:#e2e8f0;color:#64748b;' };
export const APTITUD_DEFAULT = { WIP: 'S0', Shared: 'S1', Published: 'A1', Archived: null };
export const ESTADOS_CDE = ['WIP', 'Shared', 'Published', 'Archived'];
export const WEIGHT = { 'Muy alto': 3, 'Alto': 2, 'Medio': 1, 'Bajo': 0.5 };
export const DAY = 86400000;

export const cdeBadge = (e, a) => `<span class="badge-cde" style="${CDE_COLORS[e] || ''}">${e || 'WIP'} · ${a || '—'}</span>`;
export const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
export const fmtDate = (iso) => !iso ? '–' : `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(2,4)}`;
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const toast = (m) => { const el = document.getElementById('toast'); el.textContent = m; el.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 2600); };
export const isCerrado = (t) => t.estado === 'Cerrado';
export const daysToDeadline = (t) => !t.fecha_fin ? null : Math.round((new Date(t.fecha_fin + 'T00:00:00') - today()) / DAY);
export const semaforo = (t) => {
    if (isCerrado(t)) return 'Cerrado';
    if (!t.fecha_fin) return 'Sin fecha';
    const d = daysToDeadline(t);
    if (d < 0) return 'Vencida';
    if (d <= 7) return 'Por vencer';
    return 'En plazo';
};
export const nombreResponsable = (t, perfiles) => {
    if (t.responsable_id) {
        const p = perfiles.find(p => p.id === t.responsable_id);
        if (p) return p.cargo ? `${p.email.split('@')[0]} · ${p.cargo}` : p.email;
    }
    return t.responsable || 'Sin asignar';
};
