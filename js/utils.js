export const CDE_COLORS = { 
    WIP: 'background:#f1f5f9;color:#334155;', 
    Shared: 'background:#fef3c7;color:#92400e;', 
    Published: 'background:#ccfbf1;color:#115e59;', 
    Archived: 'background:#e2e8f0;color:#64748b;' 
};

export const APTITUD_DEFAULT = { WIP: 'S0', Shared: 'S1', Published: 'A1', Archived: null };
export const ESTADOS_CDE = ['WIP', 'Shared', 'Published', 'Archived'];
export const WEIGHT = { 'Muy alto': 3, 'Alto': 2, 'Medio': 1, 'Bajo': 0.5 };
export const DAY = 86400000;

export const cdeBadge = (e, a) => `<span class="badge-cde" style="${CDE_COLORS[e] || ''}">${e || 'WIP'} · ${a || '—'}</span>`;

export const today = () => { 
    const d = new Date(); 
    d.setHours(0,0,0,0); 
    return d; 
};

export const fmtDate = (iso) => !iso ? '–' : `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(2,4)}`;

export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const toast = (m) => { 
    const el = document.getElementById('toast'); 
    if (!el) return;
    el.textContent = m; 
    el.classList.remove('hidden'); 
    clearTimeout(toast._t); 
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600); 
};

export const isCerrado = (t) => t.estado === 'Cerrado';

export const daysToDeadline = (t) => !t.fecha_fin ? null : Math.round((new Date(t.fecha_fin + 'T00:00:00') - today()) / DAY);

export const isUrgente = (t) => {
    if (isCerrado(t) || !t.fecha_fin) return false;
    return daysToDeadline(t) <= 7;
};

export const isImportante = (t) => {
    if (isCerrado(t)) return false;
    return t.importancia === 'Muy alto' || t.importancia === 'Alto';
};

export const getCriticidad = (t) => {
    const urg = isUrgente(t);
    const imp = isImportante(t);
    if (urg && imp) return 'Muy alto';
    if (!urg && imp) return 'Alto';
    if (urg && !imp) return 'Medio';
    return 'Bajo';
};

export const semaforo = (t) => {
    if (isCerrado(t)) return 'Cerrado';
    if (!t.fecha_fin) return 'Sin fecha';
    const d = daysToDeadline(t);
    if (d < 0) return 'Vencida';
    if (d <= 7) return 'Por vencer';
    return 'En plazo';
};

export const nombreResponsable = (t, perfiles) => {
    let email = '';
    if (t.responsable_id) {
        const p = perfiles.find(p => p.id === t.responsable_id);
        if (p) email = p.email;
    }
    if (!email) email = t.responsable || '';
    if (!email) return 'Sin asignar';

    const nombreBase = email.split('@')[0];
    return nombreBase
        .replace(/[._-]/g, ' ')
        .replace(/\d+/g, '')
        .trim()
        .split(' ')
        .filter(p => p.length > 0)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
};

export const critColor = (c) => {
    return c === 'Muy alto' ? 'text-red-600' :
           c === 'Alto' ? 'text-orange-600' :
           c === 'Medio' ? 'text-amber-600' : 'text-slate-500';
};

// --- HELPERS PARA AVATARES Y NOMBRES ---
export function nombreFormateado(p) {
    if (!p || !p.email) return '';
    const base = p.email.split('@')[0];
    return base.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim()
        .split(' ').filter(x => x).map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
}

export function getIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    return (partes[0]?.[0] || '') + (partes[1]?.[0] || '');
}

export function colorAvatar(seed) {
    const colores = ['bg-sky-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-emerald-500'];
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colores[Math.abs(hash) % colores.length];
}

// --- MODAL DE CONFIRMACIÓN CON TEXTO ---
let confirmCallback = null;

export function confirmDelete(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const title = document.getElementById('confirm-title');
        const message = document.getElementById('confirm-message');
        const input = document.getElementById('confirm-input');
        const btn = document.getElementById('confirm-btn');
        const error = document.getElementById('confirm-error');
        
        if (!modal) { resolve(false); return; }
        
        title.textContent = options.title || 'Confirmar eliminación';
        message.textContent = options.message || '¿Estás seguro de que quieres eliminar esto?';
        input.value = '';
        error.classList.add('hidden');
        btn.disabled = true;
        
        confirmCallback = resolve;
        
        const checkInput = () => {
            if (input.value.trim() === 'Eliminar') {
                btn.disabled = false;
                error.classList.add('hidden');
            } else {
                btn.disabled = true;
            }
        };
        input.addEventListener('input', checkInput);
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => input.focus(), 100);
    });
}

window.closeConfirm = function() {
    const modal = document.getElementById('modal-confirm');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (confirmCallback) { confirmCallback(false); confirmCallback = null; }
};

window.executeConfirm = function() {
    const input = document.getElementById('confirm-input');
    const error = document.getElementById('confirm-error');
    
    if (input.value.trim() !== 'Eliminar') {
        error.classList.remove('hidden');
        return;
    }
    
    const modal = document.getElementById('modal-confirm');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    if (confirmCallback) { confirmCallback(true); confirmCallback = null; }
};
