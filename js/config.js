import { escapeHtml, toast, confirmDelete } from './utils.js';
import { supabaseClient, state, fetchAll } from './db.js';


export function renderConfig(container) {
    container.innerHTML = `
        <!-- SECCIÓN DE IMPORTAR / EXPORTAR -->
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

        <div class="grid lg:grid-cols-3 gap-3">
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
            </div>
        </div>

        <!-- MODALES -->
        ${renderModales()}
    `;
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
    XLSX.writeFile(wb, `Control_BIM_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
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
            
            if (!confirm(`Se encontraron ${json.length - 1} filas.\n\n¿Deseas REEMPLAZAR la base de datos actual?`)) return;

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

            // Función para formatear el correo a "Nombre Apellido"
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

            const inserts = [];
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0 || !row[colActividad]) continue;

                const actTexto = String(row[colActividad]).trim();
                if (!actTexto) continue;

                // BÚSQUEDA DEL RESPONSABLE
                let respId = null;
                let respEmailReal = null;
                const excelResp = colResp !== -1 ? String(row[colResp]).trim().toLowerCase() : '';
                
                if (excelResp) {
                    // Buscar en los perfiles comparando el nombre formateado con el nombre del Excel
                    const perfil = state.perfilesCache.find(p => {
                        const nombrePerfil = formatNombre(p.email).toLowerCase(); // "luis romero"
                        return nombrePerfil === excelResp || p.email.toLowerCase() === excelResp;
                    });
                    if (perfil) {
                        respId = perfil.id;
                        respEmailReal = perfil.email;
                    }
                }

                inserts.push({
                    actividad: actTexto,
                    grupo: colGrupo !== -1 && row[colGrupo] ? String(row[colGrupo]).trim() : null,
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

            const { error: delError } = await supabaseClient.from('pendientes_bim').delete().neq('id', 0);
            if (delError) throw new Error("Error al borrar: " + delError.message);

            for (let i = 0; i < inserts.length; i += 50) {
                const { error } = await supabaseClient.from('pendientes_bim').insert(inserts.slice(i, i + 50));
                if (error) throw error;
            }

            await fetchAll();
            window.renderView();
            toast(`¡Importadas ${inserts.length} actividades con éxito!`);

        } catch (err) {
            console.error(err);
            toast('Error al importar: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; 
};
// --- RENDERIZADO DE MODALES ---
function renderModales() {
    return `
        <div id="modal-grupo" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
                <h3 class="font-bold text-sm text-slate-800" id="grupo-modal-title">Nuevo grupo</h3>
                <form onsubmit="window.saveGrupo(event)" class="space-y-3 text-xs">
                    <input type="hidden" id="grupo-id">
                    <div><label class="block font-semibold text-slate-600 mb-1">Nombre *</label><input type="text" id="grupo-nombre" required class="inp"></div>
                    <div class="flex items-center gap-2"><input type="checkbox" id="grupo-activo" checked class="w-4 h-4"><label class="text-slate-600 font-semibold">Activo</label></div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="document.getElementById('modal-grupo').classList.add('hidden')" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                        <button type="submit" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
        <!-- MODAL PASSWORD -->
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
    `;
}

// --- FUNCIONES EXPORTADAS (Grupos, Props, Cargos) ---
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
    const payload = { nombre: document.getElementById('grupo-nombre').value.trim(), activo: document.getElementById('grupo-activo').checked };
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
    
    // Llamar a la función RPC que crearemos en Supabase
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
