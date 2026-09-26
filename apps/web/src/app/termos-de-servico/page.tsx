import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termos de Serviço — Kagetsu",
  description: "Termos de Serviço do Kagetsu.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Termos de Serviço">
      <p>
        <strong>Última atualização: 26 de setembro de 2026</strong>
      </p>
      <p>
        Estes Termos de Serviço regulam o uso do <strong>Kagetsu</strong>,
        incluindo o bot para Discord, dashboard web, API e demais
        funcionalidades relacionadas.
      </p>
      <p>
        Ao adicionar o Kagetsu a um servidor, acessar o dashboard ou utilizar
        qualquer funcionalidade do serviço, você declara que leu e concorda com
        estes Termos.
      </p>
      <p>
        <strong>Responsável pelo serviço:</strong> João Gabriel Caraçato
      </p>
      <p>
        <strong>Contato:</strong> joaogabrielcaracato@gmail.com
      </p>

      <h2>1. Sobre o Kagetsu</h2>
      <p>
        O Kagetsu é uma plataforma de gerenciamento e automação para servidores
        Discord.
      </p>
      <p>
        Entre suas funcionalidades podem estar sistemas de experiência e níveis,
        cargos automáticos, painéis de cargos, moderação, AutoMod, tickets,
        boas-vindas e saídas, sugestões, eventos, sorteios, logs, mensagens
        automáticas, salas temporárias, rankings, temporadas, missões e outras
        ferramentas de administração de comunidades.
      </p>
      <p>
        Nem todas as funcionalidades precisam estar disponíveis em todos os
        servidores. O administrador pode ativar ou desativar módulos conforme
        desejar.
      </p>

      <h2>2. Requisitos de uso</h2>
      <p>
        Para utilizar o Kagetsu, você deve possuir uma conta válida no Discord e
        cumprir os Termos de Serviço e Diretrizes da Comunidade do Discord.
      </p>
      <p>
        Administradores que configurarem o Kagetsu em um servidor declaram
        possuir autorização suficiente para realizar essas configurações.
      </p>
      <p>
        Caso o Discord estabeleça idade mínima superior à legislação local do
        usuário, prevalecerá o requisito aplicável ao uso da plataforma Discord.
      </p>

      <h2>3. Responsabilidade dos administradores</h2>
      <p>
        O administrador do servidor é responsável pelas configurações aplicadas
        ao Kagetsu dentro de sua comunidade.
      </p>
      <p>
        Isso inclui permissões concedidas ao bot, regras de moderação, mensagens
        automáticas, cargos, canais, AutoMod, tickets, punições, logs e demais
        recursos configuráveis.
      </p>
      <p>
        O Kagetsu não deve receber permissões superiores às necessárias para seu
        funcionamento.
      </p>
      <p>
        O responsável pelo Kagetsu não se responsabiliza por consequências
        decorrentes de configurações incorretas, permissões excessivas ou uso
        indevido por administradores do servidor.
      </p>

      <h2>4. Uso aceitável</h2>
      <p>
        É proibido utilizar o Kagetsu para atividades ilegais, abuso, assédio,
        spam, fraude, tentativa de exploração de vulnerabilidades, acesso não
        autorizado a dados, distribuição de malware, violação dos Termos do
        Discord ou qualquer atividade que possa prejudicar o Kagetsu, seus
        usuários, sua infraestrutura ou terceiros.
      </p>
      <p>
        Também é proibido tentar contornar limitações, sistemas de segurança,
        controles de acesso, rate limits ou mecanismos de isolamento entre
        servidores.
      </p>
      <p>O acesso de um servidor a dados pertencentes a outro servidor é expressamente proibido.</p>

      <h2>5. Conteúdo dos usuários</h2>
      <p>
        Mensagens, nomes, imagens, cargos, configurações, embeds, tickets e
        outros conteúdos inseridos por usuários ou administradores continuam
        pertencendo aos respectivos titulares.
      </p>
      <p>
        Ao utilizar recursos que exigem processamento desses conteúdos, você
        concede ao Kagetsu autorização limitada para armazenar, processar,
        transmitir ou exibir essas informações somente na medida necessária
        para fornecer o serviço.
      </p>
      <p>O Kagetsu não reivindica propriedade sobre o conteúdo dos usuários.</p>

      <h2>6. Moderação e ações automáticas</h2>
      <p>
        Algumas funcionalidades podem executar ações automáticas, como remoção
        de mensagens, avisos, timeouts, alteração de cargos ou outras ações de
        moderação.
      </p>
      <p>Essas ações dependem das configurações definidas pelos administradores do servidor.</p>
      <p>
        Sempre que aplicável, recursos potencialmente destrutivos devem exigir
        configuração explícita e permissões adequadas.
      </p>
      <p>O Kagetsu não substitui a supervisão humana da comunidade.</p>

      <h2>7. Tickets e transcrições</h2>
      <p>Servidores podem utilizar o sistema de tickets para atendimento privado.</p>
      <p>
        Dependendo da configuração, mensagens enviadas dentro de um ticket podem
        ser utilizadas para gerar uma transcrição quando o atendimento for
        encerrado.
      </p>
      <p>
        Administradores são responsáveis por informar seus membros sobre
        políticas internas de atendimento, moderação e retenção dessas
        informações quando necessário.
      </p>

      <h2>8. Disponibilidade do serviço</h2>
      <p>O Kagetsu é fornecido conforme disponibilidade.</p>
      <p>Não garantimos funcionamento contínuo ou livre de interrupções.</p>
      <p>
        O serviço pode ficar temporariamente indisponível devido a manutenção,
        atualizações, limitações do Discord, falhas de infraestrutura, rate
        limits, problemas de terceiros ou situações fora do nosso controle.
      </p>
      <p>Funcionalidades podem ser alteradas, removidas ou adicionadas ao longo do tempo.</p>

      <h2>9. Serviços de terceiros</h2>
      <p>
        O Kagetsu depende de serviços externos, incluindo Discord e provedores
        de hospedagem e infraestrutura.
      </p>
      <p>Falhas ou alterações nesses serviços podem afetar o funcionamento do Kagetsu.</p>
      <p>O uso do Discord também permanece sujeito aos próprios termos e políticas da plataforma.</p>

      <h2>10. Suspensão e encerramento</h2>
      <p>
        O acesso ao Kagetsu poderá ser limitado ou suspenso em casos de abuso,
        tentativa de exploração, violação destes Termos, risco à segurança,
        atividade ilegal ou risco à estabilidade da plataforma.
      </p>
      <p>Administradores podem remover o Kagetsu de seus servidores a qualquer momento.</p>

      <h2>11. Limitação de responsabilidade</h2>
      <p>
        Na extensão permitida pela legislação aplicável, o Kagetsu é fornecido
        sem garantias de disponibilidade permanente, adequação a uma finalidade
        específica ou ausência absoluta de erros.
      </p>
      <p>
        O responsável pelo Kagetsu não será responsável por perdas causadas por
        indisponibilidade do Discord, falhas externas, configurações realizadas
        pelos administradores, exclusões realizadas por usuários autorizados ou
        uso indevido do serviço.
      </p>
      <p>Nada nesta cláusula exclui direitos que não possam ser afastados pela legislação aplicável.</p>

      <h2>12. Segurança</h2>
      <p>
        São adotadas medidas técnicas destinadas a proteger contas, sessões,
        credenciais e dados armazenados.
      </p>
      <p>Entretanto, nenhum serviço conectado à internet pode garantir segurança absoluta.</p>
      <p>
        Caso seja identificada uma possível vulnerabilidade, ela deve ser
        comunicada de forma responsável pelo contato informado nestes Termos.
      </p>

      <h2>13. Alterações destes Termos</h2>
      <p>
        Estes Termos poderão ser atualizados para refletir alterações no
        Kagetsu, legislação, práticas de segurança ou funcionamento da
        plataforma.
      </p>
      <p>
        Mudanças relevantes poderão ser comunicadas através do dashboard,
        Discord ou outro canal apropriado.
      </p>
      <p>A versão atualizada será identificada pela data indicada no início deste documento.</p>

      <h2>14. Contato</h2>
      <p>Dúvidas relacionadas a estes Termos podem ser enviadas para:</p>
      <p>
        <strong>joaogabrielcaracato@gmail.com</strong>
      </p>
    </LegalPage>
  );
}
