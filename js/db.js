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
    tasksCache: [],
    gruposCache: [],
    perfilesCache: [],
    propDefsCache: [],
    propValsCache: [],
    manpowerCache: [],
    actividadRecursosCache: [],
    planosCache: [],             // <-- ESTO
    actividadPlanosCache: [],    // <-- ESTO
    causasCache: [],
    tareaCausasCache: [],
    snapshotsCache: [],
    currentTab: 'dashboard',
    cdeTargetId: null,
    dragId: null,
    charts: {}
};
export async function fetchAll() {
    try {
        const [t, g, p, pd, pv, m, ar, pl, ap] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('propiedades_valores').select('*'),
            supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false }),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('causas_incumplimiento').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('tarea_causas').select('*'),
            supabaseClient.from('snapshots_semanales').select('*').order('semana', { ascending: false })
            supabaseClient.from('planos').select('*').order('codigo'),           // <-- NUEVO
            supabaseClient.from('actividad_planos').select('*')                  // <-- NUEVO
        ]);

        if (t.error) console.error('Error tareas:', t.error);
        // ... (otros errores)
        if (pl.error) console.error('Error planos:', pl.error);
        if (ap.error) console.error('Error actividad_planos:', ap.error);

        state.tasksCache = t.data || [];
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.propValsCache = pv.data || [];
        state.manpowerCache = m.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.causasCache = causasRes.data || [];
        state.tareaCausasCache = tcRes.data || [];
        state.snapshotsCache = snapRes.data || [];
        state.planosCache = pl.data || [];               // <-- ASIGNACIÓN
        state.actividadPlanosCache = ap.data || [];      // <-- ASIGNACIÓN

    } catch (err) {
        console.error('Error general en fetchAll:', err);
    }
}
