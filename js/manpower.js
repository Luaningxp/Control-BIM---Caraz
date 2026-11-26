import { supabaseClient, state, fetchAll, tareaPorId } from './db.js';
import { 
    escapeHtml, fmtDate, semaforo, today, toast, nombreFormateado, 
    getIniciales, colorAvatar, confirmDelete, nombreResponsable, hoyLima, isoLocal,
    esAdminManpower, semanaCerrada, cerradaVisibleHoy, limiteVisibleCerrada,
    clasificarRegistroManpower, bloqueoRegistroExistente, esMotivoSoloAdmin,
    MSG_REG_SEMANA_CERRADA } from './utils.js';
import { esDiaLaborable, tipoDia } from './roster.js';

const HORAS_POR_100 = 9.3333;
function pctAHoras(pct) {
    return (parseFloat(pct || 0) * HORAS_POR_100) / 100;
}

let manpowerState = {
    search: '',
    filterResp: '',
    filterGrupo: '',
    iniDesde: '',
    iniHasta: '',
    soloRegistradosPorMi: true
};

/** ¿El usuario (por defecto, el actual) es responsable o recurso de la actividad? */
function isUserInvolved(t, uid = state.currentUser.id) {
    const esResponsable = t.responsable_id === uid;
    const esRecurso = state.actividadRecursosCache.some(
        r => r.pendiente_id === t.id && r.usuario_id === uid
    );
    return esResponsable || esRecurso;
}

// ============================================================
// MI TRABAJO
// ============================================================
export function renderMiTrabajo(container) {
    const hoyStr = hoyLima();
    const misTareas = state.tasksCache.filter(t => {
        if (t.estado_cde === 'Archived' || !isUserInvolved(t)) return false;
        // Cerrada: visible hasta cierre + 2 días calendario, sin pasar del domingo (hora de Lima)
        if (t.estado === 'Cerrado') return cerradaVisibleHoy(t, hoyStr);
        return true;
    });
    
    const hoy = today();
    hoy.setHours(0,0,0,0);

    // Último día laborable (según roster) anterior a hoy, buscando hasta 7 días atrás
    let ayerStr = null;
    const cursor = new Date(hoy);
    for (let i = 0; i < 7; i++) {
        cursor.setDate(cursor.getDate() - 1);
        const f = isoLocal(cursor); // YYYY-MM-DD en hora local
        if (esDiaLaborable(state.currentUser.id, f)) { ayerStr = f; break; }
    }

    const registrosAyer = ayerStr
        ? state.manpowerCache.filter(m => m.usuario_id === state.currentUser.id && m.fecha === ayerStr)
        : [];
    const porcentajeAyer = registrosAyer.reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    // Si "ayer" cae en una semana ya cerrada, solo un admin puede completarlo
    const noLlenoAyer = !!ayerStr && porcentajeAyer < 100
        && (!semanaCerrada(ayerStr, hoyStr) || esAdminManpower(state));

    container.innerHTML = `
        ${noLlenoAyer ? `
            <div class="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r-lg">
                <div class="flex items-start gap-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-600 text-lg mt-0.5"></i>
                    <div>
                        <p class="font-bold text-amber-900 text-sm">Aviso de registro pendiente</p>
                        <p class="text-amber-800 text-xs mt-0.5">No completaste tu <b>100%</b> el día <b>${fmtDate(ayerStr)}</b> (registraste ${porcentajeAyer.toFixed(1)}% = ${pctAHoras(porcentajeAyer).toFixed(2)} h). <a href="javascript:void(0)" onclick="window.openManpowerModal(null, '${ayerStr}')" class="underline font-semibold">Registrar ahora</a>.</p>
                    </div>
                </div>
            </div>
        ` : ''}

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div>
                <h3 class="font-bold text-sm text-slate-800">Mi Trabajo Pendiente</h3>
                <p class="text-[11px] text-slate-500">Registra tu % del día para cada actividad.</p>
            </div>
            <div class="flex gap-2">
                <button onclick="window.openInformeModal()" class="text-xs bg-sky-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-sky-700 transition flex items-center gap-2">
                    <i class="fa-solid fa-file-word"></i> Generar Informe Word
                </button>
                <button onclick="window.openManpowerModal()" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700"><i class="fa-solid fa-plus mr-1"></i> Registrar %</button>
            </div>
        </div>
        <div class="grid gap-3">
            ${misTareas.length === 0 ? '<div class="card p-6 text-center text-slate-500 text-sm">No tienes actividades pendientes.</div>' : ''}
            ${misTareas.map(t => {
                const equipo = state.actividadRecursosCache.filter(r => r.pendiente_id === t.id);
                const totalUsuarioTarea = state.manpowerCache
                    .filter(m => m.usuario_id === state.currentUser.id && m.pendiente_id === t.id)
                    .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);

                return `
                <div class="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${t.codigo_contenedor || '–'}</span>
                            <span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">${semaforo(t)}</span>
                            ${t.estado === 'Cerrado' ? `<span class="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold" title="Puedes registrar horas hasta fechas iguales o anteriores al cierre">Cerrada el ${fmtDate(t.fecha_cierre)} · registra hasta el ${fmtDate(limiteVisibleCerrada(t.fecha_cierre))}</span>` : ''}
                            ${totalUsuarioTarea > 0 ? `<span class="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold">Acumulado: ${totalUsuarioTarea.toFixed(1)}% · ${pctAHoras(totalUsuarioTarea).toFixed(2)} h</span>` : ''}
                        </div>
                        <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(t.actividad)}</h4>
                        <p class="text-xs text-slate-500 mt-1">${escapeHtml(t.grupo || '-')} · Vence: ${fmtDate(t.fecha_fin)}</p>
                        <div class="flex items-center gap-1 mt-2">
                            <span class="text-[10px] text-slate-400 mr-1">Equipo:</span>
                            ${equipo.map(r => {
                                const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                                if (!p) return '';
                                return `<div class="w-5 h-5 rounded-full ${colorAvatar(p.id)} text-white text-[8px] font-bold flex items-center justify-center ring-1 ring-white" title="${escapeHtml(nombreFormateado(p))}">${getIniciales(nombreFormateado(p)).toUpperCase()}</div>`;
                            }).join('') || '<span class="text-[10px] text-slate-300 italic">Sin recursos</span>'}
                        </div>
                    </div>
                    <div class="text-right flex md:flex-col gap-2">
                        <button onclick="window.openManpowerModal(${t.id})" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 whitespace-nowrap">＋ Registrar %</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================================
