-- ==========================================
-- RPC: update_user_password_admin
-- ==========================================
-- Permite que APENAS o Admin Principal (profiles.role = 'admin') altere
-- a senha de login de qualquer membro a partir da aba de Gestão de Membros.
--
-- Segurança:
--   - SECURITY DEFINER: corre com privilégios elevados (necessário para
--     escrever em auth.users), mas o corpo da função verifica sempre
--     se quem está a chamar (auth.uid()) tem role = 'admin' antes de
--     fazer qualquer alteração. Sem essa verificação, qualquer utilizador
--     autenticado poderia mudar a senha de outro — por isso a checagem
--     é feita aqui no servidor, não só no frontend (que pode ser contornado).
--   - search_path fixo evita ataques de "search_path hijacking".
--
-- Como instalar: correr este script uma vez no SQL Editor do Supabase.
-- ==========================================

create or replace function public.update_user_password_admin(
    p_user_id uuid,
    p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
    caller_role text;
begin
    -- 1. Confirmar que quem chama a função é o Admin Principal
    select role into caller_role
    from public.profiles
    where id = auth.uid();

    if caller_role is distinct from 'admin' then
        raise exception 'Apenas o administrador principal pode alterar senhas de membros.';
    end if;

    -- 2. Validação básica da nova senha
    if p_new_password is null or length(p_new_password) < 6 then
        raise exception 'A nova senha deve ter pelo menos 6 caracteres.';
    end if;

    -- 3. Atualizar a senha encriptada diretamente em auth.users
    --    (mesmo formato bcrypt usado pelo GoTrue/Supabase Auth)
    update auth.users
    set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = p_user_id;

    if not found then
        raise exception 'Utilizador não encontrado.';
    end if;
end;
$$;

-- Apenas utilizadores autenticados podem sequer tentar chamar a função
-- (a verificação de role = 'admin' dentro da função faz o resto do trabalho)
revoke all on function public.update_user_password_admin(uuid, text) from public;
grant execute on function public.update_user_password_admin(uuid, text) to authenticated;
