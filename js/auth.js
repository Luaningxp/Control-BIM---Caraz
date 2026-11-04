import { supabaseClient, state } from './db.js';
import { toast } from './utils.js';

export async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
}

export async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        errorDiv.innerText = "Error: Credenciales inválidas";
        errorDiv.classList.remove('hidden');
    } else {
        await initAuth(data.user);
        window.dispatchEvent(new Event('reloadData'));
    }
}

export async function initAuth(user) {
    state.currentUser = user;
    const { data: perfil } = await supabaseClient.from('perfiles').select('rol,cargo').eq('id', user.id).maybeSingle();
    state.currentRol = (perfil?.rol ? String(perfil.rol).trim().toLowerCase() : 'operador');
    state.isAdmin = state.currentRol === 'admin';
    state.isCoordinador = state.currentRol === 'coordinador_bim';

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('flex');
    document.getElementById('user-display').innerText = user.email;
    document.getElementById('role-display').innerText = state.isAdmin ? 'Administrador' : state.isCoordinador ? 'Coordinador BIM' : 'Modelador';

    if (state.isAdmin || state.isCoordinador) document.getElementById('btn-new-task').classList.remove('hidden');
    if (state.isAdmin) document.getElementById('tab-config-btn').classList.remove('hidden');
    if (!state.isAdmin && !state.isCoordinador) document.querySelector('[data-tab="mitrabajo"]').classList.remove('hidden');
}

export async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}
