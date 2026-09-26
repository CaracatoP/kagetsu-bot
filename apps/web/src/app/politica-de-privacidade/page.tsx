import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de Privacidade — Kagetsu",
  description: "Política de Privacidade do Kagetsu.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        <strong>Última atualização: 26 de setembro de 2026</strong>
      </p>
      <p>
        Esta Política de Privacidade explica como o <strong>Kagetsu</strong>{" "}
        coleta, utiliza, armazena e protege informações durante o uso do bot,
        dashboard e serviços relacionados.
      </p>
      <p>
        <strong>Responsável pelo tratamento:</strong> João Gabriel Caraçato
      </p>
      <p>
        <strong>Contato de privacidade:</strong> joaogabrielcaracato@gmail.com
      </p>

      <h2>1. Informações tratadas pelo Kagetsu</h2>
      <p>
        Dependendo dos módulos utilizados pelo servidor, o Kagetsu poderá tratar
        identificadores da conta Discord, como ID do usuário, nome de usuário,
        nome exibido e avatar; identificadores de servidores, canais, cargos e
        mensagens; configurações realizadas pelos administradores; dados
        relacionados a XP, níveis, rankings, conquistas, missões e temporadas;
        informações de moderação, como avisos e ações administrativas; dados
        necessários para tickets e suas transcrições; informações de
        participação em eventos, sugestões e sorteios; métricas agregadas de
        utilização; logs técnicos necessários para segurança e diagnóstico; e
        informações de autenticação do dashboard.
      </p>
      <p>
        Quando o usuário entra no dashboard utilizando Discord OAuth2, o
        Kagetsu pode receber informações autorizadas pelo usuário, como sua
        identidade básica e a relação de servidores necessária para determinar
        quais comunidades ele pode administrar.
      </p>

      <h2>2. Dados que não são expostos ao navegador</h2>
      <p>
        Credenciais sensíveis utilizadas pelo sistema, como token do bot,
        segredo OAuth, credenciais do banco de dados e segredo de sessão, são
        mantidas exclusivamente em ambiente de servidor e não devem ser
        enviadas ao frontend.
      </p>
      <p>Tokens relacionados ao OAuth são utilizados somente para autenticação e autorização do usuário.</p>

      <h2>3. Como utilizamos as informações</h2>
      <p>
        Os dados são utilizados exclusivamente para operar e melhorar
        funcionalidades do Kagetsu, autenticar usuários, verificar permissões,
        aplicar configurações do servidor, registrar XP e progressão, executar
        ferramentas de moderação e automação, processar tickets, fornecer
        rankings, produzir logs necessários para segurança, solucionar erros e
        impedir abuso.
      </p>
      <p>Não vendemos dados pessoais a anunciantes.</p>

      <h2>4. Mensagens do Discord</h2>
      <p>
        O Kagetsu pode receber conteúdo ou metadados de mensagens quando
        necessário para funcionalidades habilitadas, como XP por mensagem,
        comandos, AutoMod, moderação, tickets ou sistemas semelhantes.
      </p>
      <p>O Kagetsu não deve armazenar indiscriminadamente todo o histórico de mensagens de um servidor.</p>
      <p>
        Conteúdo deve ser armazenado apenas quando necessário à funcionalidade
        utilizada, como registros de moderação ou geração de transcrições de
        tickets.
      </p>

      <h2>5. Tickets</h2>
      <p>
        Ao utilizar tickets, mensagens existentes no canal do ticket podem ser
        processadas para atendimento e para geração de transcrição.
      </p>
      <p>
        As transcrições podem conter nomes, avatares, horários, mensagens,
        links, referências a anexos e informações relacionadas ao atendimento.
      </p>
      <p>
        O acesso a tickets deve ser restrito ao usuário responsável, equipe
        autorizada e administradores conforme configuração do servidor.
      </p>

      <h2>6. Logs e moderação</h2>
      <p>
        Quando módulos de moderação ou auditoria estiverem ativos, o Kagetsu
        poderá registrar informações relacionadas a advertências, punições,
        ações administrativas e eventos do servidor.
      </p>
      <p>
        Esses registros têm a finalidade de fornecer histórico administrativo,
        segurança e consistência das ações realizadas no servidor.
      </p>

      <h2>7. Dados de XP e atividade</h2>
      <p>
        Quando os sistemas de XP ou progressão estiverem habilitados, o Kagetsu
        poderá registrar XP, nível, tempo elegível em canais de voz, posição em
        rankings, conquistas e outros dados necessários ao funcionamento do
        sistema.
      </p>
      <p>Esses dados ficam associados ao servidor em que foram gerados.</p>

      <h2>8. Isolamento entre servidores</h2>
      <p>
        O Kagetsu utiliza o identificador do servidor Discord para separar
        configurações e informações entre comunidades.
      </p>
      <p>Dados de uma guild não devem ser disponibilizados a administradores ou usuários de outra guild.</p>
      <p>
        Controles de autorização são utilizados no backend para impedir acesso
        indevido entre servidores.
      </p>

      <h2>9. Cookies e sessões</h2>
      <p>
        O dashboard utiliza cookies ou mecanismos equivalentes necessários para
        manter a sessão autenticada.
      </p>
      <p>
        Cookies de autenticação podem ser configurados com proteções como
        HttpOnly, Secure e SameSite.
      </p>
      <p>Esses cookies são utilizados para segurança e funcionamento da conta, e não para publicidade comportamental.</p>

      <h2>10. Compartilhamento de informações</h2>
      <p>
        As informações podem ser processadas por fornecedores de infraestrutura
        estritamente necessários para o funcionamento do Kagetsu, como Discord,
        serviços de hospedagem do backend e banco de dados, plataforma de
        hospedagem do frontend e outros fornecedores técnicos utilizados na
        operação.
      </p>
      <p>Esses serviços podem possuir suas próprias políticas de privacidade.</p>
      <p>Informações também poderão ser fornecidas quando houver obrigação legal válida.</p>

      <h2>11. Retenção</h2>
      <p>
        Os dados são mantidos apenas pelo período necessário para fornecer as
        funcionalidades correspondentes, cumprir obrigações legais, preservar
        segurança ou resolver disputas.
      </p>
      <p>Configurações de servidores poderão permanecer armazenadas enquanto o servidor utilizar o Kagetsu.</p>
      <p>
        Registros específicos, como tickets, transcrições, auditoria, moderação
        ou analytics, podem possuir períodos diferentes de retenção.
      </p>
      <p>Sempre que tecnicamente e legalmente possível, informações desnecessárias poderão ser removidas ou anonimizadas.</p>

      <h2>12. Exclusão de dados</h2>
      <p>Administradores poderão solicitar a exclusão de dados associados ao servidor quando aplicável.</p>
      <p>
        Usuários também poderão solicitar informações sobre dados pessoais
        associados à sua conta Discord ou sua exclusão quando houver fundamento
        legal para isso.
      </p>
      <p>
        Algumas informações poderão ser mantidas quando existir obrigação legal,
        necessidade de segurança, prevenção de fraude ou outra base permitida
        pela legislação.
      </p>
      <p>Solicitações devem ser enviadas para:</p>
      <p>
        <strong>joaogabrielcaracato@gmail.com</strong>
      </p>
      <p>
        Informe seu <strong>Discord User ID</strong> e, quando relacionado a um
        servidor, o <strong>Server/Guild ID</strong>, para permitir a localização
        correta dos registros.
      </p>
      <p>Nunca envie senha ou token da sua conta Discord.</p>

      <h2>13. Direitos previstos na LGPD</h2>
      <p>
        Quando a Lei Geral de Proteção de Dados Pessoais do Brasil for aplicável,
        o titular poderá exercer os direitos previstos na legislação, incluindo
        confirmação da existência de tratamento, acesso, correção, anonimização,
        bloqueio ou eliminação quando cabível, informações sobre
        compartilhamento e outras solicitações previstas legalmente.
      </p>
      <p>
        Pedidos serão analisados considerando a identidade do solicitante,
        contexto do tratamento e obrigações legais aplicáveis.
      </p>

      <h2>14. Segurança</h2>
      <p>
        O Kagetsu utiliza mecanismos destinados a reduzir riscos de acesso
        indevido, incluindo isolamento de dados por servidor, controles de
        sessão, verificações de permissão, proteção de credenciais e restrições
        de acesso às funções administrativas.
      </p>
      <p>Nenhum método de armazenamento ou transmissão de informações é completamente imune a riscos.</p>

      <h2>15. Menores de idade</h2>
      <p>O Kagetsu não é destinado a contornar as regras de idade estabelecidas pelo Discord.</p>
      <p>Usuários devem cumprir os requisitos de idade aplicáveis à plataforma Discord e à legislação de sua região.</p>

      <h2>16. Alterações desta Política</h2>
      <p>
        Esta Política poderá ser atualizada conforme novas funcionalidades forem
        adicionadas, práticas de tratamento forem modificadas ou mudanças legais
        ocorrerem.
      </p>
      <p>A data da versão mais recente ficará indicada no início do documento.</p>

      <h2>17. Contato</h2>
      <p>
        Para assuntos relacionados à privacidade, proteção de dados ou
        solicitações relacionadas aos seus dados:
      </p>
      <p>
        <strong>joaogabrielcaracato@gmail.com</strong>
      </p>
    </LegalPage>
  );
}
