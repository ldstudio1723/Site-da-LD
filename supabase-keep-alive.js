/**
 * SUPABASE KEEP-ALIVE SCRIPT
 * Este script é executado pelo GitHub Actions para manter a base de dados ativa.
 */
const { createClient } = require('@supabase/supabase-js');

// Configuração extraída do script.js
const supabaseUrl = 'https://matqihrnhwvkbgldocxz.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("ERRO: SUPABASE_SERVICE_ROLE_KEY não encontrada nos segredos do GitHub.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function keepAlive() {
    console.log("Iniciando ping de manutenção...");

    try {
        // 1. Ler o status atual
        const { data, error: errSelect } = await supabase
            .from('_keep_alive')
            .select('status')
            .eq('id', 1)
            .single();

        if (errSelect) {
            console.error("Erro ao ler tabela _keep_alive:", errSelect.message);
            process.exit(1);
        }

        // 2. Alternar o status e atualizar o last_ping
        const nextStatus = data.status === 1 ? 0 : 1;
        const { error: errUpdate } = await supabase
            .from('_keep_alive')
            .update({ 
                status: nextStatus, 
                last_ping: new Date().toISOString() 
            })
            .eq('id', 1);

        if (errUpdate) {
            console.error("Erro ao atualizar tabela _keep_alive:", errUpdate.message);
            process.exit(1);
        }

        console.log(`Sucesso! Status alterado para ${nextStatus}. Base de dados ativa.`);
    } catch (err) {
        console.error("Erro inesperado:", err);
        process.exit(1);
    }
}

keepAlive();
