// ==========================================
// MÓDULO: COMISSÕES (FEED & ARTISTAS) - SUPABASE
// ==========================================
// Responsabilidade: Publicar novidades, gerir artistas e os seus termos de comissão.
// Segurança: escapeHTML em renderização de dados da DB (já aplicado em renderCommissionsFeed),
//            sanitizeInput antes de publicar conteúdo no feed,
//            verificação de role na DB (não só user_metadata) em operações críticas.

(function () {

    const supabase = window.supabaseClient;
    let hasCommissionsPermission = false;

    async function initCommissions() {
        console.log("Inicializando Módulo de Comissões (Supabase)...");

        hasCommissionsPermission = typeof window.hasPermission === 'function' ? await window.hasPermission('commissions') : false;

        // Exibir caixa de publicação apenas para gestores de comissões ou admin
        const postBox = document.getElementById('news-post-box');
        if (postBox && hasCommissionsPermission) {
            postBox.classList.remove('hidden');
        }

        // Default Tab
        switchCommissionsTab('registry'); // Mudar para registro por padrão para debug

        await loadLDTerms();
        await renderCommissionsFeed();
        await renderArtistList();
    }

    // ------------------------------------------
    // 1.5. TERMOS & CONDIÇÕES LD (ADMIN ONLY)
    // ------------------------------------------
    /**
     * Guarda os Termos & Condições da LD na base de dados.
     * SEGURANÇA: Verifica role na DB ('profiles') antes de guardar
     *            (mais seguro que confiar apenas em user_metadata, que pode estar desatualizado).
     */
    async function saveLDTerms() {
        if (!hasCommissionsPermission) {
            alert("Apenas O Gestor de Comissões ou Admin podem alterar os termos.");
            return;
        }

        const text = document.getElementById('ld-terms-text').value;
        const btn = document.querySelector('button[onclick="saveLDTerms()"]');
        const originalText = btn.innerText;

        btn.innerText = "Salvando...";
        btn.disabled = true;

        try {
            // Atualiza a linha com ID 1 (Singleton)
            const { error } = await supabase
                .from('commission_terms')
                .update({ content: text, updated_at: new Date() })
                .eq('id', 1);

            if (error) throw error;
            alert("Termos atualizados com sucesso!");

        } catch (err) {
            console.error("Erro ao salvar termos:", err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    async function loadLDTerms() {
        const el = document.getElementById('ld-terms-text');
        if (!el) return;

        const { data, error } = await supabase
            .from('commission_terms')
            .select('content')
            .eq('id', 1)
            .single();

        if (error) {
            console.warn("Termos ainda não definidos ou erro:", error.message);
            el.value = ""; // Deixa vazio ou texto padrão
        } else if (data) {
            el.value = data.content || "";
        }
    }


    // ------------------------------------------
    // 1. NAVEGAÇÃO DE ABAS
    // ------------------------------------------
    /**
     * Muda entre as abas de "Feed" e "Registo de Artistas".
     * Atualiza a UI dos botões e mostra/esconde os conteúdos.
     *
     * @param {string} tabName - Nome da aba: 'feed' | 'registry'
     */
    function switchCommissionsTab(tabName) {
        // Hide all
        document.getElementById('comm-tab-feed').classList.add('hidden');
        document.getElementById('comm-tab-registry').classList.add('hidden');

        // Show selected
        const selected = document.getElementById(`comm-tab-${tabName}`);
        if (selected) selected.classList.remove('hidden');

        // Update Buttons (Visual feedback optional/simplified)
        document.querySelectorAll('.comm-tab-btn').forEach(btn => {
            btn.classList.remove('text-green-400', 'border-b-2', 'border-green-400');
            btn.classList.add('text-gray-400');
        });

        const activeBtn = document.getElementById(`btn-tab-${tabName}`);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-400');
            activeBtn.classList.add('text-green-400', 'border-b-2', 'border-green-400');
        }
    }

    // ------------------------------------------
    // 2. FEED DE NOVIDADES (ADMIN)
    // ------------------------------------------
    /**
     * Publica uma nova novidade no feed de comissões.
     * SEGURANÇA: Verifica role na DB e usa sanitizeInput no texto antes de guardar.
     */
    // 2. FEED DE NOVIDADES (GESTOR)
    // ------------------------------------------
    let editingCommissionId = null;
    let allMembers = [];

    async function postCommission() {
        if (!hasCommissionsPermission) {
            alert("Apenas Gestores de Comissões podem publicar novidades.");
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Tens de estar autenticado.");
            return;
        }

        const textEl = document.getElementById('comm-text');
        // SEGURANÇA: sanitizeInput no texto do feed antes de publicar
        const text = sanitizeInput(textEl.value, 2000);
        if (!text) return alert("Escreva algo para publicar!");

        const btn = document.querySelector('button[onclick="postCommission()"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Processando...";

        try {
            let error;

            if (editingCommissionId) {
                // UPDATE
                const { error: err } = await supabase
                    .from('commission_feed')
                    .update({ content: text })
                    .eq('id', editingCommissionId);
                error = err;
            } else {
                // INSERT
                const { error: err } = await supabase
                    .from('commission_feed')
                    .insert([{
                        content: text,
                        author: user.user_metadata.username || 'Admin'
                    }]);
                error = err;
            }

            if (error) throw error;

            // Reset UI
            textEl.value = "";
            editingCommissionId = null;
            btn.innerText = "Publicar";

            // Remove botão de cancelar se existir (manualmente adicionado ou só resetamos o estado)
            const cancelBtn = document.getElementById('btn-cancel-edit');
            if (cancelBtn) cancelBtn.remove();

            await renderCommissionsFeed();

        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        } finally {
            if (!editingCommissionId) btn.innerText = "Publicar"; // Garante volta ao normal
            btn.disabled = false;
        }
    }

    // Helper para iniciar edição
    window.editCommission = function (id, content) {
        if (!hasCommissionsPermission) {
            alert("Sem permissão para editar publicações.");
            return;
        }
        editingCommissionId = id;
        const textEl = document.getElementById('comm-text');
        textEl.value = content; // Decoded content
        textEl.focus();

        const btn = document.querySelector('button[onclick="postCommission()"]');
        btn.innerText = "Salvar Edição";

        // Adicionar botão de cancelar se não existir
        if (!document.getElementById('btn-cancel-edit')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'btn-cancel-edit';
            cancelBtn.innerText = "Cancelar";
            cancelBtn.className = "text-red-400 text-sm ml-4 hover:underline";
            cancelBtn.onclick = () => {
                editingCommissionId = null;
                textEl.value = "";
                btn.innerText = "Publicar";
                cancelBtn.remove();
            };
            btn.parentNode.appendChild(cancelBtn); // Adiciona ao lado do botão Publicar
        }
    };

    window.deleteCommission = async function (id) {
        if (!hasCommissionsPermission) {
            alert("Sem permissão para apagar publicações.");
            return;
        }
        if (!(await window.customConfirm("Tem certeza que deseja apagar esta publicação?"))) return;

        try {
            const { error } = await supabase
                .from('commission_feed')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await renderCommissionsFeed();
        } catch (err) {
            alert("Erro ao apagar: " + err.message);
        }
    };

    async function renderCommissionsFeed() {
        const container = document.getElementById('commissions-feed');
        if (!container) return;

        container.innerHTML = '<p class="text-gray-500 animate-pulse">Carregando feed...</p>';

        // Check Admin
        // The `isAdmin` variable is only used to show/hide admin actions buttons.
        // The actual permission check for `postCommission`, `editCommission`, `deleteCommission`
        // is now handled by `hasCommissionsPermission` at the function entry.
        // So, `isAdmin` here can be simplified to `hasCommissionsPermission`.
        const isAdmin = hasCommissionsPermission;

        const { data: feed, error } = await supabase
            .from('commission_feed')
            .select('*')
            .order('created_at', { ascending: false });

        container.innerHTML = '';

        if (error) {
            container.innerHTML = '<p class="text-red-400">Erro ao carregar feed.</p>';
            return;
        }

        if (!feed || feed.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic">Nenhuma novidade publicada.</p>';
            return;
        }

        feed.forEach(post => {
            const dateObj = new Date(post.created_at);
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString().slice(0, 5);

            // Botões de Admin
            let adminActions = '';
            if (isAdmin) {
                // Escaping content for the onclick handler correctly is tricky.
                // We'll store content in a data attribute or retrieve it from DOM if simple,
                // but passing it encoded is safer.
                const safeContent = post.content.replace(/"/g, '&quot;').replace(/'/g, "\\'");

                adminActions = `
                    <div class="flex gap-2 ml-4">
                        <button onclick="editCommission(${post.id}, '${safeContent}')" class="text-blue-400 hover:text-blue-300 transition" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onclick="deleteCommission(${post.id})" class="text-red-400 hover:text-red-300 transition" title="Apagar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = 'bg-gray-800 p-4 rounded-xl border border-gray-700 relative group';
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-green-400">${escapeHTML(post.author)}</span>
                        <span class="text-xs text-gray-500">${dateStr}</span>
                    </div>
                    ${adminActions}
                </div>
                <p class="text-gray-300 whitespace-pre-wrap">${escapeHTML(post.content)}</p>
            `;
            container.appendChild(div);
        });
    }


    // ------------------------------------------
    // 3. REGISTO DE ARTISTAS
    // ------------------------------------------
    /**
     * Carrega a lista de membros para o select de Admin.
     */
    async function loadMembers() {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username')
            .order('username');

        if (!error && data) allMembers = data;
    }

    function renderAdminSelect() {
        const container = document.getElementById('artist-name').parentNode;
        // Injetar Select antes do input de nome
        if (!document.getElementById('admin-member-select-container')) {
            const div = document.createElement('div');
            div.id = 'admin-member-select-container';
            div.className = 'mb-4 bg-indigo-900/30 p-3 rounded border border-indigo-500/30';
            div.innerHTML = `
                <label class="block text-indigo-300 text-xs uppercase font-bold mb-1">Selecionar Membro (Admin)</label>
                <select id="admin-member-select" class="w-full bg-gray-900 border border-indigo-500/50 rounded p-2 text-white focus:outline-none" onchange="autoFillArtistName()">
                    <option value="">-- Registar para mim mesmo --</option>
                    ${allMembers.map(m => `<option value="${m.id}" data-name="${escapeHTML(m.username)}">${escapeHTML(m.username)}</option>`).join('')}
                </select>
            `;
            container.insertBefore(div, container.firstChild); // Insert before label
        }
    }

    window.autoFillArtistName = function () {
        const sel = document.getElementById('admin-member-select');
        const nameInput = document.getElementById('artist-name');
        if (sel.value) {
            const text = sel.options[sel.selectedIndex].text;
            nameInput.value = text;
        } else {
            nameInput.value = '';
        }
    };

    async function registerArtist() {
        const name = document.getElementById('artist-name').value;
        const style = document.getElementById('artist-style').value;
        const conditions = document.getElementById('artist-conditions').value;
        const adminSelect = document.getElementById('admin-member-select');

        if (!name || !style || !conditions) return alert("Por favor preencha todos os campos.");

        const { data: { user } } = await supabase.auth.getUser();
        let targetUserId = user ? user.id : null;
        let targetStatus = 'pending';

        // Se Admin selecionou outro usuário
        if (hasCommissionsPermission && adminSelect && adminSelect.value) {
            targetUserId = adminSelect.value;
            targetStatus = 'pending'; // Default to pending, prompt for approval
            if (await window.customConfirm("Como Gestor de Comissões, deseja aprovar automaticamente este artista?")) {
                targetStatus = 'approved';
            }
        }

        try {
            const { error } = await supabase
                .from('commission_artists')
                .insert([{
                    name,
                    style,
                    conditions,
                    user_id: targetUserId,
                    status: targetStatus
                }]);

            if (error) throw error;

            // Clear Form
            document.getElementById('artist-name').value = "";
            document.getElementById('artist-style').value = "";
            document.getElementById('artist-conditions').value = "";
            if (adminSelect) adminSelect.value = "";

            if (targetStatus === 'approved') {
                alert("Artista registado e aprovado com sucesso!");
            } else {
                alert("Inscrição enviada! Aguarde a aprovação.");
            }

            await renderArtistList();

        } catch (err) {
            alert("Erro na inscrição: " + err.message);
        }
    }

    async function renderArtistList() {
        const container = document.getElementById('artists-list');
        if (!container) return;

        const isAdmin = hasCommissionsPermission;

        // Se Admin, carregar lista de membros para o Select (uma vez)
        if (isAdmin && allMembers.length === 0) {
            await loadMembers();
            renderAdminSelect();
        }

        // 2. Buscar Artistas (Revertido para basic select para debug)
        const { data: artists, error } = await supabase
            .from('commission_artists')
            .select('*')
            .order('joined_at', { ascending: false });

        console.log("Artistas carregados:", artists);

        container.innerHTML = '';

        if (error) {
            console.error("Erro ao carregar artistas:", error);
            container.innerHTML = `<div class="bg-red-900 border border-red-500 p-4 rounded col-span-full">
                <p class="font-bold text-red-200">Erro Técnico:</p>
                <code class="text-xs text-red-300 block mt-2">${error.message}</code>
                <p class="text-xs text-red-400 mt-2">Hint: ${error.hint || 'N/A'}</p>
            </div>`;
            return;
        }

        if (!artists || artists.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-center col-span-full">Ainda não há artistas inscritos.</p>';
            return;
        }

        // Check for missing column (Migration check)
        if (typeof artists[0].status === 'undefined') {
            container.innerHTML = `
                <div class="col-span-full bg-red-900/50 p-4 rounded text-center border border-red-500">
                    <p class="font-bold text-red-200">ERRO: Base de dados desatualizada.</p>
                    <p class="text-sm text-red-300">A coluna 'status' não existe. Por favor execute o ficheiro <code>update_commissions_approval.sql</code> no Supabase.</p>
                </div>`;
            return;
        }

        // 3. Separar Pendentes e Aprovados (Tratar null como pending)
        const pending = artists.filter(a => !a.status || a.status === 'pending');
        const approved = artists.filter(a => a.status === 'approved');

        console.log(`Debug: Pendentes=${pending.length}, Aprovados=${approved.length}`);

        // 4. Renderizar Seção de Pendentes (Se houver items retornados pelo RLS)
        if (pending.length > 0) {
            const pendingContainer = document.createElement('div');
            pendingContainer.className = 'col-span-full bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl mb-6';

            const title = isAdmin ?
                `⚠️ Inscrições Pendentes (${pending.length})` :
                `⏳ Minha Inscrição Pendente`;

            pendingContainer.innerHTML = `<h4 class="text-yellow-400 font-bold mb-4 flex items-center gap-2">${title}</h4>`;

            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

            pending.forEach(artist => {
                // Se for admin, mode='pending' (com botões). Se não, 'pending_view' (status apenas).
                const mode = isAdmin ? 'pending' : 'pending_view';
                const card = createArtistCard(artist, mode);
                grid.appendChild(card);
            });

            pendingContainer.appendChild(grid);
            container.appendChild(pendingContainer);
        }

        // 5. Renderizar Aprovados
        approved.forEach(artist => {
            const cardMode = isAdmin ? 'approved_admin' : 'approved_public';
            const card = createArtistCard(artist, cardMode);
            container.appendChild(card);
        });

        if (approved.length === 0 && pending.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-center col-span-full">Nenhum artista encontrado.</p>';
        }
    }

    function createArtistCard(artist, mode) {
        const card = document.createElement('div');
        card.className = 'bg-gray-900 p-4 rounded-lg border border-gray-700/50 hover:border-green-500/30 transition flex flex-col h-full';

        // Botões de Ação
        let actionButtons = '';

        // Modo PENDENTE (Admin): Aprovar / Rejeitar
        if (mode === 'pending') {
            actionButtons = `
                <div class="mt-auto pt-4 flex gap-2 border-t border-gray-800">
                    <button onclick="approveArtist(${artist.id})" class="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded transition">
                        Aprovar
                    </button>
                    <button onclick="rejectArtist(${artist.id})" class="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 rounded transition">
                        Rejeitar
                    </button>
                </div>
            `;
        }
        // Modo PENDENTE (User View)
        else if (mode === 'pending_view') {
            actionButtons = `
                <div class="mt-auto pt-4 border-t border-gray-800 text-center">
                    <span class="text-yellow-500 text-xs font-bold animate-pulse">
                        Aguardando Aprovação...
                    </span>
                </div>
            `;
        }
        // Modo APROVADO (Admin): Remover
        else if (mode === 'approved_admin') {
            actionButtons = `
                <div class="mt-auto pt-4 border-t border-gray-800 flex justify-end">
                    <button onclick="removeArtist(${artist.id})" class="text-red-500 hover:text-red-400 text-xs font-bold flex items-center gap-1 transition">
                        <!-- Icone Lixo (Material Design) -->
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Remover
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <div class="bg-gradient-to-br from-green-500 to-teal-600 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg shrink-0">
                    ${escapeHTML(artist.name.charAt(0).toUpperCase())}
                </div>
                <div class="min-w-0">
                    <h4 class="font-bold text-white truncate">${escapeHTML(artist.name)}</h4>
                    <p class="text-xs text-green-400 font-mono truncate">${escapeHTML(artist.style)}</p>
                </div>
            </div>
            <div class="text-sm text-gray-400 bg-gray-800/50 p-2 rounded mb-2 h-24 overflow-y-auto custom-scrollbar">
                <p class="font-bold text-xs text-gray-500 uppercase mb-1">Condições:</p>
                ${escapeHTML(artist.conditions)}
            </div>
            <p class="text-xs text-gray-600 text-right mt-auto">Inscrito em ${new Date(artist.joined_at).toLocaleDateString()}</p>
            ${actionButtons}
        `;
        return card;
    }

    async function approveArtist(id) {
        if (!(await window.customConfirm("Aprovar este artista?"))) return;
        try {
            const { error } = await supabase
                .from('commission_artists')
                .update({ status: 'approved' })
                .eq('id', id);

            if (error) throw error;
            await renderArtistList();
        } catch (err) {
            alert("Erro ao aprovar: " + err.message);
        }
    }

    async function rejectArtist(id) {
        if (!(await window.customConfirm("Rejeitar e remover esta inscrição?"))) return;
        try {
            const { error } = await supabase
                .from('commission_artists')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await renderArtistList();
        } catch (err) {
            alert("Erro ao rejeitar: " + err.message);
        }
    }

    async function removeArtist(id) {
        if (!(await window.customConfirm("Tem certeza que deseja remover este artista da lista?"))) return;
        try {
            const { error } = await supabase
                .from('commission_artists')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await renderArtistList();
        } catch (err) {
            alert("Erro ao remover: " + err.message);
        }
    }

    // Expor variáveis globais
    window.initCommissions = initCommissions;
    window.postCommission = postCommission;
    window.registerArtist = registerArtist;
    window.switchCommissionsTab = switchCommissionsTab;
    window.saveLDTerms = saveLDTerms;
    window.approveArtist = approveArtist;
    window.rejectArtist = rejectArtist;
    window.removeArtist = removeArtist;


})();
