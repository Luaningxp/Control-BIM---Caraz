import { escapeHtml, toast, confirmDelete, hoyLima } from './utils.js';
import { supabaseClient, state, fetchAll, fetchParametros } from './db.js';
import { renderTarjetaBaseDatos, cargarEstadoBaseDatos } from './basedatos.js';

export function renderConfig(container) {
    container.innerHTML = `
        <div class="card p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <div>
                    <h3 class="font-bold text-sm text-slate-800">Gestión de Datos</h3>
                    <p class="text-[11px] text-slate-500">Importa desde Excel (.xlsx) o descarga tu base actual.</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.exportToExcel()" class="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs font-semibold rounded hover:bg-slate-50 transition">
                        <i class="fa-solid fa-file-excel text-green-600 mr-1"></i> Exportar a Excel
                    </button>
                    <label class="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded cursor-pointer hover:bg-green-700 transition">
                        <i class="fa-solid fa-file-import mr-1"></i> Importar Excel
                        <input type="file" id="file-upload" accept=".xlsx, .xls" class="hidden" onchange="window.handleFileUpload(event)">
                    </label>
                </div>
            </div>
            <div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                <b>Formato esperado para importar:</b> La primera fila del Excel debe tener los encabezados: <i>Actividad, Grupo, Responsable, Importancia, Urgencia, Estado, Inicio Prog., Fin Prog., Cierre Real, Nota</i>. (El sistema los detectará automáticamente).
            </div>
        </div>

        <div class="grid lg:grid-cols-5 gap-3">
            <!-- 1. GRUPOS -->
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Grupos BIM</h3>
                    <button onclick="window.openGrupoModal()" class="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700">+ Añadir</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody id="grupos-table" class="divide-y divide-slate-100">
                            ${state.gruposCache.map(g => `
                                <tr class="hover:bg-slate-50">
                                    <td class="py-2">${escapeHtml(g.nombre)}</td>
                                    <td class="py-2 text-right">
                                        <button onclick="window.openGrupoModal(${g.id})" class="text-sky-600 mr-2 hover:text-sky-800"><i class="fa-solid fa-pen"></i></button>
                                        <button onclick="window.deleteGrupo(${g.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 2. PROPIEDADES PERSONALIZADAS -->
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Parámetros Personalizados</h3>
                    <button onclick="window.openPropModal()" class="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700">+ Añadir</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody id="props-table" class="divide-y divide-slate-100">
                            ${state.propDefsCache.map(pd => `
                                <tr class="hover:bg-slate-50">
                                    <td class="py-2"><b>${escapeHtml(pd.nombre)}</b> <span class="text-[10px] text-slate-400 bg-slate-100 px-1 rounded uppercase">${pd.tipo}</span></td>
                                    <td class="py-2 text-right">
                                        <button onclick="window.openPropModal(${pd.id})" class="text-sky-600 mr-2 hover:text-sky-800"><i class="fa-solid fa-pen"></i></button>
                                        <button onclick="window.deleteProp(${pd.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td class="text-center text-slate-400 py-4">Sin parámetros</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 3. USUARIOS -->
            <div class="card p-4">
                <h3 class="font-bold text-sm text-slate-800 mb-3">Usuarios</h3>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody class="divide-y divide-slate-100">
                            ${state.perfilesCache.map(p => `
                                <tr class="hover:bg-slate-50">
                                    <td class="py-2"><div class="font-semibold">${escapeHtml(p.email)}</div><div class="text-[10px] text-slate-500">${escapeHtml(p.cargo || 'Sin cargo')}</div></td>
                                    <td class="py-2 text-right whitespace-nowrap">
                                        <button onclick="window.openCargoModal('${p.id}')" class="text-sky-600 hover:text-sky-800 mr-2" title="Editar cargo"><i class="fa-solid fa-pen"></i></button>
                                        ${state.isAdmin ? `<button onclick="window.openPasswordModal('${p.id}')" class="text-amber-600 hover:text-amber-800" title="Cambiar contraseña"><i class="fa-solid fa-key"></i></button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 4. CAUSAS DE INCUMPLIMIENTO -->
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Causas de Incumplimiento</h3>
                    <button onclick="window.openCausaModal()" class="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700">+ Añadir</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody id="causas-table" class="divide-y divide-slate-100">
                            ${(state.causasTodasCache || state.causasCache || []).map(c => `
                                <tr class="hover:bg-slate-50 ${c.activo === false ? 'opacity-60' : ''}">
                                    <td class="py-2">
                                        ${escapeHtml(c.nombre)}
                                        ${c.activo === false ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[9px] font-bold uppercase">Inactiva</span>' : ''}
                                    </td>
                                    <td class="py-2 text-right whitespace-nowrap">
                                        <button onclick="window.openCausaModal(${c.id})" class="text-sky-600 mr-2 hover:text-sky-800" title="Editar"><i class="fa-solid fa-pen"></i></button>
                                        ${c.activo === false
                                            ? `<button onclick="window.reactivarCausa(${c.id})" class="text-emerald-600 hover:text-emerald-800" title="Reactivar"><i class="fa-solid fa-rotate-left"></i></button>`
                                            : `<button onclick="window.deleteCausa(${c.id})" class="text-red-500 hover:text-red-700" title="Desactivar o eliminar"><i class="fa-solid fa-trash"></i></button>`}
                                    </td>
                                </tr>
                            `).join('') || '<tr><td class="text-center text-slate-400 py-4">Sin causas</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 4b. ESPECIALIDADES -->
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <div>
                        <h3 class="font-bold text-sm text-slate-800">Especialidades</h3>
                        <p class="text-[10px] text-slate-500">Obligatoria en cada actividad. GENERAL es la de respaldo.</p>
                    </div>
                    <button onclick="window.openEspecialidadModal()" class="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700">+ Añadir</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody class="divide-y divide-slate-100">
                            ${(state.especialidadesTodasCache || []).map(e => `
                                <tr class="hover:bg-slate-50 ${e.activo === false ? 'opacity-60' : ''}">
                                    <td class="py-2">
                                        ${escapeHtml(e.nombre)}
                                        ${e.activo === false ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[9px] font-bold uppercase">Inactiva</span>' : ''}
                                    </td>
                                    <td class="py-2 text-right whitespace-nowrap">
                                        <button onclick="window.openEspecialidadModal(${e.id})" class="text-sky-600 mr-2 hover:text-sky-800" title="Editar"><i class="fa-solid fa-pen"></i></button>
                                        ${e.nombre === 'GENERAL' ? '' : e.activo === false
                                            ? `<button onclick="window.reactivarEspecialidad(${e.id})" class="text-emerald-600 hover:text-emerald-800" title="Reactivar"><i class="fa-solid fa-rotate-left"></i></button>`
                                            : `<button onclick="window.deleteEspecialidad(${e.id})" class="text-red-500 hover:text-red-700" title="Desactivar o eliminar"><i class="fa-solid fa-trash"></i></button>`}
                                    </td>
                                </tr>
                            `).join('') || '<tr><td class="text-center text-slate-400 py-4">Sin especialidades (ejecuta sql/002_dashboard_ppc_especialidades.sql)</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 4c. LÍMITES WIP -->
            <div class="card p-4">
                <div class="mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Límites WIP (Recursos)</h3>
                    <p class="text-[10px] text-slate-500">Actividades en paralelo por día antes de marcar sobrecarga.</p>
                </div>
                <div class="space-y-2 text-xs">
                    <label class="flex items-center justify-between gap-2">
                        <span>Modelador</span>
                        <input id="wip-modelador" type="number" min="1" step="1" value="${state.parametrosApp?.wip_modelador ?? 3}" ${state.isAdmin ? '' : 'disabled'} class="w-20 border border-slate-300 rounded px-2 py-1 text-right">
                    </label>
                    <label class="flex items-center justify-between gap-2">
                        <span>Supervisor (lideradas)</span>
                        <input id="wip-supervisor" type="number" min="1" step="1" value="${state.parametrosApp?.wip_supervisor ?? 8}" ${state.isAdmin ? '' : 'disabled'} class="w-20 border border-slate-300 rounded px-2 py-1 text-right">
                    </label>
                    ${state.isAdmin
                        ? '<button onclick="window.guardarLimitesWIP()" class="w-full mt-1 px-2 py-1.5 bg-sky-600 text-white rounded hover:bg-sky-700">Guardar límites</button>'
                        : '<p class="text-[10px] text-slate-400">Solo el administrador puede modificarlos.</p>'}
                </div>
            </div>

            <!-- 4d. META PPC -->
            <div class="card p-4">
                <div class="mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Meta de PPC (Dashboard)</h3>
                    <p class="text-[10px] text-slate-500">Referencia Last Planner: 80%. Equipos que recién empiezan suelen estar en 50–60%; los maduros sostienen 80–85% o más.</p>
                </div>
                <div class="space-y-2 text-xs">
                    <label class="flex items-center justify-between gap-2">
                        <span>Meta semanal (%)</span>
                        <input id="meta-ppc" type="number" min="1" max="100" step="1" value="${state.parametrosApp?.meta_ppc ?? 80}" ${state.isAdmin ? '' : 'disabled'} class="w-20 border border-slate-300 rounded px-2 py-1 text-right">
                    </label>
                    ${state.isAdmin
                        ? '<button onclick="window.guardarMetaPPC()" class="w-full mt-1 px-2 py-1.5 bg-sky-600 text-white rounded hover:bg-sky-700">Guardar meta</button>'
                        : '<p class="text-[10px] text-slate-400">Solo el administrador puede modificarla.</p>'}
                </div>
            </div>

            <!-- 5. SUBCONTRATAS -->
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-sm text-slate-800">Subcontratas</h3>
                    <button onclick="window.openSubcontrataModal()" class="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700">+ Añadir</button>
                </div>
                <div class="overflow-y-auto max-h-64">
                    <table class="w-full text-left text-xs">
                        <tbody class="divide-y divide-slate-100">
                            ${(state.subcontratasCache || []).map(s => `
                                <tr class="hover:bg-slate-50">
                                    <td class="py-2">${escapeHtml(s.nombre)}</td>
                                    <td class="py-2 text-right">
                                        <button onclick="window.openSubcontrataModal(${s.id})" class="text-sky-600 mr-2 hover:text-sky-800"><i class="fa-solid fa-pen"></i></button>
                                        <button onclick="window.deleteSubcontrata(${s.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td class="text-center text-slate-400 py-4">Sin subcontratas</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        ${renderTarjetaBaseDatos()}

        ${renderModales()}
    `;
    if (state.isAdmin) cargarEstadoBaseDatos();
}

// --- LÓGICA DE EXPORTAR ---
window.exportToExcel = () => {
    const tasks = state.tasksCache;
    if (tasks.length === 0) { toast('No hay datos para exportar'); return; }

    const data = tasks.map(t => ({
        'Actividad': t.actividad,
        'Grupo': t.grupo || '',
        'Responsable': t.responsable || '',
        'Importancia': t.importancia || 'Medio',
        'Urgencia': t.urgencia || 'Medio',
        'Estado': t.estado,
        'Inicio Prog.': t.fecha_inicio_programado || '',
        'Fin Prog.': t.fecha_fin || '',
        'Cierre Real': t.fecha_cierre || '',
        'Nota': t.nota || '',
        'CDE': t.estado_cde || 'WIP',
        'Aptitud': t.codigo_aptitud || 'S0'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base de Datos");
    XLSX.writeFile(wb, `Control_BIM_Export_${hoyLima()}.xlsx`);
};

// --- LÓGICA DE IMPORTAR (REEMPLAZAR) ---
window.handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            
            if (json.length < 2) { toast('El archivo está vacío.'); return; }
            
            if (!confirm(`Se encontraron ${json.length - 1} filas.\n\n¿Deseas REEMPLAZAR la base de datos actual?\n(Las actividades actuales se archivan, no se borran.)`)) return;

            const headers = json[0].map(h => String(h).trim().toLowerCase());
            const findCol = (names) => {
                for (let n of names) { const i = headers.indexOf(n.toLowerCase()); if (i !== -1) return i; }
                return -1;
            };

            const colActividad = findCol(['actividad']);
            const colGrupo = findCol(['grupo']);
            const colResp = findCol(['responsable', 'correo', 'email']);
            const colImp = findCol(['importancia']);
            const colUrg = findCol(['urgencia']);
            const colEstado = findCol(['estado']);
            const colIni = findCol(['inicio prog.', 'inicio']);
            const colFin = findCol(['fin prog.', 'fin']);
            const colCierre = findCol(['cierre real', 'cierre']);
            const colNota = findCol(['nota', 'restricción']);

            if (colActividad === -1) { toast('No se encontró la columna "Actividad".'); return; }

            const formatNombre = (email) => {
                if (!email) return '';
                const base = email.split('@')[0];
                return base.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim()
                    .split(' ').filter(x => x).map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
            };

            const parseNivel = (val) => {
                if (val === true || String(val).toLowerCase() === 'true') return 'Alto';
                if (val === false || String(val).toLowerCase() === 'false') return 'Bajo';
                const s = String(val).trim().toLowerCase();
                if (s === 'muy alto') return 'Muy alto';
                if (s === 'alto') return 'Alto';
                if (s === 'medio') return 'Medio';
                if (s === 'bajo') return 'Bajo';
                return 'Medio';
            };

            const parseDate = (val) => {
                if (!val || val === 0 || val === '0' || String(val).trim() === '') return null;
                if (val instanceof Date) return new Date(val.getTime() - val.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                if (typeof val === 'number') {
                    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                    return date.toISOString().split('T')[0];
                }
                const str = String(val).trim();
                const d = new Date(str.includes('/') ? str.split('/').reverse().join('-') : str);
                return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
            };

            // El grupo debe existir en el catálogo (sin importar mayúsculas ni tildes)
            const claveGrupo = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toUpperCase().replace(/\s+/g, ' ').trim();
            const gruposPorClave = new Map(state.gruposCache.map(g => [claveGrupo(g.nombre), g.nombre]));
            const gruposDesconocidos = new Set();
            const resolverGrupo = (val) => {
                const texto = String(val ?? '').trim();
                if (!texto) return null;
                const nombre = gruposPorClave.get(claveGrupo(texto));
                if (!nombre) gruposDesconocidos.add(texto);
                return nombre || null;
            };

            const inserts = [];
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0 || !row[colActividad]) continue;

                const actTexto = String(row[colActividad]).trim();
                if (!actTexto) continue;

                let respId = null;
                let respEmailReal = null;
                const excelResp = colResp !== -1 ? String(row[colResp]).trim().toLowerCase() : '';
                
                if (excelResp) {
                    const perfil = state.perfilesCache.find(p => {
                        const nombrePerfil = formatNombre(p.email).toLowerCase();
                        return nombrePerfil === excelResp || p.email.toLowerCase() === excelResp;
                    });
                    if (perfil) {
                        respId = perfil.id;
                        respEmailReal = perfil.email;
                    }
                }

                inserts.push({
                    actividad: actTexto,
                    grupo: colGrupo !== -1 ? resolverGrupo(row[colGrupo]) : null,
                    responsable: respEmailReal || null,
                    responsable_id: respId,
                    importancia: colImp !== -1 ? parseNivel(row[colImp]) : 'Medio',
                    urgencia: colUrg !== -1 ? parseNivel(row[colUrg]) : 'Medio',
                    estado: colEstado !== -1 && row[colEstado] ? String(row[colEstado]).trim() : 'No iniciado',
                    fecha_inicio_programado: colIni !== -1 ? parseDate(row[colIni]) : null,
                    fecha_fin: colFin !== -1 ? parseDate(row[colFin]) : null,
                    fecha_cierre: colCierre !== -1 ? parseDate(row[colCierre]) : null,
                    nota: colNota !== -1 && row[colNota] ? String(row[colNota]).trim() : null,
                    estado_cde: 'WIP',
                    codigo_aptitud: 'S0',
                    user_id: state.currentUser.id
                });
            }

            if (inserts.length === 0) { toast('No se encontraron datos válidos.'); return; }

            // Reemplazar = archivar las actividades vigentes (nunca se borran: se conservan sus HH)
            const { error: delError } = await supabaseClient.rpc('archivar_todas_actividades');
            if (delError) throw new Error("Error al archivar las actividades actuales: " + delError.message);

            for (let i = 0; i < inserts.length; i += 50) {
                const { error } = await supabaseClient.from('pendientes_bim').insert(inserts.slice(i, i + 50));
                if (error) throw error;
            }

            await fetchAll();
            window.renderView();
            if (gruposDesconocidos.size) {
                const lista = [...gruposDesconocidos].sort();
                console.warn('Grupos no encontrados en el catálogo (actividades importadas sin grupo):', lista);
                alert(`Se importaron ${inserts.length} actividades.\n\nEstos grupos no existen en el catálogo y sus actividades quedaron SIN GRUPO:\n- ${lista.join('\n- ')}`);
            } else {
                toast(`¡Importadas ${inserts.length} actividades con éxito!`);
            }

        } catch (err) {
            console.error(err);
            toast('Error al importar: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; 
};

function renderModales() {
    return `
        <div id="modal-grupo" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="grupo-modal-title">Nuevo grupo</h3>
                <form onsubmit="window.saveGrupo(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="grupo-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre *</label><input type="text" id="grupo-nombre" required class="inp uppercase" oninput="this.value = this.value.toUpperCase()"></div>
                    <div class="flex items-center gap-2"><input type="checkbox" id="grupo-activo" checked class="w-4 h-4"><label class="text-slate-600 font-semibold">Activo</label></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="document.getElementById('modal-grupo').classList.add('hidden')" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-password" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800">Cambiar contraseña</h3>
                <p id="password-user-email" class="text-[11px] text-slate-500"></p>
                <form onsubmit="window.savePassword(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="password-user-id">
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Nueva contraseña</label>
                        <input type="text" id="password-new" required minlength="6" class="inp" placeholder="Mínimo 6 caracteres">
                    </div>
                    <div class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                        <i class="fa-solid fa-circle-info mr-1 text-sky-600"></i>
                        Comparte esta contraseña con el usuario de forma privada.
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closePasswordModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-amber-600 text-white font-semibold rounded hover:bg-amber-700">Actualizar contraseña</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-prop" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="prop-modal-title">Nuevo Parámetro</h3>
                <form onsubmit="window.saveProp(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="prop-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre del parámetro *</label><input type="text" id="prop-nombre" required class="inp" placeholder="Ej: Plano vinculado"></div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Tipo de dato</label>
                        <select id="prop-tipo" onchange="document.getElementById('prop-opts-container').style.display = this.value === 'seleccion' ? 'block' : 'none'" class="inp">
                            <option value="texto">Texto libre</option><option value="numero">Número</option><option value="fecha">Fecha</option><option value="booleano">Sí / No</option><option value="seleccion">Lista desplegable</option>
                        </select>
                    </div>
                    <div id="prop-opts-container" style="display:none">
                        <label class="block font-semibold text-slate-600 mb-1">Opciones (separadas por coma)</label><input type="text" id="prop-opciones" class="inp" placeholder="Opción 1, Opción 2">
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closePropModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-cargo" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800">Editar cargo</h3>
                <form onsubmit="window.saveCargo(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="cargo-user-id">
                    <p id="cargo-user-email" class="text-slate-500"></p>
                    <div><label class="block font-semibold text-slate-600 mb-1">Cargo</label><select id="cargo-value" class="inp"><option value="">— Sin cargo —</option><option>BIM Manager</option><option>Coordinador BIM</option><option>Supervisor BIM</option><option>Modelador BIM</option></select></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeCargoModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-especialidad" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="esp-modal-title">Nueva especialidad</h3>
                <form onsubmit="window.saveEspecialidad(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="esp-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre (sigla) *</label><input type="text" id="esp-nombre" required class="inp" placeholder="Ej. IIEE"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeEspecialidadModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-causa" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="causa-modal-title">Nueva causa</h3>
                <form onsubmit="window.saveCausa(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="causa-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre *</label><input type="text" id="causa-nombre" required class="inp"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeCausaModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="modal-subcontrata" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="subcontrata-modal-title">Nueva subcontrata</h3>
                <form onsubmit="window.saveSubcontrata(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="subcontrata-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre *</label><input type="text" id="subcontrata-nombre" required class="inp" placeholder="Ej: MEP Ingenieros S.A.C."></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeSubcontrataModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- FUNCIONES EXPORTADAS (Grupos, Props, Cargos, Causas) ---
export function openGrupoModal(id) {
    const g = id ? state.gruposCache.find(x => x.id === id) : null;
    document.getElementById('grupo-modal-title').innerText = g ? 'Editar grupo' : 'Nuevo grupo';
    document.getElementById('grupo-id').value = g?.id || '';
    document.getElementById('grupo-nombre').value = g?.nombre || '';
    document.getElementById('grupo-activo').checked = g ? !!g.activo : true;
    document.getElementById('modal-grupo').classList.remove('hidden');
    document.getElementById('modal-grupo').classList.add('flex');
}
export function closeGrupoModal() { document.getElementById('modal-grupo').classList.add('hidden'); document.getElementById('modal-grupo').classList.remove('flex'); }
export async function saveGrupo(e) {
    e.preventDefault();
    const id = document.getElementById('grupo-id').value;
    const payload = { nombre: document.getElementById('grupo-nombre').value.trim().replace(/\s+/g, ' ').toUpperCase(), activo: document.getElementById('grupo-activo').checked };
    if (!payload.nombre) { toast('Nombre requerido'); return; }
    const { error } = id ? await supabaseClient.from('grupos_bim').update(payload).eq('id', id) : await supabaseClient.from('grupos_bim').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    closeGrupoModal(); await fetchAll(); window.renderView(); toast('Grupo guardado');
}
export async function deleteGrupo(id) {
    const g = state.gruposCache.find(x => x.id === id);
    if (!g) return;
    
    const confirmado = await confirmDelete({
        title: 'Eliminar grupo',
        message: `Vas a eliminar el grupo "${g.nombre}". Las actividades que lo usaban quedarán sin grupo. Esta acción no se puede deshacer.`
    });
    
    if (!confirmado) return;
    
    const { error } = await supabaseClient.from('grupos_bim').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); 
    window.renderView();
    toast('Grupo eliminado');
}
export function openPropModal(id) {
    const pd = id ? state.propDefsCache.find(x => x.id === id) : null;
    document.getElementById('prop-modal-title').innerText = pd ? 'Editar Parámetro' : 'Nuevo Parámetro';
    document.getElementById('prop-id').value = pd?.id || '';
    document.getElementById('prop-nombre').value = pd?.nombre || '';
    document.getElementById('prop-tipo').value = pd?.tipo || 'texto';
    document.getElementById('prop-opciones').value = pd?.opciones ? pd.opciones.join(', ') : '';
    document.getElementById('prop-opts-container').style.display = (pd?.tipo === 'seleccion') ? 'block' : 'none';
    document.getElementById('modal-prop').classList.remove('hidden');
    document.getElementById('modal-prop').classList.add('flex');
}
export function closePropModal() { document.getElementById('modal-prop').classList.add('hidden'); document.getElementById('modal-prop').classList.remove('flex'); }
export async function saveProp(e) {
    e.preventDefault();
    const id = document.getElementById('prop-id').value;
    const tipo = document.getElementById('prop-tipo').value;
    const opcionesStr = document.getElementById('prop-opciones').value;
    const opciones = (tipo === 'seleccion' && opcionesStr) ? opcionesStr.split(',').map(s=>s.trim()).filter(Boolean) : null;
    const payload = { nombre: document.getElementById('prop-nombre').value, tipo: tipo, opciones: opciones, activo: true };
    const { error } = id ? await supabaseClient.from('propiedades_def').update(payload).eq('id', id) : await supabaseClient.from('propiedades_def').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    closePropModal(); await fetchAll(); window.renderView(); toast('Parámetro guardado');
}
export async function deleteProp(id) {
    const pd = state.propDefsCache.find(x => x.id === id);
    if (!pd) return;
    
    const confirmado = await confirmDelete({
        title: 'Eliminar parámetro personalizado',
        message: `Vas a eliminar el parámetro "${pd.nombre}". Se borrarán también los valores guardados en todas las actividades. Esta acción no se puede deshacer.`
    });
    
    if (!confirmado) return;
    
    const { error } = await supabaseClient.from('propiedades_def').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); 
    window.renderView();
    toast('Parámetro eliminado');
}
export function openCargoModal(userId) {
    const p = state.perfilesCache.find(x => x.id === userId);
    if (!p) return;
    document.getElementById('cargo-user-id').value = p.id;
    document.getElementById('cargo-user-email').innerText = p.email;
    document.getElementById('cargo-value').value = p.cargo || '';
    document.getElementById('modal-cargo').classList.remove('hidden');
    document.getElementById('modal-cargo').classList.add('flex');
}
export function closeCargoModal() { document.getElementById('modal-cargo').classList.add('hidden'); document.getElementById('modal-cargo').classList.remove('flex'); }
export async function saveCargo(e) {
    e.preventDefault();
    const id = document.getElementById('cargo-user-id').value;
    const cargo = document.getElementById('cargo-value').value || null;
    const { error } = await supabaseClient.from('perfiles').update({ cargo }).eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    closeCargoModal(); await fetchAll(); window.renderView(); toast('Cargo actualizado');
}
export function openCausaModal(id) {
    const c = id ? (state.causasTodasCache || state.causasCache || []).find(x => x.id === id) : null;
    document.getElementById('causa-modal-title').innerText = c ? 'Editar causa' : 'Nueva causa';
    document.getElementById('causa-id').value = c?.id || '';
    document.getElementById('causa-nombre').value = c?.nombre || '';
    document.getElementById('modal-causa').classList.remove('hidden');
    document.getElementById('modal-causa').classList.add('flex');
}
export function closeCausaModal() { document.getElementById('modal-causa').classList.add('hidden'); document.getElementById('modal-causa').classList.remove('flex'); }
export async function saveCausa(e) {
    e.preventDefault();
    const id = document.getElementById('causa-id').value;
    const nombre = document.getElementById('causa-nombre').value.trim();
    if (!nombre) { toast('Nombre requerido'); return; }
    const { error } = id
        ? await supabaseClient.from('causas_incumplimiento').update({ nombre }).eq('id', id)
        : await supabaseClient.from('causas_incumplimiento').insert([{ nombre, activo: true }]);
    if (error) { toast('Error: ' + error.message); return; }
    closeCausaModal(); await fetchAll(); window.renderView(); toast('Causa guardada');
}
export async function deleteCausa(id) {
    const c = (state.causasTodasCache || state.causasCache || []).find(x => x.id === id);
    if (!c) return;

    // ¿La causa tiene historial? (cierres tardíos o reprogramaciones)
    const [tc, rp] = await Promise.all([
        supabaseClient.from('tarea_causas').select('*', { count: 'exact', head: true }).eq('causa_id', id),
        supabaseClient.from('reprogramaciones_bim').select('*', { count: 'exact', head: true }).eq('causa_id', id)
    ]);
    if (tc.error || rp.error) { toast('No se pudo verificar el uso de la causa.'); return; }
    const usos = (tc.count || 0) + (rp.count || 0);

    if (usos > 0) {
        // Con historial: se desactiva (reversible), no se borra
        const { data, error } = await supabaseClient
            .from('causas_incumplimiento').update({ activo: false }).eq('id', id).select('id');
        if (error) { toast('Error: ' + error.message); return; }
        if (!data || data.length === 0) { toast('No se pudo desactivar: la base de datos no te lo permite.'); return; }
        await fetchAll(); window.renderView();
        toast(`Causa desactivada (tiene ${usos} registro${usos === 1 ? '' : 's'}). Se conserva en el historial.`);
        return;
    }

    // Sin uso: se puede eliminar
    const confirmado = await confirmDelete({ title: 'Eliminar causa', message: `Vas a eliminar "${c.nombre}". No tiene registros asociados.` });
    if (!confirmado) return;
    const { data, error } = await supabaseClient
        .from('causas_incumplimiento').delete().eq('id', id).select('id');
    if (error) { toast('Error: ' + error.message); return; }
    if (!data || data.length === 0) { toast('No se pudo eliminar: la base de datos no te lo permite.'); return; }
    await fetchAll(); window.renderView(); toast('Causa eliminada');
}

export async function reactivarCausa(id) {
    const { data, error } = await supabaseClient
        .from('causas_incumplimiento').update({ activo: true }).eq('id', id).select('id');
    if (error) { toast('Error: ' + error.message); return; }
    if (!data || data.length === 0) { toast('No se pudo reactivar: la base de datos no te lo permite.'); return; }
    await fetchAll(); window.renderView(); toast('Causa reactivada');
}
window.openCausaModal = openCausaModal;
window.closeCausaModal = closeCausaModal;
window.saveCausa = saveCausa;
window.deleteCausa = deleteCausa;
window.reactivarCausa = reactivarCausa;

// --- ESPECIALIDADES (catálogo) ---
function buscarEspecialidad(id) {
    return (state.especialidadesTodasCache || []).find(x => String(x.id) === String(id)) || null;
}
window.openEspecialidadModal = function(id) {
    const e = id ? buscarEspecialidad(id) : null;
    document.getElementById('esp-modal-title').innerText = e ? 'Editar especialidad' : 'Nueva especialidad';
    document.getElementById('esp-id').value = e?.id || '';
    document.getElementById('esp-nombre').value = e?.nombre || '';
    document.getElementById('esp-nombre').disabled = e?.nombre === 'GENERAL';
    document.getElementById('modal-especialidad').classList.remove('hidden');
    document.getElementById('modal-especialidad').classList.add('flex');
};
window.closeEspecialidadModal = function() {
    document.getElementById('modal-especialidad').classList.add('hidden');
    document.getElementById('modal-especialidad').classList.remove('flex');
};
window.saveEspecialidad = async function(ev) {
    ev.preventDefault();
    const id = document.getElementById('esp-id').value;
    const nombre = document.getElementById('esp-nombre').value.trim().toUpperCase();
    if (!nombre) return;
    if (buscarEspecialidad(id)?.nombre === 'GENERAL') { window.closeEspecialidadModal(); return; }
    const dup = (state.especialidadesTodasCache || []).some(x => x.nombre.toUpperCase() === nombre && String(x.id) !== String(id));
    if (dup) { toast('Ya existe esa especialidad.'); return; }
    const orden = Math.max(0, ...(state.especialidadesTodasCache || []).map(x => x.orden || 0)) + 1;
    const { error } = id
        ? await supabaseClient.from('especialidades').update({ nombre }).eq('id', id)
        : await supabaseClient.from('especialidades').insert([{ nombre, activo: true, orden }]);
    if (error) { toast('Error: ' + error.message); return; }
    window.closeEspecialidadModal(); await fetchAll(); window.renderView(); toast('Especialidad guardada');
};
window.deleteEspecialidad = async function(id) {
    const e = buscarEspecialidad(id);
    if (!e || e.nombre === 'GENERAL') return;
    const usos = (state.tasksCache || []).filter(t => String(t.especialidad_id) === String(id)).length;
    if (usos > 0) {
        const { data, error } = await supabaseClient.from('especialidades').update({ activo: false }).eq('id', id).select('id');
        if (error) { toast('Error: ' + error.message); return; }
        if (!data || data.length === 0) { toast('No se pudo desactivar: la base de datos no te lo permite.'); return; }
        await fetchAll(); window.renderView();
        toast(`Especialidad desactivada (la usan ${usos} actividad${usos === 1 ? '' : 'es'}). Se conserva en el historial.`);
        return;
    }
    const confirmado = await confirmDelete({ title: 'Eliminar especialidad', message: `Vas a eliminar "${e.nombre}". Ninguna actividad la usa.` });
    if (!confirmado) return;
    const { data, error } = await supabaseClient.from('especialidades').delete().eq('id', id).select('id');
    if (error) { toast('Error: ' + error.message); return; }
    if (!data || data.length === 0) { toast('No se pudo eliminar: la base de datos no te lo permite.'); return; }
    await fetchAll(); window.renderView(); toast('Especialidad eliminada');
};
window.reactivarEspecialidad = async function(id) {
    const { data, error } = await supabaseClient.from('especialidades').update({ activo: true }).eq('id', id).select('id');
    if (error) { toast('Error: ' + error.message); return; }
    if (!data || data.length === 0) { toast('No se pudo reactivar: la base de datos no te lo permite.'); return; }
    await fetchAll(); window.renderView(); toast('Especialidad reactivada');
};

// --- CAMBIO DE CONTRASEÑA (solo admin) ---
window.openPasswordModal = function(userId) {
    if (!state.isAdmin) { toast('Solo el administrador puede cambiar contraseñas.'); return; }
    const p = state.perfilesCache.find(x => x.id === userId);
    if (!p) return;
    document.getElementById('password-user-id').value = p.id;
    document.getElementById('password-user-email').innerText = p.email;
    document.getElementById('password-new').value = '';
    document.getElementById('modal-password').classList.remove('hidden');
    document.getElementById('modal-password').classList.add('flex');
};

window.closePasswordModal = function() {
    document.getElementById('modal-password').classList.add('hidden');
    document.getElementById('modal-password').classList.remove('flex');
};

window.savePassword = async function(e) {
    e.preventDefault();
    if (!state.isAdmin) { toast('Solo el administrador puede cambiar contraseñas.'); return; }
    
    const userId = document.getElementById('password-user-id').value;
    const newPassword = document.getElementById('password-new').value;
    
    if (newPassword.length < 6) {
        toast('La contraseña debe tener al menos 6 caracteres.');
        return;
    }
    
    const { data, error } = await supabaseClient.rpc('admin_update_password', {
        target_user_id: userId,
        new_password: newPassword
    });
    
    if (error) { toast('Error: ' + error.message); return; }
    if (!data || !data.ok) { toast('Error: ' + (data?.error || 'desconocido')); return; }
    
    toast('Contraseña actualizada correctamente');
    window.closePasswordModal();
};
window.handleFileUpload = handleFileUpload;
window.exportToExcel = exportToExcel;
export function openSubcontrataModal(id) {
    const s = id ? (state.subcontratasCache || []).find(x => x.id === id) : null;
    document.getElementById('subcontrata-modal-title').innerText = s ? 'Editar subcontrata' : 'Nueva subcontrata';
    document.getElementById('subcontrata-id').value = s?.id || '';
    document.getElementById('subcontrata-nombre').value = s?.nombre || '';
    document.getElementById('modal-subcontrata').classList.remove('hidden');
    document.getElementById('modal-subcontrata').classList.add('flex');
}
export function closeSubcontrataModal() { document.getElementById('modal-subcontrata').classList.add('hidden'); document.getElementById('modal-subcontrata').classList.remove('flex'); }
export async function saveSubcontrata(e) {
    e.preventDefault();
    const id = document.getElementById('subcontrata-id').value;
    const payload = { nombre: document.getElementById('subcontrata-nombre').value.trim(), activo: true };
    if (!payload.nombre) { toast('Nombre requerido'); return; }
    const { error } = id
        ? await supabaseClient.from('subcontratas').update(payload).eq('id', id)
        : await supabaseClient.from('subcontratas').insert([payload]);
    if (error) { toast('Error: ' + error.message); return; }
    closeSubcontrataModal(); await fetchAll(); window.renderView(); toast('Subcontrata guardada');
}
export async function deleteSubcontrata(id) {
    const s = (state.subcontratasCache || []).find(x => x.id === id);
    if (!s) return;
    const confirmado = await confirmDelete({ title: 'Eliminar subcontrata', message: `Vas a eliminar "${s.nombre}". Las tareas que la usaban quedarán sin subcontrata.` });
    if (!confirmado) return;
    const { error } = await supabaseClient.from('subcontratas').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView(); toast('Subcontrata eliminada');
}
window.openSubcontrataModal = openSubcontrataModal;
window.closeSubcontrataModal = closeSubcontrataModal;
window.saveSubcontrata = saveSubcontrata;
window.deleteSubcontrata = deleteSubcontrata;

window.guardarLimitesWIP = async () => {
    if (!state.isAdmin) { toast('Solo el administrador puede modificar los límites.'); return; }
    const mod = parseInt(document.getElementById('wip-modelador')?.value, 10);
    const sup = parseInt(document.getElementById('wip-supervisor')?.value, 10);
    if (!(mod >= 1) || !(sup >= 1)) { toast('Los límites deben ser números enteros mayores a 0.'); return; }
    const { error } = await supabaseClient.from('parametros_app').upsert([
        { clave: 'wip_modelador', valor: mod },
        { clave: 'wip_supervisor', valor: sup }
    ], { onConflict: 'clave' });
    if (error) { toast('No se pudo guardar: ' + error.message + ' (¿ejecutaste sql/003_parametros_app.sql?)'); return; }
    await fetchParametros();
    toast('Límites WIP guardados.');
};

window.guardarMetaPPC = async () => {
    if (!state.isAdmin) { toast('Solo el administrador puede modificar la meta.'); return; }
    const meta = parseInt(document.getElementById('meta-ppc')?.value, 10);
    if (!(meta >= 1 && meta <= 100)) { toast('La meta debe ser un número entero entre 1 y 100.'); return; }
    const { error } = await supabaseClient.from('parametros_app').upsert([
        { clave: 'meta_ppc', valor: meta, descripcion: 'Meta de PPC semanal en % (Dashboard). Referencia Last Planner: 80%' }
    ], { onConflict: 'clave' });
    if (error) { toast('No se pudo guardar: ' + error.message + ' (¿ejecutaste sql/003_parametros_app.sql?)'); return; }
    await fetchParametros();
    toast('Meta de PPC guardada.');
};
