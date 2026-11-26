export const supabaseClient = window.supabase.createClient(
    'https://zsrczkdpluafuoczfokw.supabase.co',
    'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A'
);

export const state = {
    currentUser: null,
    currentRol: 'operador',
    currentCargo: '',
    isAdmin: false,
    isCoordinador: false,
    isSupervisor: false,
    isModelador: false,
    tasksCache: [],          // Solo actividades vigentes (sin archivar): lo que ven todas las vistas
    tasksTodasCache: [],     // Incluye archivadas: para nombres en HH históricas y la vista "Archivadas"
    gruposCache: [],
    perfilesCache: [],
    propDefsCache: [],
    propValsCache: [],
    manpowerCache: [],
    actividadRecursosCache: [],
    planosCache: [],
    actividadPlanosCache: [],
    causasCache: [],
    tareaCausasCache: [],
    causasTodasCache: [],
    reprogramacionesCache: [],
    snapshotsCache: [],
    semanasDashboard: [],
    bloqueosCache: [],       // Periodos "En espera" (sql/009_espera_bloqueos_ppc_responsable.sql)
    especialidadesCache: [],
    especialidadesTodasCache: [],
    parametrosApp: {},
    descansosCache: [],
    feriadosCache: [],
    subcontratasCache: [],
    trabajosExtraCache: [],
    descansosMedicosCache: [],
    currentTab: 'dashboard',
    cdeTargetId: null,
    dragId: null,
    charts: {},
    // Marcadores de "qué ya tengo cargado" para no pedir dos veces lo mismo
    _loaded: {
        core: false,
        propVals: false,
        manpower: false,
        planos: false,         
        planosLigeros: false,   
        planos: false,
        causas: false,
        reprogramaciones: false,
        roster: false,
        snapshots: false
    }
};

// Eliminar = archivar (borrado lógico). Las archivadas salen de todas las vistas vivas.
function setTareas(rows) {
    state.tasksTodasCache = rows || [];
    state.tasksCache = state.tasksTodasCache.filter(t => !t.archivada_en);
}

/** Busca una actividad por id incluyendo las archivadas (para HH históricas). */
export function tareaPorId(id) {
    return (state.tasksTodasCache || []).find(t => String(t.id) === String(id)) || null;
}

// ------------------------------------------------------------------
// Núcleo: lo que TODAS las vistas necesitan. Se carga una vez al login.
// ------------------------------------------------------------------
export async function fetchCore() {
    try {
        const [t, g, p, pd, ar, sub, esp] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('subcontratas').select('*').eq('activo', true).order('nombre'),
            supabaseClient.from('especialidades').select('*').order('orden').order('nombre'),
            fetchParametros()
        ]);

        if (t.error) console.error('fetchCore tareas:', t.error);
        if (p.error) console.error('fetchCore perfiles:', p.error);

        setTareas(t.data);
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.subcontratasCache = sub.data || [];
        setEspecialidades(esp);
        state._loaded.core = true;
        return true;
    } catch (err) {
        console.error('fetchCore general:', err);
        return false;
    }
}

// ------------------------------------------------------------------
// Cargas complementarias. Idempotentes: si ya están cargadas, no repiten.
// ------------------------------------------------------------------
export async function fetchPropVals() {
    if (state._loaded.propVals) return true;
    const { data, error } = await supabaseClient.from('propiedades_valores').select('*');
    if (error) { console.error('fetchPropVals:', error); return false; }
    state.propValsCache = data || [];
    state._loaded.propVals = true;
    return true;
}

export async function fetchManpower() {
    if (state._loaded.manpower) return true;
    const { data, error } = await supabaseClient
        .from('manpower_registros')
        .select('*')
        .order('fecha', { ascending: false });
    if (error) { console.error('fetchManpower:', error); return false; }
    state.manpowerCache = data || [];
    state._loaded.manpower = true;
    return true;
}

export async function fetchPlanos() {
    if (state._loaded.planos) return true;
    // Carga completa: solo para el Log de Planos
    const [pl, ap] = await Promise.all([
        supabaseClient.from('planos').select('*').order('codigo'),
        supabaseClient.from('actividad_planos').select('*')
    ]);
    if (pl.error) console.error('fetchPlanos planos:', pl.error);
    if (ap.error) console.error('fetchPlanos actividad_planos:', ap.error);
    state.planosCache = pl.data || [];
    state.actividadPlanosCache = ap.data || [];
    state._loaded.planos = true;
    return true;
}

