// ==========================================
// MÓDULO: MEMBROS (GESTÃO DE UTILIZADORES)
// ==========================================
// Responsabilidade: Listar membros, mostrar estatísticas de atividade,
//                  e permitir ao Admin editar dados de cada membro.
// Segurança: escapeHTML em todos os innerHTML, sanitizeInput antes de gravar na DB.

(function () {

    console.log(">>> MODULO MEMBERS.JS CARREGADO <<<");

    // ------------------------------------------
    // INICIALIZAÇÃO DO SUPABASE
    // ------------------------------------------
    const supabaseUrl = "https://matqihrnhwvkbgldocxz.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ";

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    const supabase = window.supabaseClient;

    if (!supabase) console.error("CRÍTICO: Falha ao inicializar Supabase em members.js!");

    // ------------------------------------------
    // INICIALIZAÇÃO DO MÓDULO
    // ------------------------------------------
    /**
     * Ponto de entrada do módulo de membros.
     * Busca perfis e submissões na DB e renderiza a lista.
     */
    async function initMembers() {
        console.log(">>> initMembers() INICIADO <<<");

        const container = document.getElementById('members-content');
        if (!container) {
            console.error("ERRO: Container 'members-content' não encontrado!");
            return;
        }

        // Estado de carregamento
        container.innerHTML = '<p class="text-gray-500 animate-pulse">A carregar membros...</p>';

        // Garantir que o modal existe no DOM
        setupEditModal();

        try {
            // 1. Buscar todos os perfis ordenados por username
            const { data: profiles, error: errProfiles } = await supabase
                .from('profiles')
                .select('*')
                .order('username');

            if (errProfiles) throw errProfiles;

            if (!profiles || profiles.length === 0) {
                container.innerHTML = '<p class="text-yellow-400">Nenhum registo de membro encontrado na base de dados.</p>';
                return;
            }

            // 2. Buscar submissões de desenhos semanais de todos os utilizadores
            const { data: submissions, error: errSubs } = await supabase
                .from('weekly_drawing_submissions')
                .select('user_id, created_at')
                .order('created_at', { ascending: false });

            if (errSubs) throw errSubs;

            // 3. Combinar perfis com estatísticas de atividade
            const membersData = profiles.map(profile => {
                const userSubs   = submissions.filter(s => s.user_id === profile.id);
                let daysSince    = "N/A";
                let statusColor  = "text-gray-500";
                const totalDrawings = userSubs.length;

                if (userSubs.length > 0) {
                    const lastDate = new Date(userSubs[0].created_at);
                    const diffDays = Math.ceil(Math.abs(new Date() - lastDate) / (1000 * 60 * 60 * 24));
                    daysSince = `${diffDays} dias`;

                    if (diffDays <= 7)       statusColor = "text-green-400";         // Ativo
                    else if (diffDays <= 14) statusColor = "text-yellow-400";        // Atenção
                    else                     statusColor = "text-red-500 font-bold"; // Crítico
                } else {
                    daysSince   = "Nunca submeteu";
                    statusColor = "text-red-500 font-bold";
                }

                return { ...profile, daysSince, statusColor, totalDrawings };
            });

            renderMembersList(membersData);

        } catch (error) {
            console.error("Erro ao carregar membros:", error);
            container.innerHTML = `<p class="text-red-400">Erro ao carregar membros: ${escapeHTML(error.message)}</p>`;
        }
    }

    // ------------------------------------------
    // RENDERIZAÇÃO DA LISTA DE MEMBROS
    // ------------------------------------------
    /**
     * Renderiza os cartões de membros no container principal.
     * SEGURANÇA: Todos os dados de string vindos da DB passam por escapeHTML().
     *
     * @param {Array} members - Array de perfis combinados com estatísticas.
     */
    async function renderMembersList(members) {
        const container = document.getElementById('members-content');
        if (!container) return;

        container.innerHTML = '';

        const isFullAdmin = typeof window.isAdmin === 'function' ? await window.isAdmin() : false;

        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

        members.forEach(m => {
            const card = document.createElement('div');
            card.className = "bg-gray-800 p-4 rounded-xl border border-gray-700 hover:border-indigo-500/50 transition group relative";

            // Prioridade de display: custom_role > role > 'Membro'
            const displayRole = m.custom_role || m.role || 'Membro';
            const isCustom    = !!m.custom_role;

            // SEGURANÇA: escapeHTML em TODOS os valores vindos da DB
            card.innerHTML = `
                <div class="flex items-start justify-between">
                    <!-- Info do membro -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="font-bold text-white text-lg truncate">${escapeHTML(m.username || 'Sem Nome')}</p>
                            ${m.role === 'admin' ? '<span class="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 shrink-0">Admin</span>' : ''}
                        </div>
                        <p class="text-xs ${isCustom ? 'text-pink-400 font-bold' : 'text-gray-400'} uppercase tracking-widest mt-0.5">
                            ${escapeHTML(displayRole)}
                        </p>
                    </div>
                    ${isFullAdmin ? `
                    <!-- Botão Editar (visível ao hover) -->
                    <button
                        onclick="openEditMember('${escapeHTML(m.id)}', '${escapeHTML(m.username || '')}', '${escapeHTML(m.role || 'member')}', '${escapeHTML(m.custom_role || '')}')"
                        class="ml-3 shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white text-xs font-bold rounded-lg border border-indigo-500/30 hover:border-indigo-500/60 transition"
                        title="Editar membro">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Editar
                    </button>
                    ` : ''}
                </div>

                <!-- Estatísticas de Atividade -->
                <div class="mt-4 pt-3 border-t border-gray-700 flex gap-5">
                    <div>
                        <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Sem desenhar</p>
                        <p class="${m.statusColor} font-mono text-sm">${escapeHTML(m.daysSince)}</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Total</p>
                        <p class="text-white font-mono text-sm">${m.totalDrawings} <span class="text-xs text-gray-400">desenhos</span></p>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    // ------------------------------------------
    // MODAL DE EDIÇÃO DE MEMBRO
    // ------------------------------------------
    /**
     * Injeta o modal de edição de membro no DOM (apenas uma vez).
     * O modal é reutilizado para todos os membros — openEditMember() preenche os dados.
     */
    function setupEditModal() {
        // Verificar se já existe para evitar duplicações
        if (document.getElementById('edit-member-modal')) return;

        const modalHTML = `
        <div id="edit-member-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] hidden flex items-center justify-center p-4">
            <div class="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md shadow-2xl">

                <!-- Header do Modal -->
                <div class="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div>
                        <h3 class="text-xl font-bold text-white">Editar Membro</h3>
                        <p id="edit-member-subtitle" class="text-sm text-gray-400 mt-0.5"></p>
                    </div>
                    <button onclick="closeEditMember()" class="text-gray-500 hover:text-white transition p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Corpo do Modal -->
                <div class="p-6 space-y-5">

                    <!-- Campo: Username -->
                    <div>
                        <label class="block text-xs uppercase text-gray-500 font-bold mb-1.5">Username</label>
                        <input type="text" id="edit-username"
                            class="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:outline-none rounded-lg p-3 text-white transition"
                            placeholder="Nome de utilizador" maxlength="50">
                        <p class="text-xs text-yellow-500/80 mt-1">⚠️ Alterar o username aqui já não impacta o email de login diretamente.</p>
                    </div>

                    <!-- Campo: Email de Login -->
                    <div>
                        <label class="block text-xs uppercase text-blue-400 font-bold mb-1.5">Email de Autenticação (Login)</label>
                        <input type="email" id="edit-email"
                            class="w-full bg-gray-900 border border-blue-500/50 focus:border-blue-400 focus:outline-none rounded-lg p-3 text-blue-100 transition"
                            placeholder="A carregar email protegido..." maxlength="255">
                        <p class="text-[10px] text-gray-500 mt-1">Apenas o Admin Principal consegue visualizar e alterar e-mails reais.</p>
                    </div>

                    <!-- Campo: Role (Cargo do Sistema) -->
                    <div>
                        <label class="block text-xs uppercase text-gray-500 font-bold mb-1.5">Cargo do Sistema</label>
                        <select id="edit-role"
                            class="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:outline-none rounded-lg p-3 text-white transition">
                            <option value="member">Membro / Artista</option>
                            <option value="project_manager">Gestão de Projetos</option>
                            <option value="weekly_manager">Responsável Desenhos Semanais</option>
                            <option value="commission_manager">Gestor de Comissões</option>
                            <option value="admin">Admin Principal</option>
                        </select>
                    </div>

                    <!-- Campo: Cargo Personalizado -->
                    <div>
                        <label class="block text-xs uppercase text-gray-500 font-bold mb-1.5">
                            Cargo Personalizado
                            <span class="text-gray-600 font-normal normal-case ml-1">(título criativo, ex: Mestre dos Magos)</span>
                        </label>
                        <input type="text" id="edit-custom-role"
                            class="w-full bg-gray-800 border border-gray-700 focus:border-pink-500 focus:outline-none rounded-lg p-3 text-white transition"
                            placeholder="Deixar vazio para usar o cargo padrão" maxlength="100">
                    </div>

                    <!-- Mensagem de feedback -->
                    <p id="edit-member-msg" class="text-sm text-center hidden"></p>
                </div>

                <!-- Footer do Modal -->
                <div class="p-6 pt-0 flex gap-3">
                    <button onclick="closeEditMember()"
                        class="flex-1 px-4 py-2.5 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition font-medium">
                        Cancelar
                    </button>
                    <button onclick="saveMemberEdit()" id="btn-save-member-edit"
                        class="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-600/20 transition">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
        `;

        // Injetar modal no final do body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // ID do membro atualmente a ser editado (para usar no save)
    let currentEditingMemberId = null;

    /**
     * Abre o modal de edição preenchido com os dados do membro selecionado.
     * SEGURANÇA: Os parâmetros vêm do onclick do card, que já passou por escapeHTML.
     *
     * @param {string} userId      - UUID do utilizador
     * @param {string} username    - Username atual
     * @param {string} role        - Role do sistema atual
     * @param {string} customRole  - Cargo personalizado atual (pode ser vazio)
     */
    async function openEditMember(userId, username, role, customRole) {
        const isFullAdmin = typeof window.isAdmin === 'function' ? await window.isAdmin() : false;
        if (!isFullAdmin) {
            alert("Apenas administradores de topo (Acesso Total) podem criar ou editar membros.");
            return;
        }

        currentEditingMemberId = userId;

        // Preencher dados no modal
        document.getElementById('edit-member-subtitle').textContent = `A editar: ${username || 'Membro'}`;
        document.getElementById('edit-username').value    = username || '';
        document.getElementById('edit-role').value       = role || 'member';
        document.getElementById('edit-custom-role').value = customRole || '';

        // Reset e Fetch de Email (apenas admins completos conseguem sucesso nisto)
        const emailInput = document.getElementById('edit-email');
        emailInput.value = '';
        emailInput.placeholder = 'A carregar email...';

        try {
            // Usa construtor de window global ou a closure atual se disponível
            const spb = window.supabaseClient || window.supabase || supabase;
            const { data: emailData, error: emailError } = await spb.rpc('get_user_email_by_username', { p_username: username });
            
            if (!emailError && emailData) {
                emailInput.value = emailData;
            } else {
                emailInput.placeholder = 'Não disponível (erro ou sem permissão)';
            }
        } catch (e) {
            emailInput.placeholder = 'Erro de ligação';
        }

        // Limpar mensagens de feedback anteriores
        const msg = document.getElementById('edit-member-msg');
        msg.textContent = '';
        msg.className   = 'text-sm text-center hidden';

        // Reset botão
        const btn = document.getElementById('btn-save-member-edit');
        btn.textContent = 'Guardar';
        btn.disabled    = false;

        // Mostrar modal
        document.getElementById('edit-member-modal').classList.remove('hidden');
    }

    /**
     * Fecha o modal de edição e limpa o estado.
     */
    function closeEditMember() {
        document.getElementById('edit-member-modal').classList.add('hidden');
        currentEditingMemberId = null;
    }

    /**
     * Guarda as alterações do membro editado.
     * SEGURANÇA: sanitizeInput em todos os campos antes de enviar ao Supabase.
     * Atualiza: username (+ email interno), role, e custom_role na tabela 'profiles'.
     */
    async function saveMemberEdit() {
        if (!currentEditingMemberId) return;

        const btn = document.getElementById('btn-save-member-edit');
        const msg = document.getElementById('edit-member-msg');

        // SEGURANÇA: sanitizeInput antes de usar
        const newUsername   = sanitizeInput(document.getElementById('edit-username').value, 50);
        const newRole       = document.getElementById('edit-role').value;
        const rawCustomRole = sanitizeInput(document.getElementById('edit-custom-role').value, 100);
        // Cargo personalizado vazio → null (remove o custom_role, volta ao padrão)
        const newCustomRole = rawCustomRole === '' ? null : rawCustomRole;

        if (!newUsername) {
            msg.textContent = 'O username não pode estar vazio.';
            msg.className   = 'text-sm text-center text-red-400';
            return;
        }

        const newEmail = document.getElementById('edit-email').value.trim();
        if (!newEmail || !newEmail.includes('@')) {
            msg.textContent = 'O email fornecido é inválido.';
            msg.className   = 'text-sm text-center text-red-400';
            return;
        }

        // UI: estado de loading
        btn.textContent = 'A guardar...';
        btn.disabled    = true;
        msg.className   = 'text-sm text-center hidden';

        try {
            // 1. Atualizar tabela 'profiles' (role e custom_role)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    username:    newUsername,
                    role:        newRole,
                    custom_role: newCustomRole
                })
                .eq('id', currentEditingMemberId);

            if (profileError) throw profileError;

            // 2. Atualizar o email de autenticação usando a RPC de admin (update_user_email_admin)
            const spb = window.supabaseClient || window.supabase || supabase;
            const { error: emailUpdateError } = await spb.rpc('update_user_email_admin', { 
                p_user_id: currentEditingMemberId, 
                p_new_email: newEmail 
            });

            if (emailUpdateError) {
                // Se o script SQL não estiver instalado, mostra erro educado
                if (emailUpdateError.message.includes("Could not find the function")) {
                    throw new Error("O script SQL de atualização de email ('create_rpc_update_email.sql') não foi corrido no Supabase.");
                } else {
                    throw emailUpdateError;
                }
            }

            // Sucesso
            msg.textContent = '✓ Alterações guardadas com sucesso!';
            msg.className   = 'text-sm text-center text-green-400';

            // Fechar e recarregar lista após 1.2 segundos
            setTimeout(() => {
                closeEditMember();
                initMembers();
            }, 1200);

        } catch (err) {
            console.error("Erro ao guardar membro:", err);
            msg.textContent = 'Erro: ' + err.message;
            msg.className   = 'text-sm text-center text-red-400';

            btn.textContent = 'Tentar Novamente';
            btn.disabled    = false;
        }
    }

    // ------------------------------------------
    // EDIÇÃO DE CARGO (ACESSO RÁPIDO — LEGADO)
    // ------------------------------------------
    /**
     * Atalho rápido para editar cargo via prompt (mantido para compatibilidade).
     * Preferir openEditMember() para edição completa.
     *
     * @param {string} userId      - UUID do utilizador
     * @param {string} currentRole - Cargo atual para pré-preencher o prompt
     */
    async function editMemberRole(userId, currentRole) {
        const newRole = prompt("Definir Cargo Personalizado:", currentRole);
        if (newRole === null) return;

        const sanitized   = sanitizeInput(newRole, 100);
        const updateValue = sanitized === "" ? null : sanitized;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ custom_role: updateValue })
                .eq('id', userId);

            if (error) throw error;

            alert("Cargo atualizado com sucesso!");
            initMembers();

        } catch (err) {
            console.error("Erro ao atualizar cargo:", err);
            alert("Erro ao salvar: " + err.message);
        }
    }

    // ------------------------------------------
    // EXPOSIÇÃO GLOBAL
    // ------------------------------------------
    window.initMembers     = initMembers;
    window.editMemberRole  = editMemberRole;
    window.openEditMember  = openEditMember;
    window.closeEditMember = closeEditMember;
    window.saveMemberEdit  = saveMemberEdit;

})();
