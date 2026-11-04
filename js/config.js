import { supabaseClient, state, fetchAll } from './db.js';
import { escapeHtml, toast } from './utils.js';

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
                <b>Formato esperado para importar:</b> La primera fila del Excel debe tener los encabezados: <i>Actividad, Grupo, Responsable, Criticidad, Estado, Fecha Fin, Fecha Cierre, Nota</i>. (El sistema los detectará automáticamente).
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
                                    <td class="py-2 text-right">
                                        <button onclick="window.openCargoModal('${p.id}')" class="text-sky-600 hover:text-sky-800"><i class="fa-solid fa-pen"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- MODALES (Grupos, Props, Cargos) -->
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
        'Criticidad': t.criticidad,
        'Estado': t.estado,
        'Fecha Fin': t.fecha_fin || '',
        'Fecha Cierre': t.fecha_cierre || '',
        'Nota': t.nota || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base de Datos");
    XLSX.writeFile(wb, `Control_BIM_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// --- LÓGICA DE IMPORTAR ---
window.handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // Leemos como JSON, asumiendo que la primera fila tiene los encabezados
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (json.length === 0) { toast('El archivo está vacío o no tiene datos.'); return; }
            
            if (!confirm(`Se encontraron ${json.length} filas. ¿Deseas importarlas a la base de datos?`)) return;

            // Función para convertir fechas de Excel (números) o strings a formato YYYY-MM-DD
            const parseDate = (val) => {
                if (!val) return null;
                if (typeof val === 'number') {
                    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                    return date.toISOString().split('T')[0];
                }
                const d = new Date(val);
                return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
            };

            // Preparar los inserts
            const inserts = json.map(row => {
                // Buscar ID del responsable si coincide con el email
                let respId = null;
                const respEmail = row['Responsable'] || row['responsable'] || '';
                if (respEmail) {
                    const perfil = state.perfilesCache.find(p => p.email.toLowerCase().trim() === String(respEmail).toLowerCase().trim());
                    if (perfil) respId = perfil.id;
                }

                return {
                    actividad: row['Actividad'] || row['actividad'] || 'Sin nombre',
                    grupo: row['Grupo'] || row['grupo'] || null,
                    responsable: respEmail || null,
                    responsable_id: respId,
                    criticidad: row['Criticidad'] || row['criticidad'] || 'Medio',
                    estado: row['Estado'] || row['estado'] || 'No iniciado',
                    fecha_fin: parseDate(row['Fecha Fin'] || row['fecha_fin']),
                    fecha_cierre: parseDate(row['Fecha Cierre'] || row['fecha_cierre']),
                    nota: row['Nota'] || row['nota'] || null,
                    estado_cde: 'WIP',
                    codigo_aptitud: 'S0',
                    user_id: state.currentUser.id
                };
            });

            // Insertar en lotes de 50 para no saturar
            for (let i = 0; i < inserts.length; i += 50) {
                const batch = inserts.slice(i, i + 50);
                const { error } = await supabaseClient.from('pendientes_bim').insert(batch);
                if (error) throw error;
            }

            await fetchAll();
            window.renderView();
            toast(`¡${inserts.length} actividades importadas con éxito!`);

        } catch (err) {
            console.error(err);
            toast('Error al importar: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Limpiar input
};

// --- RENDERIZADO DE MODALES (Igual que antes) ---
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
    if (!confirm('¿Eliminar este grupo?')) return;
    const { error } = await supabaseClient.from('grupos_bim').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView();
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
    if (!confirm('¿Eliminar este parámetro? Se borrarán los valores de todas las actividades.')) return;
    const { error } = await supabaseClient.from('propiedades_def').delete().eq('id', id);
    if (error) { toast('Error: ' + error.message); return; }
    await fetchAll(); window.renderView();
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

window.handleFileUpload = handleFileUpload;
window.exportToExcel = exportToExcel;