export async function fetchPlanosLigeros() {
    if (state._loaded.planosLigeros) return true;
    
    // 1. Traer solo las vinculaciones
    const { data: ap, error: apErr } = await supabaseClient.from('actividad_planos').select('*');
    if (apErr) { console.error('fetchPlanosLigeros vinculaciones:', apErr); return false; }
    
    // 2. Obtener los IDs únicos de los planos vinculados
    const ids = [...new Set((ap || []).map(x => x.plano_id))];
    
    // 3. Traer solo esos planos
    let pl = [];
    if (ids.length > 0) {
        const { data: plData, error: plErr } = await supabaseClient.from('planos').select('*').in('id', ids);
        if (plErr) console.error('fetchPlanosLigeros planos:', plErr);
        else pl = plData || [];
    }

    state.planosCache = pl;
    state.actividadPlanosCache = ap || [];
    state._loaded.planosLigeros = true;
    return true;
}

export async function fetchCausas() {
    if (state._loaded.causas) return true;
    const [ca, tc] = await Promise.all([
        supabaseClient.from('causas_incumplimiento').select('*').order('orden'),
        supabaseClient.from('tarea_causas').select('*')
    ]);
    if (ca.error) console.error('fetchCausas causas:', ca.error);
    if (tc.error) console.error('fetchCausas tarea_causas:', tc.error);
    state.causasTodasCache = (ca.data || []).slice().sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es', { sensitivity: 'base' }));
    state.causasCache = state.causasTodasCache.filter(c => c.activo !== false);
    state.tareaCausasCache = tc.data || [];
    state._loaded.causas = true;
    return true;
}

export async function fetchReprogramaciones() {
    if (state._loaded.reprogramaciones) return true;
    const { data, error } = await supabaseClient
        .from('reprogramaciones_bim')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) console.error('fetchReprogramaciones:', error);
    state.reprogramacionesCache = data || [];
    state._loaded.reprogramaciones = true;
    return true;
}

export async function fetchSnapshots() {
    if (state._loaded.snapshots) return true;
    const { data, error } = await supabaseClient
        .from('snapshots_semanales')
        .select('*')
        .order('semana', { ascending: false });
    if (error) { console.error('fetchSnapshots:', error); return false; }
    state.snapshotsCache = data || [];
    state._loaded.snapshots = true;
    return true;
}

// Semanas del Dashboard (PPC Last Planner). Siempre se piden de nuevo: la actual es en vivo.
export async function fetchSemanasDashboard(n = 8) {
    const { data, error } = await supabaseClient.rpc('dashboard_semanas', { p_semanas: n });
    if (error) { console.error('fetchSemanasDashboard:', error); state.semanasDashboard = []; return false; }
    state.semanasDashboard = data || [];
    return true;
}

// Bloqueos "En espera". Siempre se piden de nuevo (cambian con cada movimiento de estado).
// Si la tabla aún no existe (SQL sin ejecutar), queda vacío y las vistas siguen funcionando.
export async function fetchBloqueos() {
    const { data, error } = await supabaseClient.from('bloqueos_espera').select('*').order('inicio', { ascending: false });
    if (error) { console.warn('bloqueos_espera no disponible (¿ejecutaste sql/009_espera_bloqueos_ppc_responsable.sql?):', error.message); state.bloqueosCache = []; return false; }
    state.bloqueosCache = data || [];
    return true;
}

function setEspecialidades(res) {
    if (res?.error) console.error('especialidades:', res.error);
    state.especialidadesTodasCache = res?.data || [];
    state.especialidadesCache = state.especialidadesTodasCache.filter(e => e.activo !== false);
}

// Parámetros clave/valor (límites WIP, etc.). Si la tabla no existe aún, se usan los valores por defecto.
export async function fetchParametros() {
    const { data, error } = await supabaseClient.from('parametros_app').select('clave,valor');
    if (error) { console.warn('parametros_app no disponible (se usan valores por defecto):', error.message); state.parametrosApp = {}; return false; }
    state.parametrosApp = Object.fromEntries((data || []).map(r => [r.clave, Number(r.valor)]));
    return true;
}

export async function fetchEspecialidades() {
    setEspecialidades(await supabaseClient.from('especialidades').select('*').order('orden').order('nombre'));
}

export async function fetchRoster() {
    if (state._loaded.roster) return true;
    const [de, fe, te, dm] = await Promise.all([
        supabaseClient.from('descansos').select('*'),
        supabaseClient.from('feriados').select('*'),
        supabaseClient.from('trabajos_extra').select('*'),
        supabaseClient.from('descansos_medicos').select('*')
    ]);
    if (de.error) console.error('fetchRoster descansos:', de.error);
    if (fe.error) console.error('fetchRoster feriados:', fe.error);
    if (te.error) console.error('fetchRoster trabajos_extra:', te.error);
    if (dm.error) console.error('fetchRoster descansos_medicos:', dm.error);
    state.descansosCache = de.data || [];
    state.feriadosCache = fe.data || [];
    state.trabajosExtraCache = te.data || [];
    state.descansosMedicosCache = dm.data || [];
    state._loaded.roster = true;
    return true;
}

