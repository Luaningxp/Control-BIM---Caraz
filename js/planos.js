import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, fmtDate, toast } from './utils.js';

let planosState = {
    search: '',
    filterDisciplina: '',
    filterEstatus: '',
    showColMenu: false,
    visibleCols: {
        codigo: true,
        titulo: true,
        disciplina: true,
        revision: true,
        estado: true,
        estatus_bim: true,
        modelo_bim: true,
        actividades: true
    }
};

export function renderLogPlanos(container) {
    // Calcular cuántas actividades usan cada plano
    const conteoVinculados = {};
    const actividadPlanos = state.actividadPlanosCache || [];
    actividadPlanos.forEach(ap => {
        conteoVinculados[ap.plano_id] = (conteoVinculados[ap.plano_id] || 0) + 1;
    });

    const planos = state.planosCache || [];

    // Opciones para filtros
    const disciplinas = [...new Set(planos.map(p => p.disciplina).filter(Boolean))].sort();
    const estatusOpts = [...new Set(planos.map(p => p.estatus_bim).filter(Boolean))].sort();

    // Aplicar filtros
    let planosFiltrados = planos.filter(p => {
        const matchSearch = !planosState.search || 
            (p.codigo || '').toLowerCase().includes(planosState.search.toLowerCase()) ||
            (p.titulo || '').toLowerCase().includes(planosState.search.toLowerCase());
        const matchDisciplina = !planosState.filterDisciplina || p.disciplina === planosState.filterDisciplina;
        const matchEstatus = !planosState.filterEstatus || p.estatus_bim === planosState.filterEstatus;
        return matchSearch && matchDisciplina && matchEstatus;
    });

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full flex-wrap">
                <div class="relative w-full max-w-xs">
                    <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" id="pl-search" placeholder="Buscar código o título..." value="${planosState.search}" class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-sky-600">
                </div>
                <select id="pl-fil-disciplina" class="inp max-w-[150px] text-xs py-1.5">
                    <option value="">Todas las disciplinas</option>
                    ${disciplinas.map(d => `<option value="${escapeHtml(d)}" ${planosState.filterDisciplina === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
                </select>
                <select id="pl-fil-estatus" class="inp max-w-[150px] text-xs py-1.5">
                    <option value="">Todos los estatus</option>
                    ${estatusOpts.map(e => `<option value="${escapeHtml(e)}" ${planosState.filterEstatus === e ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
                </select>
            </div>
            
            <div class="flex items-center gap-3">
                <div class="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap hidden md:block">
                    Mostrando <b>${planosFiltrados.length}</b> de ${planos.length} planos
                </div>
                
                <!-- BOTÓN DE COLUMNAS -->
                <div class="relative">
                    <button onclick="window.togglePlanosColMenu()" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5">
                        <i class="fa-solid fa-table-columns"></i> Columnas <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>
                    <div class="${planosState.showColMenu ? 'block' : 'hidden'} absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 py-1">
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('codigo')" ${planosState.visibleCols.codigo ? 'checked' : ''} class="rounded text-sky-600"> Código</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('titulo')" ${planosState.visibleCols.titulo ? 'checked' : ''} class="rounded text-sky-600"> Título</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('disciplina')" ${planosState.visibleCols.disciplina ? 'checked' : ''} class="rounded text-sky-600"> Disciplina</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('revision')" ${planosState.visibleCols.revision ? 'checked' : ''} class="rounded text-sky-600"> Revisión</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('estado')" ${planosState.visibleCols.estado ? 'checked' : ''} class="rounded text-sky-600"> Estado</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('estatus_bim')" ${planosState.visibleCols.estatus_bim ? 'checked' : ''} class="rounded text-sky-600"> Estatus BIM</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('modelo_bim')" ${planosState.visibleCols.modelo_bim ? 'checked' : ''} class="rounded text-sky-600"> Modelo BIM</label>
                        <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs"><input type="checkbox" onchange="window.togglePlanosCol('actividades')" ${planosState.visibleCols.actividades ? 'checked' : ''} class="rounded text-sky-600"> Actividades</label>
                    </div>
                </div>

                <!-- BOTÓN DE IMPORTAR -->
                ${state.isAdmin || state.isCoordinador ? `
                <label class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                    <i class="fa-solid fa-file-import"></i> Importar
                    <input type="file" id="file-planos" accept=".xlsx, .xls" class="hidden" onchange="window.handlePlanosUpload(event)">
                </label>
                ` : ''}
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto max-h-[75vh] overflow-y-auto custom-scrollbar">
                <table class="w-full text-left text-xs">
                    <thead class="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 uppercase font-semibold sticky top-0 z-10 shadow-sm">
                        <tr>
                            ${planosState.visibleCols.codigo ? `<th class="p-3">Código</th>` : ''}
                            ${planosState.visibleCols.titulo ? `<th class="p-3">Título</th>` : ''}
                            ${planosState.visibleCols.disciplina ? `<th class="p-3">Disciplina</th>` : ''}
                            ${planosState.visibleCols.revision ? `<th class="p-3">Rev.</th>` : ''}
                            ${planosState.visibleCols.estado ? `<th class="p-3">Estado</th>` : ''}
                            ${planosState.visibleCols.estatus_bim ? `<th class="p-3">Estatus BIM</th>` : ''}
                            ${planosState.visibleCols.modelo_bim ? `<th class="p-3">Modelo BIM</th>` : ''}
                            ${planosState.visibleCols.actividades ? `<th class="p-3 text-center">Actividades</th>` : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${planosFiltrados.length === 0 ? `<tr><td colspan="8" class="text-center py-8 text-slate-400">No hay planos que coincidan.</td></tr>` : ''}
                        ${planosFiltrados.map(p => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                                ${planosState.visibleCols.codigo ? `<td class="p-3 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]" title="${escapeHtml(p.codigo)}">${escapeHtml(p.codigo)}</td>` : ''}
                                ${planosState.visibleCols.titulo ? `<td class="p-3 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[250px]" title="${escapeHtml(p.titulo)}">${escapeHtml(p.titulo || '-')}</td>` : ''}
                                ${planosState.visibleCols.disciplina ? `<td class="p-3 text-slate-600 dark:text-slate-400">${escapeHtml(p.disciplina || '-')}</td>` : ''}
                                ${planosState.visibleCols.revision ? `<td class="p-3 text-slate-600 dark:text-slate-400">${escapeHtml(p.revision || '-')}</td>` : ''}
                                ${planosState.visibleCols.estado ? `<td class="p-3 text-slate-600 dark:text-slate-400">${escapeHtml(p.estado || '-')}</td>` : ''}
                                ${planosState.visibleCols.estatus_bim ? `<td class="p-3">${p.estatus_bim ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">${escapeHtml(p.estatus_bim)}</span>` : '-'}</td>` : ''}
                                ${planosState.visibleCols.modelo_bim ? `<td class="p-3 text-slate-600 dark:text-slate-400 truncate max-w-[150px]">${escapeHtml(p.modelo_bim || '-')}</td>` : ''}
                                ${planosState.visibleCols.actividades ? `<td class="p-3 text-center">${conteoVinculados[p.id] ? `<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">${conteoVinculados[p.id]}</span>` : '<span class="text-slate-300">0</span>'}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Listeners
    document.getElementById('pl-search').addEventListener('input', (e) => {
        planosState.search = e.target.value;
        setTimeout(() => window.renderView(), 300);
    });
    document.getElementById('pl-fil-disciplina').addEventListener('change', (e) => {
        planosState.filterDisciplina = e.target.value;
        window.renderView();
    });
    document.getElementById('pl-fil-estatus').addEventListener('change', (e) => {
        planosState.filterEstatus = e.target.value;
        window.renderView();
    });
}

window.togglePlanosColMenu = function() {
    planosState.showColMenu = !planosState.showColMenu;
    window.renderView();
};

window.togglePlanosCol = function(col) {
    planosState.visibleCols[col] = !planosState.visibleCols[col];
    window.renderView();
};

// --- IMPORTAR EXCEL DE PLANOS ---
window.handlePlanosUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (json.length === 0) { toast('El archivo está vacío.'); return; }
            if (!confirm(`Se procesarán ${json.length} filas. Los planos con el mismo Código y Revisión ya existentes serán ignorados. ¿Continuar?`)) return;

            const inserts = json.map(row => {
                const getVal = (keys) => {
                    for (let k of keys) { if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); }
                    return null;
                };

                return {
                    codigo: getVal(['Codigo de entregable', 'Código de entregable', 'codigo']),
                    revision: getVal(['Revision', 'Revisión', 'revision']) || 'C01',
                    titulo: getVal(['Titulo de entregable', 'Título de entregable', 'titulo']),
                    disciplina: getVal(['Disciplina']),
                    clasificacion: getVal(['Clasificacion', 'Clasificación']),
                    fecha: getVal(['Fecha']) ? new Date(row['Fecha']).toISOString().split('T')[0] : null,
                    estado: getVal(['Estado']),
                    aconex: getVal(['Aconex']),
                    responsable: getVal(['Responsable']),
                    estatus_bim: getVal(['ESTATUS (BIM)', 'Estatus BIM']),
                    modelo_bim: getVal(['MODELO BIM', 'Modelo BIM'])
                };
            }).filter(p => p.codigo);

            if (inserts.length === 0) { toast('No se encontraron filas con código válido.'); return; }

            let importados = 0;
            for (let i = 0; i < inserts.length; i += 100) {
                const batch = inserts.slice(i, i + 100);
                const { data, error } = await supabaseClient
                    .from('planos')
                    .upsert(batch, { onConflict: 'codigo,revision', ignoreDuplicates: true })
                    .select();
                
                if (error) throw error;
                if (data) importados += data.length;
            }

            await fetchAll();
            window.renderView();
            toast(`¡${importados} planos nuevos importados! (Los duplicados fueron ignorados).`);

        } catch (err) {
            console.error(err);
            toast('Error al importar planos: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
};
