export const supabaseClient = window.supabase.createClient(
    'https://zsrczkdpluafuoczfokw.supabase.co', 
    'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A'
);

export const state = {
    currentUser: null, currentRol: 'operador', isAdmin: false, isCoordinador: false,
    tasksCache: [], gruposCache: [], perfilesCache: [], propDefsCache: [], propValsCache: [], manpowerCache: [],
    currentTab: 'dashboard', cdeTargetId: null, dragId: null, charts: {}
};

export async function fetchAll() {
    // ... tu función fetchAll ...
}
