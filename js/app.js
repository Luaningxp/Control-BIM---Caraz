import { supabaseClient, state, fetchAll, guardarSnapshotSemanal } from './db.js';
import { checkUser } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderTabla, openModal, closeModal, saveTask, editTask, deleteTask, duplicateTask, openModalCDE, closeModalCDE, confirmarTransicion } from './tabla.js';
import { renderKanban, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } from './kanban.js';
import { renderEisenhower } from './eisenhower.js';
import { renderConfig, openGrupoModal, closeGrupoModal, saveGrupo, deleteGrupo, openCargoModal, closeCargoModal, saveCargo, openPropModal, closePropModal, saveProp, deleteProp, openCausaModal, closeCausaModal, saveCausa, deleteCausa, openSubcontrataModal, closeSubcontrataModal, saveSubcontrata, deleteSubcontrata } from './config.js';
import { renderMiTrabajo, renderManpower, openManpowerModal, closeManpowerModal, saveManpower } from './manpower.js';
import { renderRecursos } from './recursos.js';
import { renderGantt } from './gantt.js';
import { renderLogPlanos } from './planos.js';
import { renderRoster } from './roster.js';

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';
    btn.disabled = true;
    errorDiv.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
        
        await initApp(data.user);

    } catch (err) {
        btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Ingresar';
        btn.disabled = false;
        errorDiv.innerText = err.message === 'Invalid login credentials' 
            ? "Correo o contraseña incorrectos." 
            : "Error de conexión: " + err.message;
        errorDiv.style.display = 'block';
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

async function initApp(user) {
    state.currentUser = user;
    
    const { data: perfil } = await supabaseClient.from('perfiles').select('rol,cargo').eq('id', user.id).maybeSingle();
    
    state.currentRol = (perfil?.rol ? String(perfil.rol).trim().toLowerCase() : 'operador');
    state.currentCargo = (perfil?.cargo ? String(perfil.cargo).trim() : '');
    
    state.isAdmin = state.currentRol === 'admin' || state.currentCargo === 'BIM Manager';
    state.isCoordinador = state.currentRol === 'coordinador_bim' || state.currentCargo === 'Coordinador BIM';
    state.isSupervisor = state.currentCargo === 'Supervisor BIM';
    state.isModelador = !state.isAdmin && !state.isCoordinador && !state.isSupervisor;

    document.getElementById('user-display').innerText = user.email;
    document.getElementById('role-display').innerText = state.currentCargo || 'Sin Cargo';

    if (state.isAdmin || state.isCoordinador || state.isSupervisor) {
        document.getElementById('btn-new-task').classList.remove('hidden');
    }
    if (state.isAdmin) {
        document.getElementById('tab-config-btn').classList.remove('hidden');
    }
    
    if (!state.isAdmin && !state.isCoordinador) {
        document.querySelector('[data-tab="mitrabajo"]').classList.remove('hidden');
    }
    if (!state.isAdmin) {
        document.getElementById('tab-config-btn').classList.add('hidden');
    }

    await fetchAll();
    window.switchTab(state.isAdmin || state.isCoordinador ? 'dashboard' : 'mitrabajo');
}

window.switchTab = function(tab) {
    state.currentTab = tab;
    ['mitrabajo', 'dashboard', 'tabla', 'roster', 'kanban', 'eisenhower', 'gantt', 'manpower', 'recursos','log-planos', 'config'].forEach(t => {
        const btn = document.querySelector(`[data-tab="${t}"]`);
        if(btn) btn.classList.toggle('tab-active', t === tab);
    });
    window.renderView();
}

window.renderView = function() {
    const container = document.getElementById('view-container');
    if (!container) return;
    container.innerHTML = '';
    if (state.currentTab === 'mitrabajo') renderMiTrabajo(container);
    else if (state.currentTab === 'dashboard') renderDashboard(container);
    else if (state.currentTab === 'tabla') renderTabla(container);
    else if (state.currentTab === 'roster') renderRoster(container);
    else if (state.currentTab === 'kanban') renderKanban(container);
    else if (state.currentTab === 'eisenhower') renderEisenhower(container);
    else if (state.currentTab === 'gantt') renderGantt(container);
    else if (state.currentTab === 'log-planos') renderLogPlanos(container);
    else if (state.currentTab === 'manpower') renderManpower(container);
    else if (state.currentTab === 'recursos') renderRecursos(container);
    else if (state.currentTab === 'config') renderConfig(container);
}
window.openModal = openModal; window.closeModal = closeModal; window.saveTask = saveTask; window.editTask = editTask; window.deleteTask = deleteTask;
window.openModalCDE = openModalCDE; window.closeModalCDE = closeModalCDE; window.confirmarTransicion = confirmarTransicion;
window.onDragStart = onDragStart; window.onDragEnd = onDragEnd; window.onDragOver = onDragOver; window.onDragLeave = onDragLeave; window.onDrop = onDrop;
window.openGrupoModal = openGrupoModal; window.closeGrupoModal = closeGrupoModal; window.saveGrupo = saveGrupo; window.deleteGrupo = deleteGrupo;
window.openCargoModal = openCargoModal; window.closeCargoModal = closeCargoModal; window.saveCargo = saveCargo;
window.openPropModal = openPropModal; window.closePropModal = closePropModal; window.saveProp = saveProp; window.deleteProp = deleteProp;
window.openCausaModal = openCausaModal; window.closeCausaModal = closeCausaModal; window.saveCausa = saveCausa; window.deleteCausa = deleteCausa;
window.openManpowerModal = openManpowerModal; window.closeManpowerModal = closeManpowerModal; window.saveManpower = saveManpower;
window.fetchAll = fetchAll;
window.duplicateTask = duplicateTask;
window.openSubcontrataModal = openSubcontrataModal; window.closeSubcontrataModal = closeSubcontrataModal; window.saveSubcontrata = saveSubcontrata; window.deleteSubcontrata = deleteSubcontrata;
window.guardarSnapshotSemanal = guardarSnapshotSemanal;

window.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUser();
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
        await initApp(user);
    }
});

window.togglePassword = function() {
    const passInput = document.getElementById('login-password');
    const eyeIcon = document.getElementById('eye-icon');
    
    if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const passInput = document.getElementById('login-password');
    const eyeBtn = document.querySelector('#login-password + button');
    
    if (passInput && eyeBtn) {
        eyeBtn.style.opacity = '0';
        eyeBtn.style.pointerEvents = 'none';
        
        passInput.addEventListener('input', (e) => {
            if (e.target.value.length > 0) {
                eyeBtn.style.opacity = '1';
                eyeBtn.style.pointerEvents = 'auto';
            } else {
                eyeBtn.style.opacity = '0';
                eyeBtn.style.pointerEvents = 'none';
                passInput.type = 'password';
                const eyeIcon = document.getElementById('eye-icon');
                if (eyeIcon) {
                    eyeIcon.classList.remove('fa-eye-slash');
                    eyeIcon.classList.add('fa-eye');
                }
            }
        });
    }
});

window.toggleDarkMode = function() {
    const html = document.documentElement;
    const icon = document.getElementById('dark-mode-icon');
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }
});
