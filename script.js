// ==========================================
// SCRIPT PRINCIPAL — LD ARTE
// ==========================================
// Contém: Inicialização Supabase, Keep-Alive, Login, Registo,
//          Navegação do Dashboard, e Guards de Sessão.
// Segurança: sanitizeInput antes de criar contas,
//            verificação de sessão Supabase antes de acesso ao dashboard.

// ==========================================
// 1. CONFIGURAÇÃO E INICIALIZAÇÃO
// ==========================================
// NOTA: O cliente Supabase é criado uma única vez e guardado em window.supabaseClient
// para ser partilhado entre todos os módulos JS.

// Salvar referência à biblioteca do CDN antes de a sobrepormos com o cliente
if (window.supabase && !window.supabaseLib) {
    window.supabaseLib = window.supabase;
}

if (!window.supabaseClient) {
    if (window.supabaseLib) {
        window.supabaseClient = window.supabaseLib.createClient(
            "https://matqihrnhwvkbgldocxz.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ"
        );
    }
}
var supabase = window.supabaseClient;

// ==========================================
// 1.1 ANTI-PAUSA DA BASE DE DADOS (KEEP-ALIVE)
// ==========================================
function startKeepAlivePing() {
    // Função para fazer update à tabela de ping (id = 1)
    async function pingDB() {
        try {
            // Lemos o valor atual (para não ser um valor estático sempre)
            const { data, error: errSelect } = await supabase
                .from('_keep_alive')
                .select('status')
                .eq('id', 1)
                .single();

            if (errSelect && errSelect.code !== 'PGRST116') {
                console.warn("Ping falhou (leitura):", errSelect.message);
                return;
            }

            // Invertemos o status (0 -> 1, 1 -> 0) para alterar efetivamente a db
            const nextStatus = data && data.status === 1 ? 0 : 1;

            const { error: errUpdate } = await supabase
                .from('_keep_alive')
                .update({ status: nextStatus, last_ping: new Date().toISOString() })
                .eq('id', 1);

            if (errUpdate) {
                console.warn("Ping falhou (update):", errUpdate.message);
            } else {
                console.log("Supabase Ping Enviado! Status atual:", nextStatus);
            }
        } catch (e) {
            console.warn("Erro no ping:", e);
        }
    }

    // Faz o ping imediatamente mal a página carrega
    pingDB();

    // Repete a cada 55 minutos (Supabase Free pausa após 7 dias de INATIVIDADE.)
    // Atividade = requests à API com sucesso. 
    // 55 minutos = 3300000 milissegundos
    setInterval(pingDB, 3300000);
}

// Iniciar o vigilante de fundo
startKeepAlivePing();

// ==========================================
// 2. REGISTAR (ADMIN ONLY)
// ==========================================
// NOTA: A página cadastro.html já tem guard de sessão que garante que só
//       admins chegam aqui. Este código apenas processa o formulário.

async function handleRegister() {
    // SEGURANÇA: sanitizeInput limpa e trunca os valores antes de usar
    const username = sanitizeInput(document.getElementById('reg-username').value, 50);
    const emailStr = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const role     = document.getElementById('reg-role').value;
    const msg      = document.getElementById('reg-msg');

    // Validação básica de campos obrigatórios
    if (!password || !username || !emailStr) {
        alert("Preencha username, email e senha.");
        return;
    }

    if (password.length < 6) {
        alert("A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    if (password.length > 128) {
        alert("A senha não pode ter mais de 128 caracteres.");
        return;
    }

    // Usar email real em vez de gerado
    const finalEmail = emailStr;

    try {
        const url = "https://matqihrnhwvkbgldocxz.supabase.co";
        const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ";

        // Instanciar um cliente temporário e efémero para evitar o auto-login
        // Usamos window.supabaseLib que é a biblioteca original (CDN)
        const tempSupabase = window.supabaseLib.createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data, error } = await tempSupabase.auth.signUp({
            email: finalEmail,
            password: password,
            options: {
                data: {
                    username: username, // Username já sanitizado
                    role: role          // role vem de um <select> controlado, não de input livre
                }
            }
        });

        if (error) throw error;

        await window.customAlert("Conta criada com sucesso! O novo utilizador já pode entrar.", "Membro Registado");
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-password').value = '';

    } catch (err) {
        console.error("Erro registo:", err);
        if (msg) {
            msg.innerText = "Erro: " + err.message;
            msg.classList.remove('hidden');
        } else {
            alert("Erro no Registo: " + err.message);
        }
    }
}