// GENERADOR DE INFORME WORD
// ============================================================
window.openInformeModal = function() {
    if (!document.getElementById('modal-informe')) {
        const modalHtml = `
            <div id="modal-informe" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
                <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
                    <div class="flex justify-between items-center border-b pb-2">
                        <h3 class="font-bold text-sm text-slate-800">Generar Informe de Actividades</h3>
                        <button onclick="document.getElementById('modal-informe').classList.add('hidden')" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="space-y-3 text-xs">
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Nombre completo (para el documento)</label>
                            <input type="text" id="inf-nombre" class="inp" value="${nombreFormateado(state.currentUser)}" placeholder="Ej. Ing. Carlos Tunuque">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">Fecha de Inicio</label>
                                <input type="date" id="inf-fecha-inicio" class="inp">
                            </div>
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">Fecha de Fin</label>
                                <input type="date" id="inf-fecha-fin" class="inp">
                            </div>
                        </div>
                        <p class="text-[10px] text-slate-500 mt-1">El sistema agrupará las actividades por semanas (de lunes a domingo) entre estas fechas.</p>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button onclick="document.getElementById('modal-informe').classList.add('hidden')" class="px-3 py-1.5 border rounded text-slate-600">Cancelar</button>
                        <button onclick="window.generarInformeWord()" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700">Generar Word</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('inf-fecha-inicio').value = hoyLima();
    document.getElementById('modal-informe').classList.remove('hidden');
    document.getElementById('modal-informe').classList.add('flex');
};

function nombreArchivoInforme(nombreCompleto, fechaFinStr) {
    const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SET','OCT','NOV','DIC'];
    const [anio, mes] = fechaFinStr.split('-');
    const periodo = `${MESES[parseInt(mes, 10) - 1]}${anio.slice(-2)}`;

    const limpio = nombreCompleto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')                 // sin tildes
        .replace(/\b(ing|arq|dr|dra|mg|msc|lic|sr|sra|bach)\b\.?/gi, ' ')  // sin títulos
        .replace(/[^A-Za-z\s]/g, ' ')
        .toUpperCase().trim();

    const PARTICULAS = new Set(['DE','DEL','LA','LAS','LOS','SAN','SANTA','VAN','VON','DA']);
    const tokens = [];
    let prefijo = '';
    limpio.split(/\s+/).filter(Boolean).forEach(p => {
        if (PARTICULAS.has(p)) { prefijo += p + '_'; return; }
        tokens.push(prefijo + p);
        prefijo = '';
    });

    const nApellidos = tokens.length >= 3 ? 2 : 1;
    const apellidos = tokens.slice(-nApellidos);
    const nombres   = tokens.slice(0, tokens.length - nApellidos);

    return `INFORME_${periodo}_${[...apellidos, ...nombres].join('_')}`;
}

window.generarInformeWord = async function() {
    const nombre = document.getElementById('inf-nombre').value.trim();
    const fechaInicioStr = document.getElementById('inf-fecha-inicio').value;
    const fechaFinStr = document.getElementById('inf-fecha-fin').value;
    
    if (!nombre || !fechaInicioStr || !fechaFinStr) {
        toast('Por favor, ingresa tu nombre y el rango de fechas.');
        return;
    }

    toast('Generando informe, por favor espera...');
    document.getElementById('modal-informe').classList.add('hidden');

    try {
        const formatDateStr = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const fechaInicioInput = new Date(fechaInicioStr + 'T12:00:00'); 
        const diaInput = fechaInicioInput.getDay();
        const diffLunes = diaInput === 0 ? -6 : 1 - diaInput; 
        
        let inicioSemana = new Date(fechaInicioInput);
        inicioSemana.setDate(fechaInicioInput.getDate() + diffLunes);
        inicioSemana.setHours(12, 0, 0, 0); 

        const fechaFinInput = new Date(fechaFinStr + 'T23:59:59'); 

        const semanasData = [];
        let contadorSemana = 1;
        const strPrimerLunes = formatDateStr(inicioSemana);

        while (inicioSemana <= fechaFinInput) {
            let finSemana = new Date(inicioSemana);
            finSemana.setDate(inicioSemana.getDate() + 6);
            finSemana.setHours(23, 59, 59, 999);
            if (finSemana > fechaFinInput) finSemana = new Date(fechaFinInput);

            const strIni = formatDateStr(inicioSemana);
            const strFin = formatDateStr(finSemana);

            const descanso = state.descansosCache.find(d => 
                d.usuario_id === state.currentUser.id && d.fecha_inicio <= strFin && d.fecha_fin >= strIni
            );

            const semanaObj = {
                esDescanso: !!descanso,
                textoDescanso: descanso ? `Semana de descanso desde ${fmtDate(descanso.fecha_inicio)} al ${fmtDate(descanso.fecha_fin)}` : '',
                tituloSemana: descanso ? '' : `Actividades semana ${fmtDate(strIni)} al ${fmtDate(strFin)}`,
                actividades: []
            };

            if (!descanso) {
                const registros = state.manpowerCache.filter(m => {
                    if (m.usuario_id !== state.currentUser.id || !m.fecha) return false;
                    return m.fecha >= strIni && m.fecha <= strFin;
                });

                const mapAct = {};
                registros.forEach(r => {
                    if (!r.pendiente_id) return;
                    const t = state.tasksCache.find(x => x.id === r.pendiente_id);
                    if (!t) return;
                    if (!mapAct[t.id]) mapAct[t.id] = { tarea: t, notas: [] };
                    if (r.descripcion && r.descripcion.trim()) mapAct[t.id].notas.push(r.descripcion.trim());
                });

                semanaObj.actividades = Object.values(mapAct).map((act, idx) => ({
                    numero: (idx + 1).toString(), // "1", "2", "3" por cada semana
                    nombre: act.tarea.actividad,
                    descripcion: act.notas.length > 0 ? act.notas[act.notas.length - 1] : '(Sin descripción registrada)',
                    estado: act.tarea.estado,
                    fechaEjecucion: `${fmtDate(strIni)} - ${fmtDate(strFin)}`
                }));
            }

            semanasData.push(semanaObj);
            inicioSemana.setDate(inicioSemana.getDate() + 7);
            contadorSemana++;
        }

        const response = await fetch('assets/templates/FORMATO.docx');
        if (!response.ok) throw new Error("No se encontró el archivo FORMATO.docx");
        
        const arrayBuffer = await response.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        
        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true
        });

        // 1. Calcular el periodo
        const mesString = fechaFinInput.toLocaleString('es-ES', { month: 'long' });
        const anioString = fechaFinInput.getFullYear();
        const periodoTexto = `${mesString} - ${anioString}`;

        // 2. Renderizar SOLO UNA VEZ con TODAS las variables
        doc.render({
            NOMBRE: nombre,
            CARGO: state.currentCargo || 'Modelador BIM',
            MES: fechaFinInput.toLocaleString('es-ES', { month: 'long' }).toUpperCase(),
            SEMANAS: `${fmtDate(strPrimerLunes)} – ${fmtDate(formatDateStr(fechaFinInput))}`,
            PERIODO: periodoTexto, 
            semanas: semanasData 
        });

        const out = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        const url = window.URL.createObjectURL(out);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${nombreArchivoInforme(nombre, fechaFinStr)}.docx`;
        link.click();
        window.URL.revokeObjectURL(url);
        toast('Informe generado.');

    } catch (error) {
        console.error(error);
        alert('Hubo un error al generar el Word. Revisa la consola.');
    }
};

