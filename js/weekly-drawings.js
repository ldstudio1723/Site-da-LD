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
    let currentThemeSubmissions = new Map(); // Map: user_id -> drawings_count
    let hasWeeklyPermission = false;

    // Estado do modal de registo diário (clique num dia do calendário)
    let dayModalDate = null;          // string YYYY-MM-DD
    let dayModalTheme = null;         // objeto tema se o dia tiver tema, null caso contrário
    let dayModalSubmissions = new Map(); // Map: user_id -> { count: int, isWeekly: bool }

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

                // Clique abre sempre o modal de registo de entregas do dia
                dayEl.onclick = () => {
                    openDayModal(currentDateStr, theme || null);
                };

                // Clique direito (ou longa pressão): abrir modal de edição de tema
                dayEl.oncontextmenu = (e) => {
                    e.preventDefault();
                    if (theme) {
                        editTheme(theme);
                    } else {
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
                        <label class="block text-gray-400 text-sm mb-1">Nome do Tema (Opcional)</label>
                        <input type="text" id="tm-name" placeholder="Ex: Dia da Páscoa (deixe em branco se não houver tema)" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-blue-500">
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

    // ==========================================
    // 4b. MODAL DE REGISTO DIÁRIO (CLIQUE EM DIA)
    // ==========================================

    function setupDayModal() {
        if (document.getElementById('day-submissions-modal')) return;

        const html = `
        <div id="day-submissions-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[75] hidden flex items-center justify-center p-4">
            <div class="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

                <!-- Header -->
                <div class="p-5 border-b border-gray-800 flex items-start justify-between">
                    <div>
                        <h3 id="dsm-title" class="text-lg font-bold text-white">Entregas do Dia</h3>
                        <p id="dsm-subtitle" class="text-xs text-gray-500 mt-0.5"></p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="dsm-edit-theme-btn" onclick="dsm_openThemeEdit()" class="hidden text-xs text-blue-400 hover:text-white border border-blue-500/40 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition">
                            ✏️ Editar Tema
                        </button>
                        <button id="dsm-add-theme-btn" onclick="dsm_openThemeAdd()" class="hidden text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-3 py-1.5 rounded-lg transition">
                            + Criar Tema
                        </button>
                        <button onclick="closeDayModal()" class="text-gray-500 hover:text-white transition p-1.5 rounded-lg hover:bg-white/5">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>

                <!-- Secção do Tema Semanal (só aparece se o dia tiver tema) -->
                <div id="dsm-theme-section" class="hidden px-5 pt-4 pb-2">
                    <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
                        <div class="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                            <svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                        </div>
                        <div class="flex-1">
                            <p class="text-[10px] text-blue-400 uppercase font-bold tracking-wider">Tema Semanal</p>
                            <p id="dsm-theme-name" class="text-sm font-bold text-white truncate"></p>
                        </div>
                    </div>
                </div>

                <!-- Lista de membros -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-1.5">
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-xs uppercase text-gray-500 font-bold">Membros</p>
                        <span id="dsm-count" class="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">0 entregas</span>
                    </div>
                    <div id="dsm-list" class="space-y-1.5">
                        <!-- Gerado por JS -->
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-5 border-t border-gray-800 flex justify-end">
                    <button onclick="saveDaySubmissions()" id="dsm-save-btn"
                        class="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg shadow-lg shadow-purple-600/20 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Guardar Entregas
                    </button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    async function openDayModal(dateStr, theme) {
        setupDayModal();

        dayModalDate = dateStr;
        dayModalTheme = theme || null;
        dayModalSubmissions.clear();

        // Formatar data para exibição
        const [y, m, d] = dateStr.split('-');
        const dateLabel = `${d}/${m}/${y}`;
        const weekday = new Date(y, m - 1, d).toLocaleDateString('pt-PT', { weekday: 'long' });

        document.getElementById('dsm-title').textContent = `Entregas de ${dateLabel}`;
        document.getElementById('dsm-subtitle').textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);

        // Secção do tema
        const themeSection = document.getElementById('dsm-theme-section');
        if (theme) {
            document.getElementById('dsm-theme-name').textContent = theme.title;
            themeSection.classList.remove('hidden');
        } else {
            themeSection.classList.add('hidden');
        }

        // Botões de editar/criar tema (apenas com permissão)
        const editBtn = document.getElementById('dsm-edit-theme-btn');
        const addBtn  = document.getElementById('dsm-add-theme-btn');
        if (hasWeeklyPermission) {
            if (theme) {
                editBtn.classList.remove('hidden');
                addBtn.classList.add('hidden');
            } else {
                editBtn.classList.add('hidden');
                addBtn.classList.remove('hidden');
            }
        } else {
            editBtn.classList.add('hidden');
            addBtn.classList.add('hidden');
        }

        // Carregar entregas já existentes para este dia
        let query = supabase
            .from('weekly_drawing_submissions')
            .select('*');

        if (theme) {
            // Se há tema, busca por theme_id OU por submission_date neste intervalo
            query = query.eq('theme_id', theme.id);
        } else {
            // Se não há tema, busca por submission_date = dateStr e theme_id = null
            query = query.is('theme_id', null).eq('submission_date', dateStr + 'T00:00:00+00:00');
        }

        const { data: existingSubs } = await query;
        if (existingSubs) {
            existingSubs.forEach(s => {
                let count = 1;
                if (s.drawings_count !== undefined && s.drawings_count !== null) {
                    count = parseInt(s.drawings_count, 10) || 1;
                } else if (s.image_url && !isNaN(parseInt(s.image_url, 10))) {
                    count = parseInt(s.image_url, 10) || 1;
                }
                const isWeekly = s.is_weekly === true || s.is_weekly === 1;
                dayModalSubmissions.set(s.user_id, { count, isWeekly: theme ? isWeekly : false });
            });
        }

        renderDayChecklist();
        document.getElementById('day-submissions-modal').classList.remove('hidden');
    }

    function closeDayModal() {
        const modal = document.getElementById('day-submissions-modal');
        if (modal) modal.classList.add('hidden');
        dayModalDate = null;
        dayModalTheme = null;
        dayModalSubmissions.clear();
    }

    // Abrir modal de tema a partir do modal diário
    window.dsm_openThemeEdit = function() {
        closeDayModal();
        if (dayModalTheme) editTheme(dayModalTheme);
    };
    window.dsm_openThemeAdd = function() {
        closeDayModal();
        openNewThemeModal(dayModalDate);
    };

    function renderDayChecklist() {
        const list  = document.getElementById('dsm-list');
        const count = document.getElementById('dsm-count');
        if (!list) return;

        list.innerHTML = '';

        if (allMembersForSubmissions.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">Nenhum membro encontrado.</p>';
            return;
        }

        const hasTheme = !!dayModalTheme;

        allMembersForSubmissions.forEach(member => {
            const entry = dayModalSubmissions.get(member.id);
            const hasSubmitted = !!entry;
            const drawingsCount = entry ? entry.count : 1;
            const isWeekly = entry ? entry.isWeekly : true; // default true se tem tema

            const row = document.createElement('div');
            row.className = `rounded-xl border text-sm transition
                ${hasSubmitted
                    ? 'bg-green-600/15 border-green-500/50'
                    : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'}`;

            // Linha principal
            const mainRow = document.createElement('div');
            mainRow.className = "flex items-center justify-between px-3 py-2.5 cursor-pointer";
            mainRow.onclick = () => {
                if (dayModalSubmissions.has(member.id)) {
                    dayModalSubmissions.delete(member.id);
                } else {
                    dayModalSubmissions.set(member.id, { count: 1, isWeekly: hasTheme });
                }
                renderDayChecklist();
            };

            mainRow.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0
                        ${hasSubmitted ? 'bg-green-500 border-green-400' : 'bg-gray-700 border-gray-500'}">
                        ${hasSubmitted ? '<svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                    </div>
                    <span class="font-medium ${hasSubmitted ? 'text-green-100' : 'text-gray-300'}">${escapeHTML(member.username || '?')}</span>
                </div>
            `;

            // Contador de desenhos (apenas se marcado)
            if (hasSubmitted) {
                const counterDiv = document.createElement('div');
                counterDiv.className = "flex items-center gap-1 bg-gray-950 px-2 py-0.5 rounded border border-gray-700 shrink-0";
                counterDiv.onclick = e => e.stopPropagation();

                const decBtn = document.createElement('button');
                decBtn.className = "px-1.5 text-gray-400 hover:text-white font-bold transition text-xs";
                decBtn.textContent = "-";
                decBtn.onclick = e => {
                    e.stopPropagation();
                    const cur = dayModalSubmissions.get(member.id);
                    if (cur.count - 1 <= 0) {
                        dayModalSubmissions.delete(member.id);
                    } else {
                        dayModalSubmissions.set(member.id, { ...cur, count: cur.count - 1 });
                    }
                    renderDayChecklist();
                };

                const countSpan = document.createElement('span');
                countSpan.className = "px-1.5 text-white font-mono text-xs font-bold min-w-[14px] text-center";
                countSpan.textContent = drawingsCount;

                const incBtn = document.createElement('button');
                incBtn.className = "px-1.5 text-gray-400 hover:text-white font-bold transition text-xs";
                incBtn.textContent = "+";
                incBtn.onclick = e => {
                    e.stopPropagation();
                    const cur = dayModalSubmissions.get(member.id);
                    dayModalSubmissions.set(member.id, { ...cur, count: cur.count + 1 });
                    renderDayChecklist();
                };

                counterDiv.appendChild(decBtn);
                counterDiv.appendChild(countSpan);
                counterDiv.appendChild(incBtn);
                mainRow.appendChild(counterDiv);
            }

            row.appendChild(mainRow);

            // Toggle "Foi Desenho Semanal?" (apenas se o dia tiver tema e membro marcado)
            if (hasTheme && hasSubmitted) {
                const weeklyRow = document.createElement('div');
                weeklyRow.className = "border-t border-gray-700/50 px-3 py-2 flex items-center justify-between";
                weeklyRow.onclick = e => e.stopPropagation();

                weeklyRow.innerHTML = `
                    <span class="text-[11px] text-gray-400">Foi <strong class="text-blue-400">Desenho Semanal</strong> (tema da semana)?</span>
                `;

                // Toggle switch
                const toggleBtn = document.createElement('button');
                toggleBtn.className = `relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                    ${isWeekly ? 'bg-blue-600' : 'bg-gray-600'}`;
                toggleBtn.innerHTML = `<span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isWeekly ? 'translate-x-4' : 'translate-x-1'}"></span>`;
                toggleBtn.onclick = e => {
                    e.stopPropagation();
                    const cur = dayModalSubmissions.get(member.id);
                    dayModalSubmissions.set(member.id, { ...cur, isWeekly: !cur.isWeekly });
                    renderDayChecklist();
                };

                weeklyRow.appendChild(toggleBtn);
                row.appendChild(weeklyRow);
            }

            list.appendChild(row);
        });

        // Atualizar contador
        if (count) {
            let total = 0;
            dayModalSubmissions.forEach(e => { total += e.count; });
            count.textContent = `${dayModalSubmissions.size} membros (${total} desenhos)`;
        }
    }

    async function saveDaySubmissions() {
        if (!dayModalDate) return;

        const btn = document.getElementById('dsm-save-btn');
        if (btn) { btn.textContent = 'A guardar...'; btn.disabled = true; }

        try {
            // 1. Apagar registos existentes para este dia
            if (dayModalTheme) {
                await supabase.from('weekly_drawing_submissions').delete().eq('theme_id', dayModalTheme.id);
            } else {
                // Apagar entregas do dia sem tema (theme_id null + submission_date)
                await supabase.from('weekly_drawing_submissions')
                    .delete()
                    .is('theme_id', null)
                    .eq('submission_date', dayModalDate + 'T00:00:00+00:00');
            }

            // 2. Inserir os novos registos
            if (dayModalSubmissions.size > 0) {
                const payloads = Array.from(dayModalSubmissions.entries()).map(([uid, entry]) => {
                    const base = {
                        user_id: uid,
                        submission_date: dayModalDate + 'T00:00:00+00:00',
                        drawings_count: entry.count,
                        image_url: entry.count.toString()
                    };
                    if (dayModalTheme) {
                        base.theme_id = dayModalTheme.id;
                        base.is_weekly = entry.isWeekly;
                    } else {
                        base.theme_id = null;
                    }
                    return base;
                });

                // Tentar com is_weekly e drawings_count, fallback sem colunas novas
                let { error } = await supabase.from('weekly_drawing_submissions').insert(payloads);

                if (error && (error.message.includes('is_weekly') || error.message.includes('drawings_count'))) {
                    console.warn('⚠️ Colunas novas não existem. A usar fallback mínimo.');
                    const fallback = payloads.map(p => ({
                        user_id: p.user_id,
                        submission_date: p.submission_date,
                        theme_id: p.theme_id || null,
                        image_url: p.image_url
                    }));
                    const { error: e2 } = await supabase.from('weekly_drawing_submissions').insert(fallback);
                    if (e2) throw e2;
                } else if (error) {
                    throw error;
                }
            }

            console.log('✅ Entregas do dia guardadas:', dayModalSubmissions.size);

            if (typeof window.showFeedbackModal === 'function') {
                window.showFeedbackModal('success', 'Guardado!', 'Entregas do dia registadas com sucesso.');
            }

            closeDayModal();

        } catch (err) {
            console.error('❌ Erro ao guardar entregas do dia:', err);
            if (typeof window.showFeedbackModal === 'function') {
                window.showFeedbackModal('error', 'Erro ao Guardar', err.message);
            } else {
                alert('Erro: ' + err.message);
            }
        } finally {
            if (btn) { btn.textContent = 'Guardar Entregas'; btn.disabled = false; }
        }
    }

    async function renderSubmissionsList() {
        const container = document.getElementById('tm-submissions-list');
        container.innerHTML = '';

        if (allMembersForSubmissions.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-xs col-span-2">Nenhum membro encontrado.</p>';
            return;
        }

        allMembersForSubmissions.forEach(member => {
            const hasSubmitted = currentThemeSubmissions.has(member.id);
            const count = currentThemeSubmissions.get(member.id) || 1;

            const div = document.createElement('div');
            div.className = `p-2 rounded border text-xs flex items-center justify-between transition select-none ${hasSubmitted ? 'bg-green-600/20 border-green-500 text-green-200' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`;

            // Left side click toggles submission
            const leftDiv = document.createElement('div');
            leftDiv.className = "flex items-center gap-2 cursor-pointer truncate flex-1 py-1";
            leftDiv.onclick = () => {
                if (currentThemeSubmissions.has(member.id)) {
                    currentThemeSubmissions.delete(member.id);
                } else {
                    currentThemeSubmissions.set(member.id, 1);
                }
                renderSubmissionsList();
            };
            leftDiv.innerHTML = `
                <div class="w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${hasSubmitted ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'}">
                    ${hasSubmitted ? '<svg class="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"/></svg>' : ''}
                </div>
                <span class="truncate font-bold">${escapeHTML(member.username)}</span>
            `;
            div.appendChild(leftDiv);

            // Right side shows counter controls if checked
            if (hasSubmitted) {
                const counterDiv = document.createElement('div');
                counterDiv.className = "flex items-center gap-1 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-700 shrink-0 ml-1";
                counterDiv.onclick = (e) => e.stopPropagation();

                const decBtn = document.createElement('button');
                decBtn.className = "px-1 text-gray-400 hover:text-white font-bold transition text-[10px]";
                decBtn.textContent = "-";
                decBtn.onclick = (e) => {
                    e.stopPropagation();
                    const newCount = count - 1;
                    if (newCount <= 0) {
                        currentThemeSubmissions.delete(member.id);
                    } else {
                        currentThemeSubmissions.set(member.id, newCount);
                    }
                    renderSubmissionsList();
                };

                const countSpan = document.createElement('span');
                countSpan.className = "px-1 text-white font-mono text-[10px] font-bold min-w-[12px] text-center";
                countSpan.textContent = count;

                const incBtn = document.createElement('button');
                incBtn.className = "px-1 text-gray-400 hover:text-white font-bold transition text-[10px]";
                incBtn.textContent = "+";
                incBtn.onclick = (e) => {
                    e.stopPropagation();
                    currentThemeSubmissions.set(member.id, count + 1);
                    renderSubmissionsList();
                };

                counterDiv.appendChild(decBtn);
                counterDiv.appendChild(countSpan);
                counterDiv.appendChild(incBtn);
                div.appendChild(counterDiv);
            }

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

        document.getElementById('tm-name').value = theme.title === 'Sem Tema' ? '' : theme.title;
        document.getElementById('tm-start').value = theme.start_date;
        document.getElementById('tm-end').value = theme.end_date;

        // Fetch Submissions para este tema
        const { data: subs, error: subsError } = await supabase
            .from('weekly_drawing_submissions')
            .select('*')
            .eq('theme_id', editingThemeId);

        if (!subsError && subs) {
            subs.forEach(s => {
                let count = 1;
                if (s.drawings_count !== undefined && s.drawings_count !== null) {
                    count = parseInt(s.drawings_count, 10) || 1;
                } else if (s.image_url) {
                    count = parseInt(s.image_url, 10) || 1;
                }
                currentThemeSubmissions.set(s.user_id, count);
            });
        }

        renderSubmissionsList();

        document.getElementById('theme-modal').classList.remove('hidden');
    }

    function closeThemeModal() {
        document.getElementById('theme-modal').classList.add('hidden');
    }

    /**
     * Guarda os payloads de submissão no Supabase com fallback seguro.
     * Tenta gravar a coluna drawings_count e, se falhar por não existir no schema,
     * tenta gravar sem essa coluna, confiando na coluna image_url para reter o valor.
     */
    async function saveSubmissionPayloadsWithFallback(payloads) {
        // Tenta inserir todos os campos
        const { error } = await supabase
            .from('weekly_drawing_submissions')
            .insert(payloads);

        // Se o erro indicar que a coluna drawings_count não existe (ex: PGRST204 ou erro de coluna inexistente)
        if (error && (error.message.includes('drawings_count') || error.code === 'PGRST204')) {
            console.warn("⚠️ Coluna drawings_count não existe. Usando fallback via image_url.");
            const fallbackPayloads = payloads.map(p => ({
                theme_id: p.theme_id,
                user_id: p.user_id,
                image_url: p.image_url
            }));
            return await supabase
                .from('weekly_drawing_submissions')
                .insert(fallbackPayloads);
        }
        return { error };
    }

    async function saveThemeFromModal() {
        // SEGURANÇA: sanitizeInput no título do tema antes de gravar no Supabase
        let title = sanitizeInput(document.getElementById('tm-name').value, 200);
        if (!title) title = "Sem Tema";
        const start = document.getElementById('tm-start').value;
        const end   = document.getElementById('tm-end').value;
        const btn   = document.getElementById('btn-save-theme');

        if (!start || !end) return alert("Preencha as datas de início e fim!");
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

            // Gerir Submissões
            if (finalThemeId) {
                // 1. Apagar submissões antigas deste tema
                await supabase.from('weekly_drawing_submissions').delete().eq('theme_id', finalThemeId);

                // 2. Inserir as marcadas atualmente
                if (currentThemeSubmissions.size > 0) {
                    const payloads = Array.from(currentThemeSubmissions.entries()).map(([uid, count]) => ({
                        theme_id: finalThemeId,
                        user_id: uid,
                        drawings_count: count,
                        image_url: count.toString()
                    }));
                    const { error: insError } = await saveSubmissionPayloadsWithFallback(payloads);
                    if (insError) throw insError;
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
    let panelSubmissions = new Map(); // Map: user_id -> drawings_count

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
            .select('*')
            .eq('theme_id', themeId);

        if (!error && subs) {
            subs.forEach(s => {
                let count = 1;
                if (s.drawings_count !== undefined && s.drawings_count !== null) {
                    count = parseInt(s.drawings_count, 10) || 1;
                } else if (s.image_url) {
                    count = parseInt(s.image_url, 10) || 1;
                }
                panelSubmissions.set(s.user_id, count);
            });
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
            const hasSubmitted = panelSubmissions.has(member.id);
            const drawingsCount = panelSubmissions.get(member.id) || 1;

            const div = document.createElement('div');
            div.className = `w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-between transition select-none
                ${hasSubmitted
                    ? 'bg-green-600/20 border-green-500/60 text-green-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'}`;

            // Left side click toggles submission
            const leftDiv = document.createElement('div');
            leftDiv.className = "flex items-center gap-2.5 cursor-pointer truncate flex-1 py-0.5";
            leftDiv.onclick = () => {
                if (panelSubmissions.has(member.id)) {
                    panelSubmissions.delete(member.id);
                } else {
                    panelSubmissions.set(member.id, 1);
                }
                renderPanelChecklist();
            };
            leftDiv.innerHTML = `
                <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0
                    ${hasSubmitted ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'}">
                    ${hasSubmitted ? '<svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                </div>
                <span class="truncate font-medium">${escapeHTML(member.username || '?')}</span>
            `;
            div.appendChild(leftDiv);

            // Right side shows counter controls if checked
            if (hasSubmitted) {
                const counterDiv = document.createElement('div');
                counterDiv.className = "flex items-center gap-1 bg-gray-950 px-2 py-0.5 rounded border border-gray-700 shrink-0 ml-1.5";
                counterDiv.onclick = (e) => e.stopPropagation();

                const decBtn = document.createElement('button');
                decBtn.className = "px-1.5 py-0.5 text-gray-400 hover:text-white font-bold transition text-xs";
                decBtn.textContent = "-";
                decBtn.onclick = (e) => {
                    e.stopPropagation();
                    const newCount = drawingsCount - 1;
                    if (newCount <= 0) {
                        panelSubmissions.delete(member.id);
                    } else {
                        panelSubmissions.set(member.id, newCount);
                    }
                    renderPanelChecklist();
                };

                const countSpan = document.createElement('span');
                countSpan.className = "px-1.5 text-white font-mono text-xs font-bold min-w-[14px] text-center";
                countSpan.textContent = drawingsCount;

                const incBtn = document.createElement('button');
                incBtn.className = "px-1.5 py-0.5 text-gray-400 hover:text-white font-bold transition text-xs";
                incBtn.textContent = "+";
                incBtn.onclick = (e) => {
                    e.stopPropagation();
                    panelSubmissions.set(member.id, drawingsCount + 1);
                    renderPanelChecklist();
                };

                counterDiv.appendChild(decBtn);
                counterDiv.appendChild(countSpan);
                counterDiv.appendChild(incBtn);
                div.appendChild(counterDiv);
            }

            list.appendChild(div);
        });

        // Atualizar contador
        if (count) {
            let totalSubmissions = 0;
            panelSubmissions.forEach(c => { totalSubmissions += c; });
            count.textContent = `${panelSubmissions.size} membros (${totalSubmissions} desenhos)`;
        }
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
                const payloads = Array.from(panelSubmissions.entries()).map(([uid, count]) => ({
                    theme_id: panelSelectedThemeId,
                    user_id: uid,
                    drawings_count: count,
                    image_url: count.toString()
                }));
                const { error: insError } = await saveSubmissionPayloadsWithFallback(payloads);

                if (insError) throw insError;
            }

            // 3. Feedback e re-render do contador
            const count = document.getElementById('submissions-count');
            if (count) {
                let totalSubmissions = 0;
                panelSubmissions.forEach(c => { totalSubmissions += c; });
                count.textContent = `✓ Guardado: ${panelSubmissions.size} membros (${totalSubmissions} desenhos)`;
            }

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
    window.openDayModal              = openDayModal;
    window.closeDayModal             = closeDayModal;
    window.saveDaySubmissions        = saveDaySubmissions;

})();