// ==========================================
// 3. LOGIN (APENAS USERNAME)
// ==========================================
/**
 * Processa o formulário de login.
 * Suporta input de Username (converte para email interno) ou Email real.
 * SEGURANÇA: O Supabase valida as credenciais server-side. O cliente apenas envia o email/senha.
 */
async function handleLogin() {
    const usernameInput = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const errorMsg = document.getElementById('error-msg');

    if (!usernameInput || !password) {
        alert("Por favor, preencha o username e a senha.");
        return;
    }

    // Mostrar loader elegante
    const loader = document.getElementById('login-loader');
    if (loader) loader.classList.remove('hidden');

    // DETECÇÃO INTELIGENTE: EMAIL vs USERNAME
    let finalEmail;
    if (usernameInput.includes('@')) {
        // Se já tem @, é um email real
        finalEmail = usernameInput;
    } else {
        // Se não tem @, é um username. Descobre o email associado via RPC
        try {
            const { data: realEmail, error: rpcError } = await supabase.rpc('get_user_email_by_username', {
                p_username: usernameInput
            });

            if (!rpcError && realEmail) {
                finalEmail = realEmail; // Conta nova
            } else {
                finalEmail = `${usernameInput.replace(/\s+/g, '').toLowerCase()}@ld.local`; // Fallback (Conta antiga)
            }
        } catch (err) {
            finalEmail = `${usernameInput.replace(/\s+/g, '').toLowerCase()}@ld.local`;
        }
    }

    /* DEBUG: Descomente para ver o email gerado
    console.log("Tentando login com:", finalEmail); 
    */

    try {
        // Login com o email calculado
        const { data, error } = await supabase.auth.signInWithPassword({
            email: finalEmail,
            password: password,
        });

        if (error) throw error;

        // Se passar aqui, o login foi sucesso!
        // alert("Login SUCESSO! Redirecionando para Dashboard...");

        localStorage.setItem("isLoggedIn", "true");
        window.location.href = "dashboard.html";

    } catch (err) {
        // Esconder loader em caso de erro
        const loader = document.getElementById('login-loader');
        if (loader) loader.classList.add('hidden');

        console.error("Login error:", err);
        alert(`Erro ao Entrar: ${err.message || 'Credenciais inválidas'}`);

        if (errorMsg) {
            errorMsg.innerText = "Erro: Username ou Senha incorretos.";
            errorMsg.classList.remove('hidden');
        }
    }
}
/* COMENTADO: Lógica antiga do Supabase
const { data: profile, error: searchError } = await supabase...
*/


// ==========================================
// 5. NAVEGAÇÃO E UI (REDESIGN)
// ==========================================
/**
 * Esconde o conteúdo da seção ativa e mostra o ecrã inicial (grid Home).
 */
function showHome() {
    // Esconde a área de conteúdo
    const contentArea = document.getElementById('dashboard-content');
    if (contentArea) contentArea.classList.add('hidden');

    // Mostra a área de Home (Grid)
    const homeArea = document.getElementById('dashboard-home');
    if (homeArea) homeArea.classList.remove('hidden');

    updateMobileTabs('home');
}

function showSection(sectionId) {
    console.log(`>>> showSection('${sectionId}') CHAMADO <<<`);

    // 1. Esconde a Home
    const homeArea = document.getElementById('dashboard-home');
    if (homeArea) {
        homeArea.classList.add('hidden');
    } else {
        console.warn("Aviso: #dashboard-home não encontrado!");
    }

    // 2. Mostra o Container de Conteúdo
    const contentArea = document.getElementById('dashboard-content');
    if (contentArea) {
        contentArea.classList.remove('hidden');
    } else {
        console.error("ERRO: #dashboard-content não encontrado!");
    }

    // 3. Esconde todas as seções internas
    const sections = document.querySelectorAll('.section');
    sections.forEach(sec => sec.classList.add('hidden'));

    // 4. Mostra a seção escolhida
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.remove('hidden');
        console.log(`Sucesso: #${sectionId} agora visível.`);
    } else {
        console.error(`ERRO CRÍTICO: Seção #${sectionId} não encontrada no DOM!`);
    }

    updateMobileTabs(sectionId);
}

/**
 * Atualiza o estado visual da barra de navegação mobile
 */
