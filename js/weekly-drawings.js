// ==========================================
// MÓDULO: DESENHOS / TEMAS (CALENDÁRIO DE FAIXAS) - SUPABASE
// ==========================================
// Responsabilidade: Gerir temas semanais de desenho e registar entregas dos membros.
// Segurança: escapeHTML em todos os innerHTML com dados de utilizadores,
//            sanitizeInput antes de gravar temas no Supabase.

(function () {
    console.log(">>> MODULO WEEKLY-DRAWINGS.JS CARREGADO <<<");

    // Supabase Init (Robustez)
    const supabaseUrl = "https://matqihrnhwvkbgldocxz.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ";

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    const supabase = window.supabaseClient;

    // Estado Local
    const systemYear = new Date().getFullYear();
    let displayYear  = systemYear; // Ano atualmente exibido no calendário (mudado por changeYear())
    let cachedThemes = []; // Cache para evitar re-fetch constante no calendário
    let editingThemeId = null;
    let allMembersForSubmissions = [];
    let currentThemeSubmissions = new Set(); // IDs dos utilizadores que entregaram
    let hasWeeklyPermission = false;

    const monthNames = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    // ==========================================
    // 0. INICIALIZAÇÃO ASYNC
    // ==========================================

    async function initWeeklyDrawings() {
        console.log("Inicializando Calendário de Temas (Supabase)...");

        // 1. Controle de Permissão UI
        hasWeeklyPermission = typeof window.hasPermission === 'function' ? await window.hasPermission('weekly') : false;

        const btnAdd = document.getElementById('btn-add-theme');
        if (btnAdd) {
            if (!hasWeeklyPermission) {
                btnAdd.classList.add('hidden');
            } else {
                btnAdd.classList.remove('hidden');
            }
        }

        await loadThemes(); // Carrega do DB
        await loadAllMembers(); // Carrega todos os membros para a checklist
        renderWidgets();
        renderFullCalendar(displayYear);
        setupThemeModal();

        // Mostrar painel de entregas apenas para admins
        if (role === 'admin') {
            const panel = document.getElementById('submissions-panel');
            if (panel) panel.classList.remove('hidden');
            populateThemeSelector();
        }
    }

    async function loadAllMembers() {
        // Carrega todos perfis apenas para listar no modal
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username')
            .order('username');
        if (!error && data) {
            allMembersForSubmissions = data;
        }
    }

    async function loadThemes() {
        // Carrega TODOS os temas (ou filtrar por ano atual/futuro se ficar pesado)
        const { data, error } = await supabase
            .from('weekly_themes')
            .select('*')
            .order('start_date', { ascending: true }); // Ordena por data

        if (error) {
            console.error("Erro ao carregar temas:", error);
            // Fallback silencioso ou alerta?
        } else {
            cachedThemes = data || [];
            console.log("Temas carregados:", cachedThemes.length);
            // Atualizar o selector de temas se o painel estiver visível
            populateThemeSelector();
        }
    }

    function changeYear(delta) {
        displayYear += delta;
        renderFullCalendar(displayYear);
    }


    // ==========================================
    // 1. RENDERIZAÇÃO DE WIDGETS
    // ==========================================

    function renderWidgets() {
        // A. Semestre
        const currentMonthIndex = new Date().getMonth();
        const isFirstSem = currentMonthIndex < 6;
        const semText = isFirstSem ? "1º Semestre (Jan - Jun)" : "2º Semestre (Jul - Dez)";

        // Progresso semestral
        const semStart = isFirstSem ? 0 : 6;
        const progress = Math.min(100, Math.max(0, ((currentMonthIndex - semStart + 1) / 6) * 100));

        const semDisplay = document.getElementById('semester-widget');
        if (semDisplay) {
            semDisplay.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="p-3 bg-gray-700 rounded-lg text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase font-bold tracking-wider">Semestre Atual</p>
                            <p class="text-xl font-bold text-white">${semText}</p>
                        </div>
                    </div>
                    <div class="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500 rounded-full" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        }

        // B. Tema Atual / Próximo
        const activeTheme = getActiveOrNextTheme();
        const themeDisplay = document.getElementById('next-theme-widget');

        if (themeDisplay) {
            if (activeTheme) {
                const isActiveNow = isDateInRange(new Date(), activeTheme.start_date, activeTheme.end_date);
                const statusLabel = isActiveNow ? "Tema Atual" : "Próximo Tema";
                const colorClass = isActiveNow ? "text-green-300" : "text-indigo-300";
                const bgClass = isActiveNow ? "bg-green-500/20" : "bg-indigo-500/20";

                themeDisplay.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="p-3 ${bgClass} rounded-lg ${colorClass}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-xs ${colorClass} uppercase font-bold tracking-wider">${statusLabel}</p>
                            <p class="text-lg font-bold text-white truncate w-48" title="${activeTheme.title}">${activeTheme.title}</p>
                            <p class="text-xs text-gray-400">${formatDate(activeTheme.start_date)} - ${formatDate(activeTheme.end_date)}</p>
                        </div>
                    </div>
                `;
            } else {
                themeDisplay.innerHTML = `
                    <div class="flex items-center gap-4">
                         <div class="p-3 bg-gray-700 rounded-lg text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        </div>
                        <p class="text-gray-400">Nenhum tema agendado.</p>
                    </div>
                 `;
            }
        }
    }

    // ==========================================
    // 2. CALENDÁRIO MENSAL (GRID VIEW)
    // ==========================================

    function renderFullCalendar(year) {
        const container = document.getElementById('annual-calendar');
        if (!container) return;

        // ATUALIZAÇÃO DO ANO NA UI
        const yearDisplay = document.getElementById('calendar-year-display');
        if (yearDisplay) yearDisplay.innerText = year;

        // Se for mobile, usar grid de 1 coluna, senão responsivo
        container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";
        container.innerHTML = '';

        // Usa cachedThemes carregados do Supabase
        const themes = cachedThemes;

        for (let m = 0; m < 12; m++) {
            const monthDiv = document.createElement('div');
            monthDiv.className = 'bg-gray-800 rounded-xl p-4 border border-gray-700';

            // Header Mês
            const header = document.createElement('div');
            header.className = "text-center mb-3";
            header.innerHTML = `<h3 class="text-gray-300 font-bold">${monthNames[m]}</h3>`;
            monthDiv.appendChild(header);

            // Grid Dias (Domingo a Sábado)
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-7 gap-1 text-xs text-center";

            // Cabeçalho Dias da Semana
            const dow = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
            dow.forEach(d => {
                grid.innerHTML += `<div class="text-gray-600 font-bold py-1">${d}</div>`;
            });

            // Loop dias
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            const firstDayDow = new Date(year, m, 1).getDay(); // 0 = Domingo

            // Espaços vazios antes do dia 1
            for (let i = 0; i < firstDayDow; i++) {
                grid.innerHTML += `<div></div>`;
            }

            // Dias Reais
            for (let d = 1; d <= daysInMonth; d++) {
                const currentDateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const currentDateObj = new Date(year, m, d);

                // Verifica se este dia tem tema (Cache Local)
                // Nota: Supabase retorna datas como string YYYY-MM-DD
                const theme = themes.find(t => isDateInRange(currentDateObj, t.start_date, t.end_date));

                let classes = "h-8 flex items-center justify-center rounded cursor-pointer transition relative group ";
                let inner = `<span class="z-10 relative">${d}</span>`;

                if (theme) {
                    // Visual Faixa
                    classes += "bg-blue-600 text-white hover:bg-blue-500 ";

                    // SEGURANÇA: escapeHTML no título do tema (dado vindo da DB)
                    inner += `
                      <div class="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white text-xs p-2 rounded whitespace-nowrap z-20 shadow-xl border border-gray-700">
                        ${escapeHTML(theme.title)}
                      </div>
                    `;
                } else {
                    classes += "text-gray-400 hover:bg-gray-700 hover:text-white ";
                }

                // Dia Atual
                const todayStr = new Date().toISOString().split('T')[0];
                if (currentDateStr === todayStr) {
                    classes += " border border-yellow-500/50";
                }

                const dayEl = document.createElement('div');
                dayEl.className = classes;
                dayEl.innerHTML = inner;

                // Clique para adicionar ou editar
                dayEl.onclick = () => {
                    if (theme) {
                        editTheme(theme);
                    } else {
                        // Apenas Admin abre modal de novo (checagem interna do modal tbm)
                        openNewThemeModal(currentDateStr);
                    }
                };

                grid.appendChild(dayEl);
            }

            monthDiv.appendChild(grid);
            container.appendChild(monthDiv);
        }
    }

    // ==========================================
    // 3. STORAGE E LÓGICA DE DATAS
    // ==========================================

    function isDateInRange(checkDate, startStr, endStr) {
        // Normaliza checkDate para meia-noite UTC para comparar com Strings de data
        // Mas como startStr vem YYYY-MM-DD, vamos comparar strings ou timestamps zerados
        const c = normalizeDate(checkDate).getTime();
        const s = new Date(startStr).getTime(); // date string parsing assumes UTC usually or local, careful
        const e = new Date(endStr).getTime();

        // Melhor abordagem para evitar fusos: comparar strings YYYY-MM-DD
        // const cStr = checkDate.toISOString().split('T')[0];
        // return cStr >= startStr && cStr <= endStr;

        // Mantendo compatível com o existente mas corrigindo parse:
        // Supabase Date type = YYYY-MM-DD. new Date("2024-01-01") é UTC.
        // new Date() é local.

        // Simplificação: Timestamp
        return c >= s && c <= e;
    }

    function normalizeDate(date) {
        // Retorna data zerada para comparação justa (ignorando hora)
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getActiveOrNextTheme() {
        const now = new Date().getTime();

        // Filtra temas não passados (ou atual)
        const upcoming = cachedThemes.filter(t => new Date(t.end_date).getTime() >= now);

        // Ordena por data de início
        upcoming.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        return upcoming.length > 0 ? upcoming[0] : null;
    }

    function formatDate(isoStr) {
        if (!isoStr) return "";
        const [y, m, d] = isoStr.split('-');
        return `${d}/${m}`;
    }

    // ==========================================
    // 4. MODAL DE EDIÇÃO
    // ==========================================

    function setupThemeModal() {
        if (document.getElementById('theme-modal') && document.getElementById('tm-title')) return;

        // Se existir mas estiver incompleto, remove e recria
        const existing = document.getElementById('theme-modal');
        if (existing) existing.remove();

        // (O HTML do modal já deve estar no main ou aqui, 
        //  se estiver no dashboard.html OK, se não injetamos)
        //  Pelo código anterior, estava injetando. Vamos manter.

        const modalHTML = `
        <div id="theme-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] hidden flex items-center justify-center p-4">
            <div class="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md shadow-2xl p-6">
                <h3 id="tm-title" class="text-xl font-bold text-white mb-4">Adicionar Tema</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-gray-400 text-sm mb-1">Nome do Tema</label>
                        <input type="text" id="tm-name" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-blue-500">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-gray-400 text-sm mb-1">Início</label>
                            <input type="date" id="tm-start" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-gray-400 text-sm mb-1">Fim</label>
                            <input type="date" id="tm-end" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500">
                        </div>
                    </div>

                    <!-- Checklist de Entregas (Apenas Edit Mode) -->
                    <div id="tm-submissions-container" class="hidden mt-4 border-t border-gray-800 pt-4">
                        <label class="block text-blue-400 text-sm font-bold mb-2">Entregas da Semana (Membros)</label>
                        <div id="tm-submissions-list" class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar bg-gray-950 p-2 border border-gray-800 rounded">
                            <!-- Gerado via JS -->
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-800">
                        <button id="btn-delete-theme" onclick="deleteTheme()" class="hidden text-red-400 hover:text-red-300 text-sm px-3 mr-auto">Apagar</button>
                        <button onclick="closeThemeModal()" class="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                        <button onclick="saveThemeFromModal()" id="btn-save-theme" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async function openNewThemeModal(startDateStr = null) {
        if (!hasWeeklyPermission) {
            alert("Apenas o Responsável por Desenhos Semanais ou Admin Principal podem criar temas.");
            return;
        }

        editingThemeId = null;
        currentThemeSubmissions.clear();

        document.getElementById('tm-title').innerText = "Novo Tema";
        document.getElementById('btn-delete-theme').classList.add('hidden');
        document.getElementById('tm-submissions-container').classList.add('hidden'); // Ocultar para novos temas

        document.getElementById('tm-name').value = "";
        document.getElementById('tm-start').value = startDateStr || new Date().toISOString().split('T')[0];
        document.getElementById('tm-end').value = "";

        document.getElementById('theme-modal').classList.remove('hidden');
    }

    async function renderSubmissionsList() {
        const container = document.getElementById('tm-submissions-list');
        container.innerHTML = '';

        if (allMembersForSubmissions.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-xs col-span-2">Nenhum membro encontrado.</p>';
            return;
        }

        allMembersForSubmissions.forEach(member => {
            const isChecked = currentThemeSubmissions.has(member.id);

            const div = document.createElement('div');
            div.className = `cursor-pointer p-2 rounded border text-xs flex items-center gap-2 transition select-none ${isChecked ? 'bg-green-600/20 border-green-500 text-green-200' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`;

            div.onclick = () => {
                if (currentThemeSubmissions.has(member.id)) {
                    currentThemeSubmissions.delete(member.id);
                } else {
                    currentThemeSubmissions.add(member.id);
                }
                renderSubmissionsList(); // Re-render checkbox
            };

            // SEGURANÇA: escapeHTML no username antes de injetar no DOM
            div.innerHTML = `
                <div class="w-3 h-3 rounded-sm border flex items-center justify-center ${isChecked ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'}">
                    ${isChecked ? '<svg class="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"/></svg>' : ''}
                </div>
                <span class="truncate font-bold">${escapeHTML(member.username)}</span>
            `;
            container.appendChild(div);
        });
    }

    async function editTheme(theme) {
        if (!hasWeeklyPermission) return;
        
        editingThemeId = theme.id;
        currentThemeSubmissions.clear();
        document.getElementById('tm-title').innerText = "Editar Tema";
        document.getElementById('btn-delete-theme').classList.remove('hidden');
        document.getElementById('tm-submissions-container').classList.remove('hidden');

        document.getElementById('tm-name').value = theme.title;
        document.getElementById('tm-start').value = theme.start_date;
        document.getElementById('tm-end').value = theme.end_date;

        // Fetch Submissions para este tema
        const { data: subs, error: subsError } = await supabase
            .from('weekly_drawing_submissions')
            .select('user_id')
            .eq('theme_id', editingThemeId);

        if (!subsError && subs) {
            subs.forEach(s => currentThemeSubmissions.add(s.user_id));
        }

        renderSubmissionsList();

        document.getElementById('theme-modal').classList.remove('hidden');
    }

    function closeThemeModal() {
        document.getElementById('theme-modal').classList.add('hidden');
    }

    async function saveThemeFromModal() {
        // SEGURANÇA: sanitizeInput no título do tema antes de gravar no Supabase
        const title = sanitizeInput(document.getElementById('tm-name').value, 200);
        const start = document.getElementById('tm-start').value;
        const end   = document.getElementById('tm-end').value;
        const btn   = document.getElementById('btn-save-theme');

        if (!title || !start || !end) return alert("Preencha todos os campos!");
        if (start > end) return alert("A data de início deve ser anterior ao fim.");

        btn.innerText = "A Salvar...";
        btn.disabled = true;

        try {
            let finalThemeId = editingThemeId;

            if (editingThemeId) {
                // Update Tema
                const { error } = await supabase
                    .from('weekly_themes')
                    .update({ title, start_date: start, end_date: end })
                    .eq('id', editingThemeId);

                if (error) throw error;
            } else {
                // Insert Tema
                const { data, error } = await supabase
                    .from('weekly_themes')
                    .insert([{ title, start_date: start, end_date: end }])
                    .select();

                if (error) throw error;
                if (data && data.length > 0) {
                    finalThemeId = data[0].id;
                }
            }

            // Gerir Submissões (Apenas se já era um tema existente ou se acabamos de o criar mas não temos checkboxes abertas. 
            // Para um novo tema recém criado, as checkboxes não estavam visíveis, então currentThemeSubmissions está vazio.)
            if (finalThemeId) {
                // 1. Apagar submissões antigas deste tema
                await supabase.from('weekly_drawing_submissions').delete().eq('theme_id', finalThemeId);

                // 2. Inserir as marcadas atualmente
                if (currentThemeSubmissions.size > 0) {
                    const payloads = Array.from(currentThemeSubmissions).map(uid => ({
                        theme_id: finalThemeId,
                        user_id: uid
                    }));
                    await supabase.from('weekly_drawing_submissions').insert(payloads);
                }
            }

            await loadThemes(); // Reload Data
            renderFullCalendar(displayYear); // Re-render UI
            renderWidgets();
            closeThemeModal();

        } catch (err) {
            console.error("Erro ao salvar tema:", err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            btn.innerText = "Salvar";
            btn.disabled = false;
        }
    }

    async function deleteTheme() {
        if (!editingThemeId) return;
        if (!(await window.customConfirm("Apagar este tema permanentemente?"))) return;

        try {
            const { error } = await supabase
                .from('weekly_themes')
                .delete()
                .eq('id', editingThemeId);

            if (error) throw error;

            await loadThemes();
            renderFullCalendar(displayYear);
            renderWidgets();
            closeThemeModal();

        } catch (err) {
            alert("Erro ao apagar: " + err.message);
        }
    }

    // ==========================================
    // 5. PAINEL DEDICADO DE REGISTO DE ENTREGAS
    // ==========================================

    // ID do tema atualmente carregado no painel
    let panelSelectedThemeId = null;
    // Set com IDs dos membros marcados no painel
    let panelSubmissions = new Set();

    /**
     * Preenche o selector de temas no painel com todos os temas carregados.
     * Ordenados por data decrescente (mais recentes primeiro).
     */
    function populateThemeSelector() {
        const sel = document.getElementById('submissions-theme-select');
        if (!sel) return;

        // Guardar seleção atual para restaurar se possível
        const current = sel.value;
        sel.innerHTML = '<option value="">-- Selecione um tema --</option>';

        // Ordenar por data decrescente (mais recentes em cima)
        const sorted = [...cachedThemes].sort((a, b) =>
            new Date(b.start_date) - new Date(a.start_date)
        );

        sorted.forEach(theme => {
            const opt = document.createElement('option');
            opt.value = theme.id;
            // SEGURANÇA: escapeHTML não é necessário em value, mas usamos textContent para label
            opt.textContent = `${escapeHTML(theme.title)} (${formatDate(theme.start_date)} – ${formatDate(theme.end_date)})`;
            sel.appendChild(opt);
        });

        // Restaurar seleção anterior se existir
        if (current) sel.value = current;
    }

    /**
     * Carrega as entregas de um tema específico e renderiza a checklist no painel.
     * Chamado pelo onchange do select de temas.
     *
     * @param {string|number} themeId - ID do tema selecionado
     */
    async function loadSubmissionsForTheme(themeId) {
        const checklistArea  = document.getElementById('submissions-checklist-area');
        const emptyState     = document.getElementById('submissions-empty-state');
        const list           = document.getElementById('submissions-panel-list');

        if (!themeId) {
            checklistArea.classList.add('hidden');
            emptyState.classList.remove('hidden');
            panelSelectedThemeId = null;
            panelSubmissions.clear();
            return;
        }

        panelSelectedThemeId = themeId;
        panelSubmissions.clear();
        list.innerHTML = '<p class="text-gray-500 text-xs animate-pulse col-span-full">A carregar...</p>';
        checklistArea.classList.remove('hidden');
        emptyState.classList.add('hidden');

        // Buscar submissões existentes para este tema
        const { data: subs, error } = await supabase
            .from('weekly_drawing_submissions')
            .select('user_id')
            .eq('theme_id', themeId);

        if (!error && subs) {
            subs.forEach(s => panelSubmissions.add(s.user_id));
        }

        renderPanelChecklist();
    }

    /**
     * Renderiza a checklist de membros no painel de entregas.
     * SEGURANÇA: escapeHTML em todos os nomes de utilizadores.
     */
    function renderPanelChecklist() {
        const list  = document.getElementById('submissions-panel-list');
        const count = document.getElementById('submissions-count');
        if (!list) return;

        list.innerHTML = '';

        if (allMembersForSubmissions.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-xs col-span-full">Nenhum membro encontrado.</p>';
            return;
        }

        allMembersForSubmissions.forEach(member => {
            const checked = panelSubmissions.has(member.id);

            const btn = document.createElement('button');
            btn.className = `w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center gap-2.5 transition select-none
                ${checked
                    ? 'bg-green-600/20 border-green-500/60 text-green-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'}`;

            btn.onclick = () => {
                if (panelSubmissions.has(member.id)) {
                    panelSubmissions.delete(member.id);
                } else {
                    panelSubmissions.add(member.id);
                }
                renderPanelChecklist();
            };

            // SEGURANÇA: escapeHTML no username antes de inserir no DOM
            btn.innerHTML = `
                <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0
                    ${checked ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'}">
                    ${checked ? '<svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                </div>
                <span class="truncate font-medium">${escapeHTML(member.username || '?')}</span>
            `;
            list.appendChild(btn);
        });

        // Atualizar contador
        if (count) count.textContent = `${panelSubmissions.size} / ${allMembersForSubmissions.length} entregas`;
    }

    /**
     * Guarda as entregas marcadas no painel para o tema selecionado.
     * Apaga as submissões antigas e re-insere as atuais (sync completo).
     */
    async function saveSubmissionsFromPanel() {
        if (!panelSelectedThemeId) {
            alert("Seleciona um tema primeiro.");
            return;
        }

        const btn = document.getElementById('btn-save-submissions');
        if (btn) { btn.textContent = 'A guardar...'; btn.disabled = true; }

        try {
            // 1. Apagar submissões antigas deste tema
            const { error: delError } = await supabase
                .from('weekly_drawing_submissions')
                .delete()
                .eq('theme_id', panelSelectedThemeId);

            if (delError) throw delError;

            // 2. Inserir as marcadas atualmente
            if (panelSubmissions.size > 0) {
                const payloads = Array.from(panelSubmissions).map(uid => ({
                    theme_id: panelSelectedThemeId,
                    user_id: uid
                }));
                const { error: insError } = await supabase
                    .from('weekly_drawing_submissions')
                    .insert(payloads);

                if (insError) throw insError;
            }

            // 3. Feedback e re-render do contador
            const count = document.getElementById('submissions-count');
            if (count) count.textContent = `✓ ${panelSubmissions.size} / ${allMembersForSubmissions.length} guardado!`;

            console.log("✅ Entregas guardadas:", panelSubmissions.size);
            
            // Usar o Modal de Feedback Global se existir
            if (typeof window.showFeedbackModal === 'function') {
                window.showFeedbackModal('success', 'Entregas Guardadas!', 'O registo das entregas semanais foi atualizado com sucesso.');
            }

        } catch (err) {
            console.error("❌ Erro ao guardar entregas:", err);
            if (typeof window.showFeedbackModal === 'function') {
                window.showFeedbackModal('error', 'Erro ao Guardar', err.message);
            } else {
                alert("Erro ao guardar: " + err.message);
            }
        } finally {
            if (btn) { btn.textContent = 'Guardar Entregas'; btn.disabled = false; }
        }
    }

    // Expor Globais (Window)
    window.initWeeklyDrawings        = initWeeklyDrawings;
    window.openNewThemeModal         = openNewThemeModal;
    window.closeThemeModal           = closeThemeModal;
    window.saveThemeFromModal        = saveThemeFromModal;
    window.deleteTheme               = deleteTheme;
    window.changeYear                = changeYear;
    window.loadSubmissionsForTheme   = loadSubmissionsForTheme;
    window.saveSubmissionsFromPanel  = saveSubmissionsFromPanel;

})();