// ------------------------------------------------------------------
// Carga por vista: decide qué complementos necesita cada tab.
// ------------------------------------------------------------------
export async function fetchVista(tab) {
    if (tab !== 'config') await fetchRoster();

    switch (tab) {
        case 'mitrabajo':
        case 'manpower':
            await fetchManpower();
            await fetchPlanosLigeros(); // Para mostrar los chips de planos en modales
            break;
        case 'dashboard':
            await Promise.all([fetchSemanasDashboard(), fetchPlanosLigeros(), fetchCausas(), fetchManpower(), fetchReprogramaciones(), fetchBloqueos()]);
            break;
        case 'tabla':
            await Promise.all([fetchPropVals(), fetchPlanosLigeros(), fetchCausas(), fetchReprogramaciones(), fetchBloqueos()]);
            break;
        case 'kanban':
            await Promise.all([fetchPlanosLigeros(), fetchCausas(), fetchReprogramaciones(), fetchBloqueos()]);
            break;
        case 'eisenhower':
            break;
        case 'gantt':
            await Promise.all([fetchCausas(), fetchReprogramaciones()]);
            break;
        case 'log-planos':
            // AQUÍ SÍ CARGAMOS LOS 5,216
            await fetchPlanos();
            break;
        case 'recursos':
            await Promise.all([fetchManpower(), fetchSemanasDashboard()]);
            break;
        case 'roster':
            break;
                case 'config':
            await Promise.all([
                fetchPropVals(),
                fetchCausas() // <-- AÑADIR ESTO para que traiga las causas de incumplimiento
            ]);
            break;
    }
    return true;
}

// ------------------------------------------------------------------
// Compatibilidad: fetchAll sigue existiendo y trae todo.
// Se usa en botones "Refrescar" que quieren forzar recarga completa.
// ------------------------------------------------------------------
export async function fetchAll() {
    try {
            const [t, g, p, pd, pv, m, ar, pl, ap, ca, tc, sn, de, fe, te, sub, dm, rp, esp] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('propiedades_valores').select('*'),
            supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false }),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('planos').select('*').order('codigo'),
            supabaseClient.from('actividad_planos').select('*'),
            supabaseClient.from('causas_incumplimiento').select('*').order('orden'),
            supabaseClient.from('tarea_causas').select('*'),
            supabaseClient.from('snapshots_semanales').select('*').order('semana', { ascending: false }),
            supabaseClient.from('descansos').select('*'),
            supabaseClient.from('feriados').select('*'),
            supabaseClient.from('trabajos_extra').select('*'),
            supabaseClient.from('subcontratas').select('*').eq('activo', true).order('nombre'),
            supabaseClient.from('descansos_medicos').select('*'),
            supabaseClient.from('reprogramaciones_bim').select('*').order('created_at', { ascending: false }),
            supabaseClient.from('especialidades').select('*').order('orden').order('nombre'),
            fetchSemanasDashboard(),
            fetchParametros(),
            fetchBloqueos()
        ]);

        if (t.error) console.error('Error tareas:', t.error);
        if (pl.error) console.error('Error planos:', pl.error);
        if (ap.error) console.error('Error actividad_planos:', ap.error);
        if (ca.error) console.error('Error causas:', ca.error);
        if (tc.error) console.error('Error tarea_causas:', tc.error);
        if (sn.error) console.error('Error snapshots:', sn.error);
        if (de.error) console.error('Error descansos:', de.error);
        if (fe.error) console.error('Error feriados:', fe.error);
        if (te.error) console.error('Error trabajos_extra:', te.error);

        setTareas(t.data);
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.propValsCache = pv.data || [];
        state.manpowerCache = m.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.planosCache = pl.data || [];
        state.actividadPlanosCache = ap.data || [];
        state.causasTodasCache = (ca.data || []).slice().sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es', { sensitivity: 'base' }));
        state.causasCache = state.causasTodasCache.filter(c => c.activo !== false);
        state.reprogramacionesCache = rp.data || [];
        state.tareaCausasCache = tc.data || [];
        state.snapshotsCache = sn.data || [];
        state.descansosCache = de.data || [];
        state.feriadosCache = fe.data || [];
        state.descansosMedicosCache = dm.data || [];
        state.subcontratasCache = sub.data || [];
        state.trabajosExtraCache = te.data || [];
        setEspecialidades(esp);

        // Marcar todo como cargado
        Object.keys(state._loaded).forEach(k => state._loaded[k] = true);
    } catch (err) {
        console.error('Error general en fetchAll:', err);
    }
}

// ------------------------------------------------------------------
// Invalida cachés que puedan quedar obsoletas tras una escritura.
// Llamar tras guardar tarea, mover en kanban, registrar manpower, etc.
// ------------------------------------------------------------------
export function invalidarCache(keys) {
    (keys || []).forEach(k => {
        if (k in state._loaded) state._loaded[k] = false;
    });
}

// Las fotos semanales ahora las congela Supabase (pg_cron, domingo 23:59 Lima).
// Ver sql/002_dashboard_ppc_especialidades.sql