function updateMobileTabs(activeId) {
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => tab.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${activeId}`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}



// Função que corre ao carregar o dashboard
async function initDashboard() {
    // 1. Verificar sessão no Supabase
    const { data: { session } } = await supabase.auth.getSession();

    // Elementos de UI
    const userDisplay = document.getElementById('user-display');
    const welcomeMsg = document.getElementById('welcome-msg');

    // Icones
    const iconLogin = document.getElementById('icon-login');
    const iconLogout = document.getElementById('icon-logout');

    let username = "Visitante";
    let role = "guest";

    if (session) {
        // Usuário Logado
        localStorage.setItem("isLoggedIn", "true");
        username = session.user.user_metadata.username || "Membro";

        // Fetch role from DB dynamically to ensure admin privileges are respected
        const { data: dbProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();

        role = dbProfile?.role || session.user.user_metadata.role || "member";

        // UI Updates para Logado
        if (userDisplay) userDisplay.innerText = username;
        if (welcomeMsg) welcomeMsg.innerText = `Bem-vindo, ${username}.`;

        // Show Logout Icon
        if (iconLogin) iconLogin.classList.add('hidden');
        if (iconLogout) iconLogout.classList.remove('hidden');

        // LÓGICA DE CARDS DINÂMICOS
        console.log("Configurando Dashboard para role:", role);

        // 1. Card PERFIL (Sempre visível para logados)
        const cardProfile = document.getElementById('card-profile');
        if (cardProfile) {
            cardProfile.classList.remove('hidden');
        }

        // is-admin flag para estilos gerais se for O Admin verdadeiro
        if (role && role.toLowerCase() === 'admin') {
            document.body.classList.add('is-admin');
        }

        // 2. Card MEMBROS (Qualquer cargo de Gestor)
        if (typeof window.hasPermission === 'function' && await window.hasPermission('members_view')) {
            const cardMembers = document.getElementById('card-members');
            if (cardMembers) {
                cardMembers.classList.remove('hidden');
                cardMembers.style.display = 'flex';
            } else {
                console.warn("Elemento #card-members não encontrado.");
            }
        }

        // 3. Botão Novo Projeto no Feed (Para Gestor de Projetos ou Admin)
        if (typeof window.hasPermission === 'function' && await window.hasPermission('projects')) {
            const btnAddProject = document.getElementById('btn-add-project');
            if (btnAddProject) btnAddProject.classList.remove('hidden');
        }

        // 4. Edição de Comissões e Termos (Gestor de Comissões ou Admin)
        if (typeof window.hasPermission === 'function' && await window.hasPermission('commissions')) {
            const adminCommArea = document.getElementById('admin-comm-area');
            if (adminCommArea) adminCommArea.classList.remove('hidden');

            const btnSaveTerms = document.getElementById('btn-save-terms');
            if (btnSaveTerms) btnSaveTerms.classList.remove('hidden');

            const termsText = document.getElementById('ld-terms-text');
            if (termsText) {
                termsText.disabled = false;
                termsText.classList.remove('disabled:opacity-75', 'disabled:cursor-not-allowed');
            }
        }

    } else {
        // SEM SESSÃO (Redirecionar para Login)
        console.warn("Sem sessão ativa. Redirecionando...");
        window.location.href = "index.html";
        return;
    }

    // Default View
    showHome();

    // Inicializar outros módulos comuns
    if (window.initDailySync) window.initDailySync();
    if (window.initWeeklyDrawings) window.initWeeklyDrawings();
    if (window.initProjects) window.initProjects();
    if (window.initCommissions) window.initCommissions();
}

// Handler para o botão "Admin" na Home
async function handleAdminAccess() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || (session.user.user_metadata.role !== 'admin')) {
        await alert("Área restrita a Administradores. Por favor, faça login.");
        window.location.href = "index.html";
        return;
    }

    // Se for admin, mostra feedback (ou poderia abrir uma seção específica)
    alert("Bem-vindo à Área de Admin!");
    // Futuro: showSection('admin-panel');
}

// Handler para o botão de Auth (Login/Logout)
async function handleAuthAction() {
    const { data: { session } = {} } = await supabase.auth.getSession(); // Added default empty object for data
    if (session) {
        // Logout
        await supabase.auth.signOut();
        localStorage.clear();
        window.location.reload(); // Recarrega como visitante
    } else {
        // Go to Login
        window.location.href = "index.html";
    }
}

// DEPRECATED: Old Logout (kept for compatibility if called elsewhere)
async function handleLogout() {
    await handleAuthAction();
}

// Inicializar o dashboard quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Apenas corre se estivermos na página de dashboard
    if (document.getElementById('dashboard-content') || document.getElementById('dashboard-home')) {
        initDashboard();
    }
});