// ============================================================
// MANPOWER (listado con filtros + conversión a horas)
// ============================================================
function puedeGestionarManpower(r) {
    return !!r && (state.isAdmin || state.isCoordinador || r.usuario_id === state.currentUser?.id);
}

function tareaDe(pendienteId) {
    if (!pendienteId) return null;
    return tareaPorId(pendienteId);
}

/** Motivo de bloqueo de un registro existente (null si está libre). */
function bloqueoDe(r) {
    return bloqueoRegistroExistente({ fecha: r.fecha, tarea: tareaDe(r.pendiente_id) });
}

/**
 * Motivo por el que el usuario actual no puede tocar el registro (null si puede).
 * Semana cerrada: cualquiera corrige justificando. Actividad eliminada o archivada: solo admin.
 */
function registroBloqueadoPara(r) {
    if (esAdminManpower(state)) return null;
    const motivo = bloqueoDe(r);
    return esMotivoSoloAdmin(motivo) ? motivo : null;
}

/**
 * Pide una justificación obligatoria (correcciones de admin fuera del corte).
 * Devuelve el texto o null si se cancela.
 */
function pedirJustificacion(mensaje) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4';
        overlay.style.zIndex = '80';
        overlay.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3 text-xs">
                <h3 class="font-bold text-sm text-slate-800"><i class="fa-solid fa-scale-balanced text-amber-600 mr-1"></i> Justificación requerida</h3>
                <p class="text-slate-600">${escapeHtml(mensaje)}</p>
                <textarea id="jm-texto" rows="3" class="inp" placeholder="Motivo de la corrección"></textarea>
                <p id="jm-error" class="text-red-600 hidden">Escribe la justificación.</p>
                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button type="button" id="jm-cancelar" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                    <button type="button" id="jm-ok" class="px-4 py-1.5 bg-amber-600 text-white font-semibold rounded hover:bg-amber-700">Continuar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const cerrar = (v) => { overlay.remove(); resolve(v); };
        overlay.querySelector('#jm-cancelar').onclick = () => cerrar(null);
        overlay.querySelector('#jm-ok').onclick = () => {
            const v = overlay.querySelector('#jm-texto').value.trim();
            if (!v) { overlay.querySelector('#jm-error').classList.remove('hidden'); return; }
            cerrar(v);
        };
        setTimeout(() => overlay.querySelector('#jm-texto').focus(), 50);
    });
}

function ctxManpower() {
    const editId = document.getElementById('mp-id')?.value || '';
    const rec = editId ? state.manpowerCache.find(m => String(m.id) === String(editId)) : null;
    return { editId, uid: rec ? rec.usuario_id : state.currentUser.id };
}

