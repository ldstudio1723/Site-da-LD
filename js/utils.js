// ==========================================
// MÓDULO: UTILITÁRIOS (SEGURANÇA & HELPERS)
// ==========================================
// Este ficheiro centraliza funções de segurança reutilizáveis em todo o projeto.
// Deve ser carregado ANTES de qualquer outro script nas páginas HTML.

// ------------------------------------------
// 1. PROTEÇÃO XSS — ESCAPE DE HTML
// ------------------------------------------
/**
 * Sanitiza uma string para prevenir XSS (Cross-Site Scripting).
 * Converte caracteres HTML especiais em entidades seguras.
 * SEMPRE usar antes de injetar dados de utilizadores (DB / formulários) em innerHTML.
 *
 * @param {string} str - O texto a ser sanitizado.
 * @returns {string} Texto seguro para renderização no DOM.
 *
 * @example
 * element.innerHTML = escapeHTML(user.username); // ✅ Seguro
 * element.innerHTML = user.username;             // ❌ Vulnerável a XSS
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g,  "&amp;")
        .replace(/</g,  "&lt;")
        .replace(/>/g,  "&gt;")
        .replace(/"/g,  "&quot;")
        .replace(/'/g,  "&#039;");
}

// ------------------------------------------
// 2. SANITIZAÇÃO DE INPUT — ANTI-INJEÇÃO
// ------------------------------------------
/**
 * Limpa uma string de input de utilizador para uso seguro.
 * Remove espaços em excesso e trunca ao limite máximo.
 * Não é um substituto para escapeHTML na renderização — ambos devem ser usados.
 *
 * @param {string} value       - O valor do input a sanitizar.
 * @param {number} [maxLength=200] - Comprimento máximo permitido.
 * @returns {string} Input limpo e truncado.
 *
 * @example
 * const nome = sanitizeInput(document.getElementById('nome').value);
 */
function sanitizeInput(value, maxLength = 200) {
    if (value === null || value === undefined) return "";

    // 1. Converter para string e remover espaços em excesso nas bordas
    let clean = String(value).trim();

    // 2. Truncar ao limite máximo (evita overflow na base de dados)
    if (clean.length > maxLength) {
        clean = clean.substring(0, maxLength);
    }

    return clean;
}

// ------------------------------------------
// 3. GUARD DE SESSÃO — PROTEÇÃO DE PÁGINAS
// ------------------------------------------
/**
 * Verifica se existe uma sessão Supabase ativa.
 * Se não houver sessão válida, redireciona para a página de login.
 * Deve ser chamada no topo das páginas protegidas (dashboard, perfil, membros, etc.).
 *
 * @param {string} [redirectTo="index.html"] - Página para redirecionar se não autenticado.
 * @returns {Promise<object|null>} Objeto da sessão se autenticado, null caso contrário.
 *
 * @example
 * // No topo da página protegida:
 * document.addEventListener('DOMContentLoaded', async () => {
 *     const session = await requireSession();
 *     if (!session) return; // Já foi redirecionado
 *     // ... inicializar a página
 * });
 */
async function requireSession(redirectTo = "index.html") {
    // Garantir que o cliente Supabase está inicializado
    if (!window.supabaseClient) {
        console.error("CRÍTICO: supabaseClient não inicializado antes de requireSession()!");
        window.location.href = redirectTo;
        return null;
    }

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();

        if (!session) {
            // Sem sessão ativa — redirecionar para login
            console.warn("Sessão não encontrada. Redirecionando para:", redirectTo);
            window.location.href = redirectTo;
            return null;
        }

        return session;

    } catch (err) {
        // Erro ao verificar sessão — tratar como não autenticado por segurança
        console.error("Erro ao verificar sessão:", err);
        window.location.href = redirectTo;
        return null;
    }
}

