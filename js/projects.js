// ==========================================
// MÓDULO: GESTÃO DE PROJETOS (SUPABASE SQL)
// ==========================================
// Responsabilidade: Criar, editar, visualizar e apagar projetos do grupo.
// Cada projeto pode ter metas (project_reports) e membros (project_members).
// Segurança: escapeHTML em todos os innerHTML com dados da DB,
//            sanitizeInput antes de enviar dados para o Supabase.

(function () {
    console.log(">>> MODULO PROJECTS.JS CARREGADO <<<");

    // ------------------------------------------
    // INICIALIZAÇÃO DO SUPABASE
    // ------------------------------------------
    // NOTA: Supabase Client partilhado globalmente. Apenas referência local para evitar colisões.
    const supabaseUrl = "https://matqihrnhwvkbgldocxz.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ";

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    // Escopo Local
    const supabase = window.supabaseClient;

    // Cache local para UI (evita re-fetch desnecessário)
    let cachedProjects = [];
    let allMembers = [];
    let tempReports = []; // Metas temporárias no modal (antes de salvar)
    let tempSelectedMembers = new Set(); // UUIDs dos membros selecionados no modal
    let currentEditingId = null; // ID do projeto em edição (null = modo criação)

    // Role e ID do utilizador atual
    // Atualizado em initProjects() após verificação na DB
    let currentUserRole = 'member';
    let currentUserId = null;
    let hasProjectsPermission = false;

    // ==========================================
    // 1. INICIALIZAÇÃO
    // ==========================================

    // ------------------------------------------
    // 1. INICIALIZAÇÃO
    // ------------------------------------------
    /**
     * Ponto de entrada do módulo de projetos.
     * Carrega a role do utilizador, ajusta a UI conforme permissões
     * e busca todos os projetos da base de dados.
     */
    async function initProjects() {
        console.log("Inicializando Projetos (Via SQL)...");

        // 1. Identificar Role do Utilizador (sempre consultar a DB, mais seguro que só metadata)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUserId = user.id;
            const { data: dbProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            currentUserRole = dbProfile?.role || user.user_metadata.role || 'member';
            console.log("Role atual em Projetos:", currentUserRole);
        }

        // 2. Mostrar/Esconder botões conforme role
        const btnNew = document.getElementById('btn-add-project');
        const btnTrash = document.getElementById('btn-trash-projects');
        
        hasProjectsPermission = typeof window.hasPermission === 'function' ? await window.hasPermission('projects') : (currentUserRole === 'admin');

        if (hasProjectsPermission) {
            if (btnNew) btnNew.classList.remove('hidden');
            if (btnTrash) btnTrash.classList.remove('hidden');
            document.body.classList.add('admin-mode');
        } else {
            if (btnNew) btnNew.classList.add('hidden');
            if (btnTrash) btnTrash.classList.add('hidden');
            document.body.classList.remove('admin-mode');
        }

        await loadMembers(); // Carrega lista de membros para o modal
        await loadProjects(); // Carrega projetos do Supabase
        setupProjectModal();
    }

    async function loadMembers() {
        // Apenas carrega se for necessário (embora para visualizar nomes nos cards seja útil ter cache, 
        // mas aqui carregamos tudo da tabela profiles. Se for pesado, refatorar depois.)
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, role')
            .order('username');

        if (error) console.error("Erro ao carregar membros:", error);
        else allMembers = data || [];
    }

    async function loadProjects() {
        const listContainer = document.getElementById('projects-list');
        if (!listContainer) return;

        listContainer.innerHTML = '<p class="text-gray-500 animate-pulse">A carregar da base de dados...</p>';

        // Fetch Relacional: Projetos + Reports + Members
        // Nota: Supabase retorna relacionamentos aninhados se as foreign keys existirem
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                project_reports (*),
                project_members (
                    user_id,
                    role,
                    profiles (username)
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Erro SQL:", error);
            listContainer.innerHTML = `<p class="text-red-400">Erro ao carregar projetos: ${error.message}</p>`;
            return;
        }

        cachedProjects = data || [];
        renderProjectsList();
    }

    // ------------------------------------------
    // 2. RENDERIZAÇÃO DA LISTA DE PROJETOS
    // ------------------------------------------
    /**
     * Renderiza os cartões de projeto no container da lista.
     * SEGURANÇA: escapeHTML em todos os textos vindos da DB (title, description, usernames).
     */
    function renderProjectsList() {
        const listContainer = document.getElementById('projects-list');
        listContainer.innerHTML = '';

        if (cachedProjects.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum projeto encontrado para si.</p>';
            return;
        }

        // Remover os projetos que estão na lixeira (is_deleted = true)
        let activeProjects = cachedProjects.filter(p => p.is_deleted !== true);

        // SEGURANÇA VISUAL: Gestores vêem todos os projetos ativos, Membros apenas aqueles em que foram atribuídos.
        let projectsToRender = activeProjects;
        if (!hasProjectsPermission && currentUserId) {
            projectsToRender = activeProjects.filter(project => {
                const members = project.project_members || [];
                // if project has current user ID in its members list, keep it
                return members.some(m => m.user_id === currentUserId);
            });
        }

        if (projectsToRender.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum projeto encontrado para si.</p>';
            return;
        }

        projectsToRender.forEach(project => {
            const card = document.createElement('div');
            card.className = 'bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition group relative flex flex-col h-full';

            // Helpers de Status
            const statusMap = {
                'planejamento': { text: 'Planejamento', color: 'text-yellow-400 bg-yellow-500/10' },
                'em_andamento': { text: 'Em Andamento', color: 'text-blue-400 bg-blue-500/10' },
                'concluido': { text: 'Concluído', color: 'text-green-400 bg-green-500/10' },
                'atrasado': { text: 'Atrasado', color: 'text-red-400 bg-red-500/10' }
            };
            const st = statusMap[project.status] || statusMap['planejamento'];

            // Metas
            const reports = project.project_reports || [];
            const completedReports = reports.filter(r => r.is_completed).length;

            // Avatares dos membros (inicial do username)
            // SEGURANÇA: escapeHTML no username e no role (dados vindos da DB)
            const membersHtml = allMembers.map(m => {
                const name = m.profiles?.username || "?";
                return `<span class="inline-block bg-gray-700 rounded-full px-2 py-0.5 text-xs text-gray-300" title="${escapeHTML(m.role)}">${escapeHTML(name[0].toUpperCase())}</span>`;
            }).join('');

            // Botões de Ação (Apenas Admin ou Gestor de Projetos)
            let actionButtons = '';
            if (hasProjectsPermission) {
                actionButtons = `
                    <div class="flex gap-2">
                        <button onclick="openEditProject(${project.id})" class="text-gray-500 hover:text-blue-400 transition" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onclick="deleteProject(${project.id})" class="text-gray-500 hover:text-red-400 transition" title="Apagar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                `;
            }

            // SEGURANÇA: escapeHTML em title e description antes de injetar no DOM
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-xl font-bold text-white group-hover:text-blue-300 transition line-clamp-1">${escapeHTML(project.title)}</h3>
                    ${actionButtons}
                </div>
                
                <p class="text-gray-400 text-sm mb-6 line-clamp-3">${escapeHTML(project.description || 'Sem descrição.')}</p>
                
                <div class="mt-auto space-y-4">
                    <!-- Membros -->
                    <div class="flex -space-x-2 overflow-hidden">
                        ${membersHtml || '<span class="text-xs text-gray-600 italic">Sem equipe</span>'}
                        ${allMembers.length > 0 ? `<div class="bg-gray-800 rounded-full px-2 py-0.5 text-xs text-gray-500 border border-gray-700 ml-2">+${allMembers.length}</div>` : ''}
                    </div>

                    <div class="flex items-center justify-between border-t border-gray-700 pt-4">
                        <span class="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${st.color}">
                            ${st.text}
                        </span>
                        ${hasProjectsPermission ? `
                        <span class="text-xs text-gray-400 font-mono">
                            ${completedReports}/${reports.length} Metas
                        </span>` : ''}
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    // ==========================================
    // 3. MODAL DE EDIÇÃO E FORMULÁRIO
    // ==========================================

    function setupProjectModal() {
        if (document.getElementById('project-modal')) return;

        const modalHTML = `
            <div id="project-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] hidden flex items-center justify-center p-4">
                <div class="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
                    
                    <div class="p-6 border-b border-gray-800 flex justify-between items-center sticky top-0 bg-gray-900 z-10">
                        <h3 id="modal-title" class="text-2xl font-bold text-white">Project Editor</h3>
                        <button onclick="closeProjectModal()" class="text-gray-500 hover:text-white">✕</button>
                    </div>

                    <div class="p-6 space-y-6">
                        <!-- Basic Info -->
                        <div class="grid grid-cols-1 gap-4">
                            <div>
                                <label class="block text-gray-400 text-sm mb-1">Título</label>
                                <input type="text" id="proj-title" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-gray-400 text-sm mb-1">Descrição</label>
                                <textarea id="proj-desc" rows="2" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500"></textarea>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-gray-400 text-sm mb-1">Status</label>
                                <select id="proj-status" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500">
                                    <option value="planejamento">Planejamento</option>
                                    <option value="em_andamento">Em Andamento</option>
                                    <option value="concluido">Concluído</option>
                                    <option value="atrasado">Atrasado</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-gray-400 text-sm mb-1">Deadline</label>
                                <input type="date" id="proj-deadline" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500">
                            </div>
                        </div>

                        <!-- Member Selection -->
                        <div class="border-t border-gray-800 pt-4">
                            <h4 class="text-sm font-bold text-gray-300 mb-2">Equipe do Projeto</h4>
                            <div id="members-selection-list" class="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-gray-950/50 rounded border border-gray-800">
                                <!-- Injected by JS -->
                            </div>
                        </div>

                        <!-- Metas -->
                        <div class="border-t border-gray-800 pt-4">
                            <h4 class="text-sm font-bold text-blue-400 mb-2">Metas & Marcos</h4>
                            <div id="reports-list" class="space-y-2 mb-3"></div>
                            
                            <div class="flex gap-2">
                                <input type="text" id="report-content" placeholder="Nova meta..." class="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500">
                                <button onclick="addReport()" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-white">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 border-t border-gray-800 flex justify-end gap-3 sticky bottom-0 bg-gray-900">
                        <button onclick="closeProjectModal()" class="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                        <button onclick="saveProjectSQL()" id="btn-save-proj" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg shadow-blue-600/20">
                            Salvar Projeto
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function openEditProject(id = null) {
        if (!hasProjectsPermission) {
            alert("Apenas O Gestor de Projetos ou Admin Principal podem criar ou editar projetos.");
            return;
        }

        currentEditingId = id;
        const modal = document.getElementById('project-modal');
        const titleEl = document.getElementById('modal-title');

        // Reset Data
        tempReports = [];
        tempSelectedMembers.clear();

        // Reset UI Inputs
        document.getElementById('proj-title').value = "";
        document.getElementById('proj-desc').value = "";
        document.getElementById('proj-status').value = "planejamento";
        document.getElementById('proj-deadline').value = "";
        document.getElementById('report-content').value = "";

        if (id) {
            // Modo Edição
            titleEl.innerText = "Editar Projeto";
            const project = cachedProjects.find(p => p.id === id);

            if (project) {
                document.getElementById('proj-title').value = project.title;
                document.getElementById('proj-desc').value = project.description || "";
                document.getElementById('proj-status').value = project.status;
                document.getElementById('proj-deadline').value = project.deadline || "";

                // Carregar Metas
                tempReports = [...(project.project_reports || [])];

                // Carregar Membros Atuais
                if (project.project_members) {
                    project.project_members.forEach(pm => tempSelectedMembers.add(pm.user_id));
                }
            }
        } else {
            titleEl.innerText = "Novo Projeto";
        }

        renderReportsList();
        renderMembersSelection();
        modal.classList.remove('hidden');
    }

    function renderMembersSelection() {
        const container = document.getElementById('members-selection-list');
        container.innerHTML = '';

        if (allMembers.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-500 col-span-full">Nenhum membro disponível.</p>';
            return;
        }

        allMembers.forEach(member => {
            const isSelected = tempSelectedMembers.has(member.id);
            const div = document.createElement('div');
            div.className = `cursor-pointer p-2 rounded border text-xs flex items-center gap-2 transition select-none ${isSelected ? 'bg-blue-600/20 border-blue-500 text-blue-200' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`;
            div.onclick = () => toggleMemberSelection(member.id);

            // SEGURANÇA: escapeHTML no username antes de injetar no DOM
            div.innerHTML = `
                <div class="w-3 h-3 rounded-full border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}"></div>
                <span class="truncate font-bold">${escapeHTML(member.username)}</span>
            `;
            container.appendChild(div);
        });
    }

    function toggleMemberSelection(userId) {
        if (tempSelectedMembers.has(userId)) {
            tempSelectedMembers.delete(userId);
        } else {
            tempSelectedMembers.add(userId);
        }
        renderMembersSelection();
    }

    // 4. LÓGICA DE SALVAMENTO SQL (COMPLEXA)
    async function saveProjectSQL() {
        // Segurança Extra
        if (currentUserRole !== 'admin') {
            alert("Sem permissão.");
            return;
        }

        const btn = document.getElementById('btn-save-proj');
        const originalText = btn.innerText;
        btn.innerText = "A Salvar...";
        btn.disabled = true;

        try {
        // ------------------------------------------
        // VALIDAÇÃO E SANITIZAÇÃO DOS INPUTS
        // ------------------------------------------
        // SEGURANÇA: sanitizeInput() limpa e trunca os valores antes de enviar para o Supabase.
        // Isto previne dados malformados e limita o tamanho máximo dos campos.
        const rawTitle = document.getElementById('proj-title').value;
        const title = sanitizeInput(rawTitle, 150);
        if (!title) throw new Error("Título é obrigatório.");

        const projectData = {
            title: title,
            description: sanitizeInput(document.getElementById('proj-desc').value, 1000),
            status: document.getElementById('proj-status').value,
            deadline: document.getElementById('proj-deadline').value || null
        };

            let projectId = currentEditingId;

            // A. Salvar/Criar PROJETO
            if (projectId) {
                const { error } = await supabase.from('projects').update(projectData).eq('id', projectId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('projects').insert([projectData]).select();
                if (error) throw error;
                projectId = data[0].id;
            }

            // B. Salvar MEMBROS (Diffing simples: apaga todos e recria, ou upsert)
            // Para simplificar: apagar relações antigas e inserir novas
            // Nota: Em prod seria melhor um diff inteligente, mas aqui serve.

            // 1. Apagar membros atuais
            await supabase.from('project_members').delete().eq('project_id', projectId);

            // 2. Inserir selecionados
            if (tempSelectedMembers.size > 0) {
                const membersPayload = Array.from(tempSelectedMembers).map(uid => ({
                    project_id: projectId,
                    user_id: uid,
                    role: 'member'
                }));
                const { error: memError } = await supabase.from('project_members').insert(membersPayload);
                if (memError) throw memError;
            }

            // C. Salvar METAS (Relatórios)
            // Mesmo esquema: Deletar tudo e recriar é perigoso se tiver histórico.
            // Vamos usar UPSERT para as que tem ID, e INSERT para novas.

            // C1. Upsert (Novas e Editadas)
            for (const report of tempReports) {
                const reportPayload = {
                    project_id: projectId,
                    report_content: report.report_content,
                    is_completed: report.is_completed,
                    milestone_date: report.milestone_date || null
                };

                // Se tem ID real (não timestamp temp), é update
                if (report.id && typeof report.id === 'number' && report.id < 1000000000000) {
                    await supabase.from('project_reports').update(reportPayload).eq('id', report.id);
                } else {
                    await supabase.from('project_reports').insert([reportPayload]);
                }
            }

            // Nota: Remoção de metas teria de ser tratada explicitamente (lista de IDs deletados).
            // Por agora, assumimos que 'deleteReport' faz a deleção imediata no DB.

            alert("Projeto salvo com sucesso!");
            closeProjectModal();
            await loadProjects(); // Recarrega tudo

        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Erro: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    // ------------------------------------------
    // 5. METAS DO PROJETO (HELPER)
    // ------------------------------------------
    /**
     * Adiciona uma nova meta temporária à lista do modal.
     * A meta só é gravada no DB quando o utilizador clicar "Salvar Projeto".
     */
    function addReport() {
        const rawContent = document.getElementById('report-content').value;
        // SEGURANÇA: sanitizeInput antes de adicionar à lista temporária
        const content = sanitizeInput(rawContent, 300);
        if (!content) return;

        // Adicionar localmente com ID temporário baseado em timestamp (substituído no save)
        tempReports.push({
            id: Date.now(),
            report_content: content,
            is_completed: false
        });
        document.getElementById('report-content').value = "";
        renderReportsList();
    }

    /**
     * Renderiza a lista de metas no modal.
     * SEGURANÇA: escapeHTML no conteúdo da meta antes de injetar no DOM.
     */
    function renderReportsList() {
        const container = document.getElementById('reports-list');
        container.innerHTML = '';

        tempReports.forEach((r, index) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-gray-950 p-2 rounded border border-gray-800 text-sm";
            // SEGURANÇA: escapeHTML no conteúdo da meta (pode ser digitado pelo utilizador)
            div.innerHTML = `
                <span>${escapeHTML(r.report_content)}</span>
                <button onclick="removeTempReport(${index})" class="text-red-500 hover:text-red-400">✕</button>
            `;
            container.appendChild(div);
        });
    }

    async function removeTempReport(index) {
        const r = tempReports[index];
        // Se já existe no banco (ID pequeno), apagar via SQL imediatamente?
        // Ou marcar para deletar? Para simplificar, apagamos via SQL se não for temp.
        if (r.id && r.id < 1000000000000) {
            if (await window.customConfirm("Apagar esta meta do banco de dados?")) {
                supabase.from('project_reports').delete().eq('id', r.id).then(() => {
                    tempReports.splice(index, 1);
                    renderReportsList();
                });
            }
        } else {
            tempReports.splice(index, 1);
            renderReportsList();
        }
    }


    // 6. APAGAR PROJETO (SOFT DELETE - MOVER PARA LIXEIRA)
    async function deleteProject(id) {
        if (!hasProjectsPermission) {
            alert("Sem permissão para apagar projetos.");
            return;
        }

        if (!(await window.customConfirm("Enviar este projeto para a lixeira?"))) return;

        try {
            // Soft delete: atualizar is_deleted para true em vez de deletar
            const { error } = await supabase.from('projects').update({ is_deleted: true }).eq('id', id);
            if (error) throw error;

            await loadProjects();
        } catch (err) {
            alert("Erro ao apagar: " + err.message);
        }
    }


    function closeProjectModal() {
        document.getElementById('project-modal').classList.add('hidden');
    }

    // ==========================================
    // 7. GESTÃO DA LIXEIRA DE PROJETOS
    // ==========================================
    
    function openTrashProjects() {
        if (!hasProjectsPermission) return;
        document.getElementById('trash-modal').classList.remove('hidden');
        loadTrashList();
    }

    function closeTrashProjects() {
        document.getElementById('trash-modal').classList.add('hidden');
    }

    function loadTrashList() {
        const trashContainer = document.getElementById('trash-list');
        const trashCount = document.getElementById('trash-count');
        
        // Filtra da cache já carregada os que estão apagados
        const trashProjects = cachedProjects.filter(p => p.is_deleted === true);
        
        if (trashCount) trashCount.innerText = `${trashProjects.length} projetos`;

        if (trashProjects.length === 0) {
            trashContainer.innerHTML = '<p class="text-gray-500 italic text-center text-sm py-4">A Lixeira está vazia.</p>';
            return;
        }

        trashContainer.innerHTML = '';
        trashProjects.forEach(proj => {
            const div = document.createElement('div');
            div.className = "flex flex-col sm:flex-row justify-between sm:items-center bg-gray-950 p-4 rounded-xl border border-gray-800 gap-4";
            
            const content = document.createElement('div');
            content.innerHTML = `
                <h4 class="text-white font-bold">${escapeHTML(proj.title)}</h4>
                <p class="text-xs text-gray-500">Adicionado a ${new Date(proj.created_at).toLocaleDateString()}</p>
            `;
            
            const actions = document.createElement('div');
            actions.className = "flex gap-2";
            actions.innerHTML = `
                <button onclick="restoreProject(${proj.id})" class="text-xs bg-gray-800 hover:bg-gray-700 text-green-400 px-3 py-1.5 rounded transition font-bold" title="Restaurar Projeto">
                    Restaurar
                </button>
                <button onclick="permDeleteProject(${proj.id})" class="text-xs bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 px-3 py-1.5 rounded transition font-bold" title="Apagar para Sempre">
                    Apagar Para Sempre
                </button>
            `;
            
            div.appendChild(content);
            div.appendChild(actions);
            trashContainer.appendChild(div);
        });
    }

    async function restoreProject(id) {
        if (!(await window.customConfirm("Restaurar este projeto? Ele voltará a ficar ativo."))) return;
        try {
            const { error } = await supabase.from('projects').update({ is_deleted: false }).eq('id', id);
            if (error) throw error;
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('success', 'Restaurado', 'O projeto foi restaurado com sucesso.');
            await loadProjects(); // Recarrega do zero update cache local
            loadTrashList(); // atualiza vista lixeira
        } catch (err) {
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('error', 'Erro', err.message);
            else alert(err.message);
        }
    }

    async function permDeleteProject(id) {
        if (!(await window.customConfirm("Atenção: Ações permanentes não podem ser desfeitas. Deseja MESMO apagar este projeto do seu banco de dados?"))) return;
        try {
            const { error } = await supabase.from('projects').delete().eq('id', id);
            if (error) throw error;
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('success', 'Apagado', 'Projeto destruído para sempre.');
            await loadProjects();
            loadTrashList();
        } catch (err) {
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('error', 'Erro', err.message);
            else alert(err.message);
        }
    }

    async function emptyTrash() {
        const trashProjects = cachedProjects.filter(p => p.is_deleted === true);
        if (trashProjects.length === 0) return;
        
        if (!(await window.customConfirm(`Tem a certeza que quer esvaziar a lixeira e apagar TODOS os ${trashProjects.length} projetos para sempre?`))) return;
        
        try {
            // Se is_deleted fosse uma flag em tabela podemos fazer delete onde is_deleted=true
            const { error } = await supabase.from('projects').delete().eq('is_deleted', true);
            if (error) throw error;
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('success', 'Lixeira Vazia', 'Todos os projetos na lixeira foram removidos da base de dados.');
            await loadProjects();
            loadTrashList();
        } catch(err) {
            if (typeof window.showFeedbackModal === 'function') window.showFeedbackModal('error', 'Erro', err.message);
            else alert(err.message);
        }
    }

    // Expor Globais para o Window
    window.initProjects = initProjects;
    window.addProject = () => openEditProject(null);
    window.openEditProject = openEditProject;
    window.closeProjectModal = closeProjectModal;
    window.saveProjectSQL = saveProjectSQL;
    window.addReport = addReport;
    window.removeTempReport = removeTempReport;
    window.deleteProject = deleteProject;
    window.toggleMemberSelection = toggleMemberSelection;
    window.openTrashProjects = openTrashProjects;
    window.closeTrashProjects = closeTrashProjects;
    window.restoreProject = restoreProject;
    window.permDeleteProject = permDeleteProject;
    window.emptyTrash = emptyTrash;

})();
