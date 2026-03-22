// ==========================================
// MÓDULO: PERFIL (MEMBRO)
// ==========================================

(function () {

    console.log(">>> MODULO PROFILE.JS CARREGADO <<<");

    // FORÇAR INICIALIZAÇÃO DO SUPABASE (Solução Robusta)
    const supabaseUrl = "https://matqihrnhwvkbgldocxz.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdHFpaHJuaHd2a2JnbGRvY3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDk4NzgsImV4cCI6MjA4MzAyNTg3OH0.W7o6qcbVBTsYNPMoh-kSViVIjCOzG7i7mHmGNHHhxuQ";

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    // Escopo local, sem colisão
    const supabase = window.supabaseClient;

    if (!supabase) console.error("CRÍTICO: Falha ao inicializar Supabase em profile.js!");

    async function initProfile() {
        console.log("Inicializando perfil...");

        const container = document.getElementById('profile-content');
        if (!container) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch Profile Data from DB
        // Usamos select('*') para não falhar com 400 Bad Request se uma coluna nova
        // (como avatar_emoji) ainda não existir no schema — mais resiliente.
        const { data: dbProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();


        const metadata = user.user_metadata || {};

        // Prioridade de Display: Custom Role DB > Role DB > Metadata Role
        const displayRole = dbProfile?.custom_role || dbProfile?.role || metadata.role || "Membro";

        // Layout já existe no dashboard.html, apenas preencher dados
        const nameEl = document.getElementById('profile-name');
        const roleEl = document.getElementById('profile-role');
        const avatarEl = document.getElementById('profile-avatar');

        const usernameInput = document.getElementById('profile-username-input');
        const emailInput = document.getElementById('profile-email-input');

        if (nameEl) nameEl.innerText = metadata.username || "Membro";

        if (roleEl) {
            roleEl.innerText = displayRole.toUpperCase();
            // Highlight se for custom
            if (dbProfile?.custom_role) {
                roleEl.className = "px-3 py-1 bg-pink-500/20 text-pink-300 text-xs font-bold uppercase tracking-wider rounded-full border border-pink-500/30";
            }
        }

        if (avatarEl) {
            if (dbProfile?.avatar_emoji) {
                avatarEl.innerText = dbProfile.avatar_emoji;
            } else {
                avatarEl.innerText = (metadata.username || "M")[0].toUpperCase() + (metadata.username || "M")[1].toUpperCase(); // Default chars
            }
        }

        if (usernameInput) {
            usernameInput.value = metadata.username || "";
            // Store original
            usernameInput.dataset.original = metadata.username || "";
            // Add listener
            usernameInput.addEventListener('input', handleUsernameInput);
        }
        if (emailInput) emailInput.value = user.email || "";

        loadMyStats(user.id);
    }

    // ==========================================
    // LÓGICA DE EDIÇÃO DE NOME DE UTILIZADOR
    // ==========================================
    let usernameTimeout = null;

    function handleUsernameInput(e) {
        const input = e.target;
        const newName = input.value.trim();
        const originalName = input.dataset.original;
        const feedback = document.getElementById('username-feedback');
        const btnSave = document.getElementById('btn-save-username');
        const loading = document.getElementById('username-loading');

        // Reset state
        clearTimeout(usernameTimeout);
        feedback.innerText = "";
        btnSave.disabled = true;
        btnSave.classList.add('bg-blue-600/50', 'text-white/50', 'cursor-not-allowed');
        btnSave.classList.remove('bg-blue-600', 'hover:bg-blue-500', 'text-white', 'shadow-blue-600/20');

        // Basic validation
        if (newName.length < 3) {
            feedback.innerText = "Mínimo de 3 caracteres.";
            feedback.className = "text-xs mt-1 block h-4 text-red-400";
            return;
        }

        if (newName.toLowerCase() === originalName.toLowerCase()) {
            // No change
            return;
        }

        // Show loading
        loading.classList.remove('hidden');

        // Debounce API call (500ms)
        usernameTimeout = setTimeout(() => validateUsernameAvailability(newName), 500);
    }

    async function validateUsernameAvailability(username) {
        const feedback = document.getElementById('username-feedback');
        const btnSave = document.getElementById('btn-save-username');
        const loading = document.getElementById('username-loading');

        try {
            // Check profiles table (case-insensitive if possible, using ilike)
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .ilike('username', username);

            loading.classList.add('hidden');

            if (error) throw error;

            if (data && data.length > 0) {
                // Taken
                feedback.innerText = "Este nome já está em uso.";
                feedback.className = "text-xs mt-1 block h-4 text-red-400";
            } else {
                // Available
                feedback.innerText = "Nome disponível!";
                feedback.className = "text-xs mt-1 block h-4 text-green-400";

                // Enable Save button
                btnSave.disabled = false;
                btnSave.classList.remove('bg-blue-600/50', 'text-white/50', 'cursor-not-allowed');
                btnSave.classList.add('bg-blue-600', 'hover:bg-blue-500', 'text-white', 'shadow-blue-600/20');
            }
        } catch (err) {
            console.error("Erro na validação:", err);
            loading.classList.add('hidden');
            feedback.innerText = "Erro ao verificar disponibilidade.";
            feedback.className = "text-xs mt-1 block h-4 text-yellow-400";
        }
    }

    async function saveUsername() {
        const input = document.getElementById('profile-username-input');
        const newName = input.value.trim();
        const btnSave = document.getElementById('btn-save-username');

        if (!newName || btnSave.disabled) return;

        btnSave.disabled = true;
        btnSave.innerHTML = "A guardar...";

        try {
            // NOTA: NÃO alteramos o email de Auth (Supabase rejeita @ld.local na validação).
            // O email interno de login fica inalterado — apenas o nome de exibição muda.
            // Isto é semelhante a como a maioria das apps separa "display name" de "login name".

            // 1. Atualizar apenas o metadata (username de exibição)
            const { error: authError } = await supabase.auth.updateUser({
                data: { username: newName }
            });

            if (authError) throw authError;

            // 2. Atualizar tabela de Perfis
            const { data: { user } } = await supabase.auth.getUser();
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ username: newName })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // 3. Sucesso — avisar que o nome de LOGIN permanece o original
            await alert("Nome de utilizador atualizado com sucesso!\n\n⚠️ O nome para fazer login permanece o mesmo (o nome com que criaste a conta). Apenas o nome de exibição mudou.");

            window.location.reload();

        } catch (err) {
            console.error("Erro ao guardar nome:", err);
            alert("Erro ao alterar o nome: " + err.message);
            btnSave.innerHTML = "Tentar Novamente";
            btnSave.disabled = false;
        }
    }

    async function changePassword() {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!newPassword || !confirmPassword) {
            alert("Preencha ambos os campos de senha.");
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("As senhas não coincidem.");
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            alert("Erro ao alterar senha: " + error.message);
        } else {
            alert("Senha alterada com sucesso!");
            document.getElementById('new-password').value = "";
            document.getElementById('confirm-password').value = "";
        }
    }

    async function loadMyStats(userId) {
        const daysEl = document.getElementById('activity-days');
        const unitEl = document.getElementById('activity-unit');
        const badgeEl = document.getElementById('activity-badge');

        if (!daysEl || !unitEl || !badgeEl) {
            console.warn("Elementos de atividade não encontrados no DOM.");
            return;
        }

        try {
            // 1. Buscar o total de desenhos feitos
            const { count, error: countErr } = await supabase
                .from('weekly_drawing_submissions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (!countErr) {
                const totalEl = document.getElementById('activity-total');
                if (totalEl) totalEl.innerText = count || 0;
            }

            // 2. Buscar a data do último desenho
            const { data: submissions, error } = await supabase
                .from('weekly_drawing_submissions')
                .select('created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (submissions && submissions.length > 0) {
                const lastDate = new Date(submissions[0].created_at);
                const now = new Date();
                const diffTime = Math.abs(now - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Lógica de Display (Dias vs Semanas)
                if (diffDays <= 7) {
                    daysEl.innerText = diffDays;
                    unitEl.innerText = "dias";
                } else {
                    const weeks = Math.floor(diffDays / 7);
                    daysEl.innerText = weeks;
                    unitEl.innerText = "semanas";
                }

                // Badge Status & Styling
                badgeEl.classList.remove('opacity-0');
                if (diffDays > 14) {
                    badgeEl.innerText = "Inativo (Alerta)";
                    badgeEl.className = "text-xs px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 opacity-100 transition";
                } else {
                    badgeEl.innerText = "Ativo";
                    badgeEl.className = "text-xs px-2 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-400 opacity-100 transition";
                }

            } else {
                // Nunca submeteu
                daysEl.innerText = "--";
                unitEl.innerText = "sem registos";

                badgeEl.innerText = "Novo Membro";
                badgeEl.className = "text-xs px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 opacity-100 transition";
                badgeEl.classList.remove('opacity-0');
            }

        } catch (err) {
            console.error("Erro ao carregar atividade:", err);
            if (daysEl) daysEl.innerText = "?";
            if (unitEl) unitEl.innerText = "erro";
        }
    }

    // ==========================================
    // LÓGICA DE AVATARES (EMOJIS)
    // ==========================================
    const EMOJI_LIST = [
        "😀", "😎", "🤓", "🤠", "🤖", "👻", "👽", "👾",
        "🐶", "🐱", "🦊", "🦁", "🐸", "🐵", "🦄", "🐉",
        "🍎", "🍔", "🍕", "🍩", "🍄", "🌶️", "🥑", "🥨",
        "⚽", "🏀", "🎮", "🎲", "🎸", "🎨", "🚀", "🛸",
        "🔥", "💧", "⚡", "✨", "🌟", "🌙", "🌞", "🌈",
        "❤️", "🩷", "💙", "💜", "🖤", "🤍", "💥", "💯"
    ];

    // Emoji seleccionado no modal mas ainda não guardado
    let selectedEmoji = null;

    function openEmojiModal() {
        const modal = document.getElementById('emoji-modal');
        if (modal) {
            // Ler o emoji actual da DB (atributo guardado no avatar)
            const avatarEl = document.getElementById('profile-avatar');
            selectedEmoji = avatarEl?.dataset.savedEmoji || null;
            modal.classList.remove('hidden');
            renderEmojiGrid();
        }
    }

    function closeEmojiModal() {
        const modal = document.getElementById('emoji-modal');
        if (modal) modal.classList.add('hidden');
        selectedEmoji = null;
    }

    function renderEmojiGrid() {
        const container = document.getElementById('emoji-grid');
        if (!container) return;

        container.innerHTML = '';

        // Botão para remover avatar (voltar às iniciais)
        const removeBtn = document.createElement('button');
        removeBtn.className = `p-2 rounded-xl transition cursor-pointer flex items-center justify-center border text-sm font-bold
            ${selectedEmoji === null ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-gray-700/50 hover:bg-red-500/20 border-gray-600 hover:border-red-500/50 text-gray-400'}`;
        removeBtn.innerHTML = '✕';
        removeBtn.title = "Remover Avatar (usar iniciais)";
        removeBtn.onclick = () => { selectedEmoji = null; renderEmojiGrid(); };
        container.appendChild(removeBtn);

        // Botões de emoji
        EMOJI_LIST.forEach(emoji => {
            const btn = document.createElement('button');
            const isSelected = selectedEmoji === emoji;
            btn.className = `p-2 rounded-xl transition cursor-pointer border text-xl
                ${isSelected
                    ? 'bg-blue-600/30 border-blue-500 scale-110 shadow-lg shadow-blue-500/20'
                    : 'bg-gray-700/50 hover:bg-gray-600 border-transparent hover:border-gray-500 hover:scale-110 active:scale-95'}`;
            btn.innerText = emoji;
            btn.title = emoji;
            btn.onclick = () => { selectedEmoji = emoji; renderEmojiGrid(); };
            container.appendChild(btn);
        });
    }

    /**
     * Guarda o emoji seleccionado na DB e fecha o modal.
     * Chamado pelo botão "Guardar Avatar" no footer do modal.
     */
    async function saveSelectedEmoji() {
        const avatarEl = document.getElementById('profile-avatar');
        const saveBtn  = document.querySelector('button[onclick="saveSelectedEmoji()"]');

        if (saveBtn) { saveBtn.textContent = 'A guardar...'; saveBtn.disabled = true; }

        try {
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (authErr || !user) throw new Error("Sem sessão ativa.");

            console.log("💾 A guardar avatar_emoji:", selectedEmoji, "| user_id:", user.id);

            // Passo 1: UPDATE simples (sem .select() para evitar erros PGRST116)
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_emoji: selectedEmoji })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // Passo 2: SELECT separado para confirmar que foi gravado
            const { data: check, error: checkError } = await supabase
                .from('profiles')
                .select('avatar_emoji')
                .eq('id', user.id)
                .single();

            if (checkError) {
                console.warn("⚠️ Update pode ter funcionado mas não consegui confirmar:", checkError.message);
                // Não lançar erro — o update pode ter funcionado mesmo assim
            } else {
                console.log("✅ Confirmado na DB:", check);
            }

            // Actualizar o avatar visualmente
            const username = document.getElementById('profile-username-input')?.dataset.original || "M";
            if (selectedEmoji) {
                avatarEl.innerText = selectedEmoji;
                avatarEl.dataset.savedEmoji = selectedEmoji;
            } else {
                avatarEl.innerText = (username[0] || "M").toUpperCase() + (username[1] || "M").toUpperCase();
                delete avatarEl.dataset.savedEmoji;
            }

            // Fechar modal
            const modal = document.getElementById('emoji-modal');
            if (modal) modal.classList.add('hidden');
            selectedEmoji = null;

        } catch (err) {
            console.error("❌ Erro ao guardar avatar:", err);
            alert("Erro ao guardar o avatar: " + err.message);
        } finally {
            if (saveBtn) { saveBtn.textContent = '💾 Guardar Avatar'; saveBtn.disabled = false; }
        }
    }


    // Expor globalmente
    window.initProfile       = initProfile;
    window.changePassword    = changePassword;
    window.loadMyStats       = loadMyStats;
    window.saveUsername      = saveUsername;
    window.openEmojiModal    = openEmojiModal;
    window.closeEmojiModal   = closeEmojiModal;
    window.saveSelectedEmoji = saveSelectedEmoji;

})();