// ------------------------------------------
// 4. GUARD DE ADMIN — VERIFICAÇÃO DE ROLE
// ------------------------------------------
/**
 * Verifica se o utilizador atual tem role de "admin" na tabela de perfis.
 * Consulta sempre a DB (mais seguro que só confiar no user_metadata).
 *
 * @returns {Promise<boolean>} true se for admin, false caso contrário.
 *
 * @example
 * if (!(await isAdmin())) {
 *     alert("Sem permissão.");
 *     return;
 * }
 */

async function getRole() {
    if (!window.supabaseClient) return 'member';
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return 'member';
        const { data: profile } = await window.supabaseClient
            .from('profiles').select('role').eq('id', user.id).single();
        return (profile?.role || user.user_metadata?.role || 'member').toLowerCase();
    } catch (err) {
        return 'member';
    }
}

async function isAdmin() {
    const role = await getRole();
    return role === 'admin';
}

async function hasPermission(area) {
    const role = await getRole();
    if (role === 'admin') return true; // Conta mestre tem acesso a tudo

    switch (area) {
        case 'projects': 
            return role === 'project_manager';
        case 'weekly': 
            return role === 'weekly_manager';
        case 'commissions': 
            return role === 'commission_manager';
        case 'members_view': 
            return ['project_manager', 'weekly_manager', 'commission_manager'].includes(role);
        default: 
            return false;
    }
}

// ------------------------------------------
// 5. MÁQUINA DE MODAIS PERSONALIZADAS (GLOBAL)
// ------------------------------------------

window.customAlert = function(message, title = 'Aviso') {
    return new Promise((resolve) => {
        const id = 'alert-modal-' + Date.now();
        const html = `
        <div id="${id}" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in opacity-0 transition-opacity duration-200">
            <div class="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm shadow-2xl p-6 text-center transform scale-95 transition-transform duration-200" id="${id}-box">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 mb-4 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                    <svg class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <p class="text-sm text-gray-400 mb-6 leading-relaxed">${message}</p>
                <button id="${id}-btn" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-blue-500/20 transition transform active:scale-95 focus:outline-none">
                    Ok, percebi!
                </button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        
        const modal = document.getElementById(id);
        const box = document.getElementById(`${id}-box`);
        const btn = document.getElementById(`${id}-btn`);
        
        // Anim In
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
        });
        
        btn.focus();
        btn.onclick = () => {
            modal.classList.add('opacity-0');
            box.classList.add('scale-95');
            setTimeout(() => {
                modal.remove();
                resolve();
            }, 200);
        };
    });
};

window.customConfirm = function(message, title = 'Confirmação Necessária') {
    return new Promise((resolve) => {
        const id = 'confirm-modal-' + Date.now();
        const html = `
        <div id="${id}" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in opacity-0 transition-opacity duration-200">
            <div class="bg-gray-900 rounded-2xl border border-red-500/30 w-full max-w-sm shadow-2xl p-6 text-center transform scale-95 transition-transform duration-200" id="${id}-box">
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 mb-4 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <svg class="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <p class="text-sm text-gray-400 mb-6 leading-relaxed">${message}</p>
                <div class="flex gap-3">
                    <button id="${id}-cancel" class="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2.5 rounded-lg transition border border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-500">
                        Cancelar
                    </button>
                    <button id="${id}-confirm" class="flex-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-red-500/20 transition transform active:scale-95 focus:outline-none">
                        Confirmar
                    </button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        
        const modal = document.getElementById(id);
        const box = document.getElementById(`${id}-box`);
        
        // Anim In
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
        });
        
        const close = (result) => {
            modal.classList.add('opacity-0');
            box.classList.add('scale-95');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        document.getElementById(`${id}-cancel`).onclick = () => close(false);
        document.getElementById(`${id}-confirm`).onclick = () => close(true);
    });
};

// Override do alert nativo do browser para a aplicação inteira
window.alert = function(msg) {
    return window.customAlert(msg);
};

// ------------------------------------------
// EXPOSIÇÃO GLOBAL
// ------------------------------------------
window.escapeHTML    = escapeHTML;
window.sanitizeInput = sanitizeInput;
window.requireSession = requireSession;
window.isAdmin       = isAdmin;
window.getRole       = getRole;
window.hasPermission = hasPermission;
