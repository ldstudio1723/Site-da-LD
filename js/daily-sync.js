// ==========================================
// MÓDULO: DAILY SYNC (SINCRONIZAÇÃO DIÁRIA)
// ==========================================
// Responsábilidade: Detectar mudança de dia e atualizar variável 'day_changed_flag'.
// Simulação local: Usa localStorage como substituto da tabela 'system_config' do Supabase.
// Segurança: Este módulo não recebe input de utilizadores externos,
//            apenas lê/escreve datas no localStorage em nome do utilizador autenticado.

async function initDailySync() {
    console.log("Inicializando Sincronização Diária...");

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastLogin = localStorage.getItem('last_login_date');

    // Simulação da Tabela 'system_config'
    let systemConfig = JSON.parse(localStorage.getItem('system_config') || '{"day_changed_flag": "0"}');

    if (lastLogin !== today) {
        console.log("📅 Novo dia detectado! (Ontem: " + (lastLogin || 'N/A') + " -> Hoje: " + today + ")");

        // 1. Mudar variável para '1' (Como solicitado)
        await setSystemVariable('day_changed_flag', '1');

        // 2. Executar tarefas de "Novo Dia" (ex: marcar projetos como atrasados)
        runDailyMaintenance();

        // 3. Atualizar data de último login no localStorage
        localStorage.setItem('last_login_date', today);

        // 4. Notificar utilizador (apenas 1x por dia)
        // NOTA: Este alert aparece SÓ quando há mudança de dia, não em cada login.
        // Apenas recarrega em silêncio ou loga no console em vez de emitir um popup
        console.log("Sistema sincronizado para o novo dia.");

    } else {
        console.log("📅 Mesmo dia. Nenhuma ação de sincronização necessária.");

        // Garante que está a 0 se não for dia novo (Reset manual se necessário)
        // await setSystemVariable('day_changed_flag', '0'); 
    }
}

// ==========================================
// HELPERS (Simulando Supabase)
// ==========================================

async function setSystemVariable(key, value) {
    // SIMULAÇÃO: Num cenário real, seria:
    // const { error } = await supabase.from('system_config').upsert({ key, value });

    let config = JSON.parse(localStorage.getItem('system_config') || '{}');
    config[key] = value;
    localStorage.setItem('system_config', JSON.stringify(config));

    return true; // Sucesso
}

async function getSystemVariable(key) {
    let config = JSON.parse(localStorage.getItem('system_config') || '{}');
    return config[key] || null;
}

function runDailyMaintenance() {
    // Espaço para lógica extra (ex: arquivar tarefas antigas, resetar contadores)
    console.log("🛠️ Executando manutenção diária...");

    // Exemplo: Verificar se há metas atrasadas nos projetos
    checkProjectDeadlines();
}

function checkProjectDeadlines() {
    const projects = JSON.parse(localStorage.getItem('ld_projects_sql') || '[]');
    let updated = false;
    const today = new Date();

    projects.forEach(p => {
        if (p.deadline && p.status !== 'concluido' && p.status !== 'atrasado') {
            const deadlineDate = new Date(p.deadline);
            if (deadlineDate < today) {
                p.status = 'atrasado';
                updated = true;
                console.log(`⚠️ Projeto "${p.title}" marcado como ATRASADO.`);
            }
        }
    });

    if (updated) {
        localStorage.setItem('ld_projects_sql', JSON.stringify(projects));
        // Se a UI de projetos estiver carregada, recarregar
        if (window.initProjects) window.initProjects();
    }
}

// Iniciar automaticamente
window.initDailySync = initDailySync;