export function renderManpower(container) {
    let registros = state.manpowerCache.filter(m => 
        state.isAdmin || state.isCoordinador || state.isSupervisor || m.usuario_id === state.currentUser.id
    );
    if (manpowerState.soloRegistradosPorMi) {
        registros = registros.filter(m => m.usuario_id === state.currentUser?.id);
    }

    registros = registros.filter(r => {
        const t = tareaPorId(r.pendiente_id);
        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
        const nombre = p ? nombreFormateado(p) : 'Desconocido';
        const grupo = t ? (t.grupo || '') : '';
        const actividad = t ? t.actividad : 'General';

        const q = (manpowerState.search || '').toLowerCase().trim();
        const matchSearch = !q || nombre.toLowerCase().includes(q) || actividad.toLowerCase().includes(q);
        const matchResp = !manpowerState.filterResp || r.usuario_id === manpowerState.filterResp;
        const matchGrupo = !manpowerState.filterGrupo || grupo === manpowerState.filterGrupo;
        const matchIni = !manpowerState.iniDesde || (r.fecha && r.fecha >= manpowerState.iniDesde);
        const matchFin = !manpowerState.iniHasta || (r.fecha && r.fecha <= manpowerState.iniHasta);

        return matchSearch && matchResp && matchGrupo && matchIni && matchFin;
    });

    const gruposOpts = [...new Set(state.tasksCache.map(t => t.grupo).filter(Boolean))].sort();
    const respOpts = state.perfilesCache.map(p => ({ id: p.id, name: nombreFormateado(p) }));

    const filtrosActivos = Object.entries(manpowerState).filter(([k, v]) => {
        if (k === 'soloRegistradosPorMi') return v === true;
        if (k === 'search') return false;
        return v !== '' && v !== false && v !== null;
    }).length;
    const totalHoras = registros.reduce((s, r) => s + pctAHoras(r.porcentaje_dia), 0);

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
            <div class="flex flex-1 items-center gap-2 w-full">
                <div class="relative w-full max-w-xs">
                        <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs"></i>
                                       <input type="text" id="mp-search" placeholder="Buscar usuario o actividad..." value="${manpowerState.search}" 
                           class="w-full border border-slate-300 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50 transition">
                </div>
                <button onclick="window.toggleManpowerFilterDrawer()" class="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <i class="fa-solid fa-filter"></i> Filtros
                    ${filtrosActivos > 0 ? `<span class="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">${filtrosActivos}</span>` : ''}
                </button>
                <button onclick="window.toggleManpowerSoloMios()" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${manpowerState.soloRegistradosPorMi ? 'bg-sky-600 text-white' : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}">
                    <i class="fa-solid fa-user-check"></i> Registrados por mí
                </button>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right hidden md:block">
                    <p class="text-[10px] text-slate-500 uppercase font-bold">Total Horas</p>
                    <p class="text-lg font-bold text-sky-700">${totalHoras.toFixed(2)} h</p>
                </div>
                <button onclick="window.openManpowerModal()" class="text-xs bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-700">+ Registrar %</button>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 text-slate-600 uppercase font-semibold">
                    <tr>
                        <th class="p-3">Fecha</th>
                        <th class="p-3">Usuario</th>
                        <th class="p-3">Actividad</th>
                        <th class="p-3">% Día</th>
                        <th class="p-3">Horas</th>
                        <th class="p-3">Nota</th>
                        <th class="p-3 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${registros.map(r => {
                        const t = tareaPorId(r.pendiente_id);
                        const p = state.perfilesCache.find(x => x.id === r.usuario_id);
                        const nombre = p ? nombreFormateado(p) : 'Desconocido';
                        const pct = parseFloat(r.porcentaje_dia || 0);
                        const horas = pctAHoras(pct);
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-3 text-slate-600">${fmtDate(r.fecha)}</td>
                            <td class="p-3 font-semibold text-slate-700">${escapeHtml(nombre)}</td>
                            <td class="p-3 text-slate-700">${escapeHtml(t ? t.actividad : 'General')}${t && t.archivada_en ? ' <span class="text-[10px] text-slate-400 italic">(eliminada)</span>' : ''}</td>
                            <td class="p-3 text-slate-500">${pct.toFixed(1)}%</td>
                            <td class="p-3 font-bold text-sky-600">${horas.toFixed(2)} h</td>
                            <td class="p-3 text-slate-500 italic">${escapeHtml(r.descripcion || '')}</td>
                            <td class="p-3 text-center whitespace-nowrap">
                                ${puedeGestionarManpower(r) && !registroBloqueadoPara(r) ? `
                                    <button onclick="window.editManpower(${r.id})" class="text-sky-600 hover:text-sky-800 mr-2" title="Editar registro">
                                        <i class="fa-solid fa-pen"></i>
                                    </button>
                                    <button onclick="window.deleteManpower(${r.id})" class="text-red-500 hover:text-red-700" title="Eliminar registro">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                ` : (puedeGestionarManpower(r) ? `<i class="fa-solid fa-lock text-slate-400" title="${escapeHtml(registroBloqueadoPara(r))} Pide la corrección a un administrador."></i>` : '')}
                            </td>
                        </tr>`;
                    }).join('') || `<tr><td colspan="7" class="text-center py-6 text-slate-400">No hay registros con los filtros actuales.</td></tr>`}
                </tbody>
                ${registros.length > 0 ? `
                    <tfoot class="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                            <td colspan="4" class="p-3 text-right font-bold text-slate-700 uppercase text-[10px] tracking-wider">Total del periodo filtrado:</td>
                            <td class="p-3 font-bold text-sky-700 text-sm">${totalHoras.toFixed(2)} h</td>
                            <td colspan="2" class="p-3"></td>
                        </tr>
                    </tfoot>
                ` : ''}
            </table>
        </div>
    `;

    if (!document.getElementById('manpower-filter-drawer')) {
        const drawerHtml = `
            <div id="manpower-filter-drawer-overlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden z-40" onclick="window.toggleManpowerFilterDrawer()"></div>
            <div id="manpower-filter-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl transform translate-x-full transition-transform duration-300 ease-in-out z-50 overflow-y-auto">
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 class="font-bold text-sm text-slate-800">Filtros MANPOWER</h3>
                    <button onclick="window.toggleManpowerFilterDrawer()" class="text-slate-400 hover:text-slate-700">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="p-4 space-y-4 text-xs">
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Usuario</label>
                        <select id="mp-drawer-resp" class="inp" onchange="window.applyManpowerFilter('filterResp', this.value)">
                            <option value="">Todos</option>
                            ${respOpts.map(r => `<option value="${r.id}" ${manpowerState.filterResp === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-semibold text-slate-600 mb-1">Grupo</label>
                        <select id="mp-drawer-grupo" class="inp" onchange="window.applyManpowerFilter('filterGrupo', this.value)">
                            <option value="">Todos</option>
                            ${gruposOpts.map(g => `<option value="${escapeHtml(g)}" ${manpowerState.filterGrupo === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                        </select>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <h4 class="font-bold text-slate-700 mb-2">Rango de fechas</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Desde</label>
                                <input type="date" id="mp-drawer-ini" class="inp" value="${manpowerState.iniDesde || ''}" onchange="window.applyManpowerFilter('iniDesde', this.value)">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-1">Hasta</label>
                                <input type="date" id="mp-drawer-fin" class="inp" value="${manpowerState.iniHasta || ''}" onchange="window.applyManpowerFilter('iniHasta', this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-slate-200 pt-4">
                        <button onclick="window.clearManpowerFilters()" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                            <i class="fa-solid fa-eraser mr-1"></i> Limpiar filtros
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    const mpSearch = document.getElementById('mp-search');
    if (mpSearch) {
        mpSearch.addEventListener('input', (e) => {
            manpowerState.search = e.target.value;
            clearTimeout(window.mpSearchTimeout);
            window.mpSearchTimeout = setTimeout(() => {
                window.renderView();
                const newInput = document.getElementById('mp-search');
                if (newInput) {
                    newInput.focus();
                    const val = newInput.value;
                    newInput.value = '';
                    newInput.value = val;
                }
            }, 500);
        });
    }
}

// ============================================================
// FORMULARIO DE REGISTRO: primero la fecha, luego las actividades
// agrupadas (sin justificación / con justificación). Las que no
// se pueden registrar en esa fecha no se muestran.
// ============================================================
// Contexto del formulario abierto
let ctxModalManpower = null;

/** ¿El registro que se edita conserva su actividad? (el plazo de la cerrada no aplica) */
function esMismaActividad(rEdit, tareaId) {
    return !!rEdit && String(rEdit.pendiente_id || '') === String(tareaId || '');
}

/** Mensaje si el día no admite registros (no laborable o 100% ya usado); null si se puede. */
function bloqueoDelDia(uid, fecha, editId) {
    if (!fecha) return 'Elige la fecha que vas a registrar.';
    if (fecha > hoyLima()) return 'No puedes registrar horas en una fecha futura.';
    if (!esDiaLaborable(uid, fecha)) {
        const etiquetas = { DO: 'domingo no laborable', DE: 'descanso', FE: 'feriado' };
        const tipo = tipoDia(uid, fecha);
        return `Ese día no es laborable según el Roster (${etiquetas[tipo] || tipo}). Elige otra fecha.`;
    }
    const usado = state.manpowerCache
        .filter(m => m.usuario_id === uid && m.fecha === fecha && String(m.id) !== String(editId))
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);
    if (usado >= 100) return 'Ya registraste el 100% de ese día. Elige otra fecha.';
    return null;
}

/** Texto de búsqueda / nombre completo de una actividad. */
const nombreCompleto = t => t ? `${t.codigo_contenedor ? t.codigo_contenedor + ' · ' : ''}${t.actividad || ''}` : 'General';

/** Arma las actividades registrables en la fecha elegida (grupos sin / con justificación) y las pinta. */
function pintarListaActividades(valorPreferido) {
    const input = document.getElementById('mp-actividad');
    const C = ctxModalManpower;
    if (!input || !C) return;
    const fecha = document.getElementById('mp-fecha')?.value || '';
    const hoy = hoyLima();
    const aviso = document.getElementById('mp-actividad-aviso');
    const bloqueoDia = bloqueoDelDia(C.uid, fecha, C.rEdit?.id);
    const btnGuardar = document.getElementById('btn-save-manpower');
    const pasos = document.getElementById('mp-paso-2');

    if (bloqueoDia) {
        C.items = [];
        input.value = '';
        C.bloqueado = true;
        pasos?.classList.add('opacity-50', 'pointer-events-none');
        if (btnGuardar) btnGuardar.disabled = true;
        if (aviso) { aviso.textContent = bloqueoDia; aviso.classList.remove('hidden'); }
        renderItemsActividades();
        return;
    }
    C.bloqueado = false;
    pasos?.classList.remove('opacity-50', 'pointer-events-none');
    if (btnGuardar) btnGuardar.disabled = false;

    const clasificar = t => clasificarRegistroManpower({ fecha, tarea: t, hoy, omitirPlazo: esMismaActividad(C.rEdit, t?.id) });
    const libres = [];
    const conJustif = [];
    const general = clasificar(null);
    (general.justificar ? conJustif : libres).push({ id: '', t: null });
    const tareas = [];
    C.propias.forEach(t => {
        const c = clasificar(t);
        if (c.bloqueo) return; // no se puede registrar en esta fecha: no se muestra
        tareas.push({ id: String(t.id), t, justificar: !!c.justificar });
    });
    tareas.sort((a, b) => String(a.t.codigo_contenedor || '').localeCompare(String(b.t.codigo_contenedor || '')));
    tareas.forEach(x => (x.justificar ? conJustif : libres).push(x));

    // Al editar, la actividad del registro siempre se ve, aunque en esta fecha no se pueda usar
    const ids = new Set(tareas.map(x => x.id));
    const tEdit = C.rEdit && C.rEdit.pendiente_id ? tareaPorId(C.rEdit.pendiente_id) : null;
    const extra = tEdit && !ids.has(String(tEdit.id)) ? [{ id: String(tEdit.id), t: tEdit }] : [];

    C.grupos = [
        { clave: 'ok', titulo: '🟢 Se registran sin justificación', items: libres },
        { clave: 'warn', titulo: '🟡 Requieren justificación', items: conJustif },
        { clave: 'bad', titulo: 'Actividad del registro (no admite esta fecha)', items: extra }
    ];

    const disponibles = new Set(C.grupos.flatMap(g => g.items.map(x => x.id)));
    const deseado = String(valorPreferido ?? '');
    if (disponibles.has(deseado)) {
        input.value = deseado;
        if (aviso) aviso.classList.add('hidden');
    } else {
        input.value = '';
        const t = tareaPorId(deseado);
        if (aviso) {
            aviso.textContent = `"${t ? (t.actividad || '').substring(0, 60) : 'La actividad'}" no admite registros el ${fmtDate(fecha)}. Elige otra fecha u otra actividad.`;
            aviso.classList.remove('hidden');
        }
    }
    renderItemsActividades();
}

/** Pinta la lista (filtrada por el buscador) y el recuadro de la actividad elegida. */
function renderItemsActividades() {
    const C = ctxModalManpower;
    const cont = document.getElementById('mp-lista');
    const elegida = document.getElementById('mp-elegida');
    if (!C || !cont) return;
    ocultarTipActividad();
    const valor = document.getElementById('mp-actividad')?.value ?? '';

    if (C.bloqueado) {
        cont.innerHTML = '<p class="mp-lista-vacia">Elige una fecha que admita registros.</p>';
        if (elegida) elegida.classList.add('hidden');
        return;
    }

    const q = (document.getElementById('mp-buscar')?.value || '').toLowerCase().trim();
    const coincide = x => !q || nombreCompleto(x.t).toLowerCase().includes(q);
    const html = C.grupos.filter(g => g.items.length).map(g => {
        const visibles = g.items.filter(coincide);
        if (!visibles.length) return '';
        return `<div class="mp-grupo mp-grupo-${g.clave}"><span>${escapeHtml(g.titulo)}</span><span>${g.items.length}</span></div>` +
            visibles.map(x => `
                <button type="button" class="mp-item mp-item-${g.clave}${x.id === String(valor) ? ' mp-item-sel' : ''}" data-id="${escapeHtml(x.id)}">
                    ${x.t ? `<span class="mp-item-cod">${escapeHtml(x.t.codigo_contenedor || '')}</span><span class="mp-item-nom">${escapeHtml(x.t.actividad || '')}</span>`
                          : '<span class="mp-item-cod">—</span><span class="mp-item-nom">General</span>'}
                </button>`).join('');
    }).join('');
    cont.innerHTML = html || '<p class="mp-lista-vacia">Ninguna actividad coincide con la búsqueda.</p>';

    if (elegida) {
        const t = valor ? tareaPorId(valor) : null;
        elegida.innerHTML = `<b>Actividad elegida</b>${escapeHtml(nombreCompleto(t))}`;
        elegida.classList.remove('hidden');
    }
}

// Recuadro flotante con el nombre completo al pasar el mouse
function ocultarTipActividad() {
    document.getElementById('mp-tip')?.remove();
}
function mostrarTipActividad(btn) {
    ocultarTipActividad();
    const id = btn.dataset.id;
    const t = id ? tareaPorId(id) : null;
    if (!t) return;
    const r = btn.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.id = 'mp-tip';
    tip.className = 'mp-tip';
    const fechas = [t.fecha_inicio_programado && `Inicio ${fmtDate(t.fecha_inicio_programado)}`,
        t.fecha_fin && `Fin ${fmtDate(t.fecha_fin)}`, t.estado].filter(Boolean).join(' · ');
    tip.innerHTML = `${escapeHtml(nombreCompleto(t))}${fechas ? `<span>${escapeHtml(fechas)}</span>` : ''}`;
    document.body.appendChild(tip);
    const ancho = Math.min(340, window.innerWidth - 16);
    tip.style.width = ancho + 'px';
    tip.style.left = Math.max(8, Math.min(r.left + 40, window.innerWidth - ancho - 8)) + 'px';
    const alto = tip.offsetHeight;
    tip.style.top = (r.bottom + 4 + alto > window.innerHeight ? r.top - alto - 4 : r.bottom + 4) + 'px';
}

function conectarListaActividades() {
    const cont = document.getElementById('mp-lista');
    if (!cont || cont.dataset.conectada) return;
    cont.dataset.conectada = '1';
    cont.addEventListener('click', (e) => {
        const btn = e.target.closest('.mp-item');
        if (!btn) return;
        window.cambiarActividadManpower(btn.dataset.id);
    });
    cont.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.mp-item');
        if (btn) mostrarTipActividad(btn);
    });
    cont.addEventListener('mouseleave', ocultarTipActividad);
    cont.addEventListener('scroll', ocultarTipActividad);
}

/** Al cambiar la fecha: recalcula el % disponible y la lista, conservando la actividad si sigue disponible. */
window.cambiarFechaManpower = function() {
    pintarListaActividades(ctxModalManpower?.preferida ?? '');
    window.actualizarRestanteManpower();
    window.actualizarJustificacionManpower();
};

window.cambiarActividadManpower = function(id) {
    const input = document.getElementById('mp-actividad');
    if (input) input.value = id ?? '';
    if (ctxModalManpower) ctxModalManpower.preferida = input?.value ?? '';
    document.getElementById('mp-actividad-aviso')?.classList.add('hidden');
    renderItemsActividades();
    window.actualizarJustificacionManpower();
};

window.buscarActividadManpower = function() {
    renderItemsActividades();
};

export function openManpowerModal(pendienteId, fechaPredefinida, editId) {
    if (!document.getElementById('modal-manpower')) {
        const modalHtml = `
            <div id="modal-manpower" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4 z-40">
                <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[95vh] overflow-y-auto">
                    <h3 id="mp-titulo" class="font-bold text-sm text-slate-800">Registrar % del Día</h3>
                    <form onsubmit="window.saveManpower(event)" class="space-y-3 text-xs">
                        <input type="hidden" id="mp-id" value="">
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">1. Fecha a registrar</label>
                            <input type="date" id="mp-fecha" required class="inp" onchange="window.cambiarFechaManpower()">
                            <p id="mp-restante-info" class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded mt-1"></p>
                        </div>
                        <div id="mp-paso-2" class="space-y-3">
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">2. Actividad</label>
                                <input type="hidden" id="mp-actividad" value="">
                                <input type="search" id="mp-buscar" class="inp" placeholder="Buscar por código o nombre..." oninput="window.buscarActividadManpower()" onkeydown="if (event.key === 'Enter') event.preventDefault()" autocomplete="off">
                                <div id="mp-lista" class="mp-lista"></div>
                                <div id="mp-elegida" class="mp-elegida hidden"></div>
                                <p class="text-[10px] text-slate-500 mt-1">Solo aparecen las actividades que admiten registro en esa fecha.</p>
                            </div>
                            <div>
                                <label class="block font-semibold text-slate-600 mb-1">3. % del Día</label>
                                <input type="number" step="1" min="1" max="100" id="mp-porcentaje" required class="inp" placeholder="Ej. 25" oninput="window.actualizarHorasManpower()">
                                <p id="mp-horas-equivalentes" class="text-[10px] text-slate-500 mt-1">= 0.00 h</p>
                            </div>
                        </div>
                        <p id="mp-actividad-aviso" class="hidden text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2"></p>
                        <div id="mp-justif-box" class="hidden bg-amber-50 border border-amber-200 rounded p-2">
                            <label class="block font-semibold text-amber-800 mb-1"><i class="fa-solid fa-scale-balanced mr-1"></i> Justificación (obligatoria)</label>
                            <p id="mp-justif-motivo" class="text-[10px] text-amber-700 mb-1"></p>
                            <textarea id="mp-justif" rows="2" class="inp" placeholder="¿Por qué no registraste a tiempo?"></textarea>
                        </div>
                        <div>
                            <label class="block font-semibold text-slate-600 mb-1">Nota (opcional)</label>
                            <textarea id="mp-desc" rows="2" class="inp" placeholder="¿Qué hiciste?"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onclick="window.closeManpowerModal()" class="px-3 py-1.5 border border-slate-300 rounded text-slate-600">Cancelar</button>
                            <button type="submit" id="btn-save-manpower" class="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const hoy = hoyLima();
    const rEdit = editId ? state.manpowerCache.find(m => String(m.id) === String(editId)) : null;
    // La lista muestra las actividades del DUEÑO del registro (responsable o recurso),
    // también para los admins. Si un admin corrige el registro de otra persona, salen las de esa persona.
    const uid = rEdit ? rEdit.usuario_id : state.currentUser.id;
    const propias = state.tasksCache.filter(t => t.estado_cde !== 'Archived' && isUserInvolved(t, uid));
    const preferida = rEdit ? (rEdit.pendiente_id || '') : (pendienteId || '');
    ctxModalManpower = { rEdit, uid, propias, preferida };

    document.getElementById('mp-id').value = rEdit ? rEdit.id : '';
    document.getElementById('mp-titulo').textContent = rEdit ? 'Editar registro' : 'Registrar % del Día';
    const inputFecha = document.getElementById('mp-fecha');
    inputFecha.value = rEdit ? rEdit.fecha : (fechaPredefinida || hoy);
    // Nunca fechas futuras. Hacia atrás no hay límite: fuera de la semana en curso se justifica.
    inputFecha.max = hoy;
    inputFecha.min = '';
    document.getElementById('mp-porcentaje').value = rEdit ? parseFloat(rEdit.porcentaje_dia || 0) : '';
    document.getElementById('mp-desc').value = rEdit ? (rEdit.descripcion || '') : '';
    document.getElementById('mp-justif').value = '';

    const buscar = document.getElementById('mp-buscar');
    if (buscar) buscar.value = '';
    conectarListaActividades();
    pintarListaActividades(preferida);
    window.actualizarRestanteManpower();
    window.actualizarJustificacionManpower();
    window.actualizarHorasManpower();

    document.getElementById('modal-manpower').classList.remove('hidden');
    document.getElementById('modal-manpower').classList.add('flex');
}

window.actualizarRestanteManpower = function() {
    const fecha = document.getElementById('mp-fecha').value;
    const info = document.getElementById('mp-restante-info');
    if (!fecha) { info.textContent = 'Elige la fecha que vas a registrar.'; return; }

    const { editId, uid } = ctxManpower();
    const totalDia = state.manpowerCache
        .filter(m => m.usuario_id === uid && m.fecha === fecha && String(m.id) !== String(editId))
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);

    const restante = Math.max(0, 100 - totalDia);
    const semana = semanaCerrada(fecha) ? ' <span class="text-amber-700 font-semibold">Semana cerrada: todo registro pide justificación.</span>' : '';
    if (restante === 0) {
        info.innerHTML = `<b class="text-red-600">Ya registraste el 100% de este día.</b> No puedes agregar más.`;
    } else {
        info.innerHTML = `Tienes <b class="text-sky-700">${restante.toFixed(0)}%</b> disponible (${pctAHoras(restante).toFixed(2)} h) — ya usaste ${totalDia.toFixed(0)}% (${pctAHoras(totalDia).toFixed(2)} h).${semana}`;
    }
};

/**
 * Evalúa el formulario abierto. Devuelve { error, justificar }:
 * - error: motivo por el que no se puede guardar.
 * - justificar: motivo por el que hay que justificar (cualquier usuario: semana cerrada o
 *   plazo vencido de una cerrada; solo admin: registros de actividades eliminadas o archivadas).
 */
function evaluarFormularioManpower() {
    const fecha = document.getElementById('mp-fecha')?.value;
    const tarea = tareaDe(document.getElementById('mp-actividad')?.value);
    const { editId, uid } = ctxManpower();
    const rEdit = editId ? state.manpowerCache.find(m => String(m.id) === String(editId)) : null;
    const hoy = hoyLima();

    const dia = bloqueoDelDia(uid, fecha, editId);
    if (dia) return { error: dia, justificar: null };
    const nuevo = clasificarRegistroManpower({ fecha, tarea, hoy, omitirPlazo: esMismaActividad(rEdit, tarea?.id) });
    if (nuevo.bloqueo) return { error: nuevo.bloqueo, justificar: null };
    const existente = rEdit ? bloqueoDe(rEdit) : null;
    if (existente && esMotivoSoloAdmin(existente) && !esAdminManpower(state)) {
        return { error: existente + ' Pide la corrección a un administrador.', justificar: null };
    }
    return { error: null, justificar: existente || nuevo.justificar || null };
}

window.actualizarJustificacionManpower = function() {
    const box = document.getElementById('mp-justif-box');
    if (!box) return;
    const { justificar } = evaluarFormularioManpower();
    box.classList.toggle('hidden', !justificar);
    document.getElementById('mp-justif-motivo').textContent = justificar || '';
    const txt = document.getElementById('mp-justif');
    if (txt) txt.placeholder = esMotivoSoloAdmin(justificar)
        ? '¿Por qué se corrige fuera de regla?'
        : (justificar === MSG_REG_SEMANA_CERRADA ? '¿Por qué se corrige fuera de plazo?' : '¿Por qué no registraste a tiempo?');
};

window.actualizarHorasManpower = function() {
    const pct = parseFloat(document.getElementById('mp-porcentaje')?.value || 0);
    const horas = pctAHoras(pct);
    const el = document.getElementById('mp-horas-equivalentes');
    if (el) el.textContent = `= ${horas.toFixed(2)} h`;
};

export function closeManpowerModal() {
    ocultarTipActividad();
    document.getElementById('modal-manpower').classList.add('hidden');
    document.getElementById('modal-manpower').classList.remove('flex');
}

let guardandoManpower = false;

export async function saveManpower(e) {
    e.preventDefault();
    if (guardandoManpower) return; // Evita doble ejecución

    const btn = document.getElementById('btn-save-manpower');
    const fecha = document.getElementById('mp-fecha').value;
    const porcentaje = parseFloat(document.getElementById('mp-porcentaje').value);

    const { editId, uid } = ctxManpower();

    // Reglas de corte semanal y actividades cerradas (también se validan en Supabase)
    const evaluacion = evaluarFormularioManpower();
    if (evaluacion.error) { toast(evaluacion.error); return; }
    const justificacion = (document.getElementById('mp-justif')?.value || '').trim();
    if (evaluacion.justificar && !justificacion) {
        toast('Escribe la justificación.');
        document.getElementById('mp-justif')?.focus();
        return;
    }

    if (!esDiaLaborable(uid, fecha)) {
        const tipo = tipoDia(uid, fecha);
        const etiquetas = { DO: 'domingo no laborable', DE: 'descanso', FE: 'feriado' };
        toast(`No puedes registrar en un día no laborable (${etiquetas[tipo] || tipo}).`);
        return;
    }

    const totalDia = state.manpowerCache
        .filter(m => m.usuario_id === uid && m.fecha === fecha && String(m.id) !== String(editId))
        .reduce((s, r) => s + parseFloat(r.porcentaje_dia || 0), 0);

    if (totalDia + porcentaje > 100) {
        toast(`No puedes exceder 100%. Ya tienes ${totalDia.toFixed(0)}% (${pctAHoras(totalDia).toFixed(2)} h) registrado.`);
        return;
    }

    const payload = {
        pendiente_id: document.getElementById('mp-actividad').value || null,
        usuario_id: state.currentUser.id,
        fecha: fecha,
        porcentaje_dia: porcentaje,
        descripcion: document.getElementById('mp-desc').value
    };
    // Solo se envía cuando corresponde: Supabase la guarda en la auditoría y limpia el campo
    if (evaluacion.justificar) payload.justificacion_correccion = justificacion;

    // Bloquear botón mientras se guarda
    guardandoManpower = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';
    }

    try {
        if (editId) {
            const { usuario_id, ...cambios } = payload; // al editar no se cambia el dueño
            const { data, error } = await supabaseClient.from('manpower_registros').update(cambios).eq('id', editId).select('id');
            if (error) { toast('Error: ' + error.message); return; }
            if (!data || data.length === 0) { toast('No se pudo editar: la base de datos no te lo permite (falta política UPDATE).'); return; }
        } else {
            const { error } = await supabaseClient.from('manpower_registros').insert([payload]);
            if (error) { toast('Error: ' + error.message); return; }
        }

        closeManpowerModal();
        await fetchAll();
        window.renderView();
        toast(`${editId ? 'Registro actualizado' : 'Registro guardado'}: ${porcentaje}% = ${pctAHoras(porcentaje).toFixed(2)} h`);
    } catch (err) {
        toast('Error inesperado: ' + err.message);
    } finally {
        // Siempre se libera, haya éxito o error
        guardandoManpower = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Guardar';
        }
    }
}

window.editManpower = function(id) {
    const r = state.manpowerCache.find(x => x.id === id);
    if (!puedeGestionarManpower(r)) { toast('Solo puedes editar tus propios registros.'); return; }
    const bloqueo = registroBloqueadoPara(r);
    if (bloqueo) { toast(bloqueo + ' Pide la corrección a un administrador.'); return; }
    openManpowerModal(r.pendiente_id, r.fecha, id);
};

window.deleteManpower = async function(id) {
    const r = state.manpowerCache.find(x => x.id === id);
    if (!r) return;
    if (!puedeGestionarManpower(r)) { toast('Solo puedes eliminar tus propios registros.'); return; }
    const bloqueoEl = registroBloqueadoPara(r);
    if (bloqueoEl) { toast(bloqueoEl + ' Pide la corrección a un administrador.'); return; }
    
    const p = state.perfilesCache.find(x => x.id === r.usuario_id);
    const t = tareaPorId(r.pendiente_id);
    const nombreUsuario = p ? nombreFormateado(p) : 'Desconocido';
    const nombreActividad = t ? t.actividad : 'General';
    const pct = parseFloat(r.porcentaje_dia || 0);
    const horas = pctAHoras(pct);
    
    const confirmado = await confirmDelete({
        title: 'Eliminar registro',
        message: `Vas a eliminar el registro de "${nombreUsuario}" del ${fmtDate(r.fecha)} (${pct.toFixed(1)}% = ${horas.toFixed(2)} h en "${nombreActividad}"). Esta acción no se puede deshacer.`
    });
    
    if (!confirmado) return;

    // Eliminar fuera de regla (semana cerrada, o admin en actividad eliminada): justificación obligatoria y borrado auditado
    const motivoBloqueo = bloqueoDe(r);
    if (motivoBloqueo) {
        const justificacion = await pedirJustificacion(motivoBloqueo + ' Indica por qué se elimina.');
        if (!justificacion) return;
        const { data: ok, error: rpcError } = await supabaseClient.rpc('eliminar_manpower_justificado', {
            p_id: id, p_justificacion: justificacion
        });
        if (rpcError) { toast('Error: ' + rpcError.message); return; }
        if (!ok) { toast('No se eliminó: la base de datos no te permite borrar este registro.'); return; }
        toast('Registro eliminado (corrección auditada)');
        await fetchAll();
        window.renderView();
        return;
    }

    const { data, error } = await supabaseClient
        .from('manpower_registros')
        .delete()
        .eq('id', id)
        .select('id');

    if (error) { toast('Error: ' + error.message); return; }
    if (!data || data.length === 0) {
        toast('No se eliminó: la base de datos no te permite borrar este registro (falta política DELETE).');
        return;
    }

    toast('Registro eliminado');
    await fetchAll();
    window.renderView();
};

window.toggleManpowerFilterDrawer = function() {
    const drawer = document.getElementById('manpower-filter-drawer');
    const overlay = document.getElementById('manpower-filter-drawer-overlay');
    if (!drawer || !overlay) return;
    const isOpen = !drawer.classList.contains('translate-x-full');
    if (isOpen) {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    } else {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
    }
};

window.applyManpowerFilter = function(key, value) {
    manpowerState[key] = value;
    window.renderView();
};

window.clearManpowerFilters = function() {
    manpowerState = { 
        search: '', 
        filterResp: '', 
        filterGrupo: '', 
        iniDesde: '', 
        iniHasta: '',
        soloRegistradosPorMi: true
    };

    const drawer = document.getElementById('manpower-filter-drawer');
    if (drawer) drawer.remove();
    const overlay = document.getElementById('manpower-filter-drawer-overlay');
    if (overlay) overlay.remove();

    window.renderView();
};

window.toggleManpowerSoloMios = function() {
    manpowerState.soloRegistradosPorMi = !manpowerState.soloRegistradosPorMi;
    window.renderView();
};
