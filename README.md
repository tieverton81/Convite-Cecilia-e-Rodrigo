# Convite — Rodrigo & Cecília

Primeira versão do convite digital, preparada para o projeto Firebase
`convite-cecilia-e-rodrigo`.

## Conteúdo já configurado

- Envelope fotográfico fechado com recorte transparente limpo, selo `RC`, destaque maior no celular e transição suave ao toque.
- Data: 14 de novembro de 2026, sábado, às 18 horas.
- Cerimônia: Paróquia Santa Luzia.
- Endereço: Av. João Paulo II, 90 - Vila Caraipe, Teixeira de Freitas - BA, 45997-335.
- Localização: <https://maps.app.goo.gl/WpbPDZEQMEfzUHRb7>.
- Formulário padrão de confirmação conectado à planilha Google do casamento.
- Lista de presentes integrada ao Firebase, com painel administrativo, links de afiliado, compra pessoal e Pix.
- Importação em lote de uma Lista de Afiliados pública do Mercado Livre, com prévia e seleção dos produtos.
- Monograma `RC`, envelope fotográfico, lacre dourado e favicon do selo personalizados em `dist/assets/`.
- “Can't Help Falling in Love”, em versão para cello e piano, configurada para iniciar ao abrir o envelope.
- Fotografias reais dos noivos otimizadas para a abertura, a seção “Um amor para celebrar” e o espaço após a confirmação de presença.

## Visualizar

Abra `dist/index.html` no navegador. Para testar em um servidor local:

```bash
python3 -m http.server 8080 --directory dist
```

Depois, acesse <http://localhost:8080>.

## Confirmações em uma planilha Google

O serviço de confirmações foi implantado como Aplicativo da Web e o endereço
terminado em `/exec` já está configurado em `dist/config.js`. As respostas dos
convidados serão registradas na aba `Confirmações` da planilha configurada em
`apps-script/Code.gs`.

O mesmo Apps Script também contém o importador de nome e foto dos produtos. Para
ativá-lo depois de substituir o conteúdo de `Code.gs`:

1. Abra o projeto do Apps Script usado pelo formulário.
2. Salve a nova versão do código.
3. Entre em **Implantar > Gerenciar implantações**.
4. Edite a implantação atual, selecione **Nova versão** e implante novamente.

O endereço terminado em `/exec` permanece o mesmo.

## Painel dos noivos e lista de presentes

O painel fica em:

<https://convite-cecilia-e-rodrigo.web.app/admin>

O acesso é permitido somente para a conta
`ceciliaalves.rodrigocosta@gmail.com`. Antes de usá-lo pela primeira vez:

1. No Firebase Console, abra **Authentication** e clique em **Começar**.
2. Em **Método de login**, habilite o provedor **Google**.
3. Abra **Firestore Database**, crie o banco no modo de produção e escolha a
   região mais próxima disponível.
4. Na pasta deste projeto, publique o painel e as regras de segurança:

```bash
firebase deploy --only firestore:rules,hosting --project convite-cecilia-e-rodrigo
```

No painel é possível:

- colar um link de afiliado `mercadolivre.com/sec/...` e importar nome e foto;
- colar uma Lista de Afiliados `meli.la/...`, revisar os itens encontrados e adicionar todos de uma vez;
- editar as informações importadas antes de publicar;
- configurar quantidade, ordem e formas de presentear;
- cadastrar chave Pix, titular, cidade, banco e código Pix Copia e Cola;
- conferir manualmente compras pessoais, compras online e Pix informados;
- confirmar ou recusar cada aviso e reabrir uma confirmação feita por engano.

Ao confirmar um aviso ligado a um presente, o contador disponível é atualizado.
Os convidados nunca conseguem confirmar pagamentos por conta própria.

### Observações sobre o importador

O link encurtado precisa ser resolvido uma vez pelo Apps Script para descobrir o
produto. Isso pode aparecer como um clique administrativo nas métricas de
afiliado. O resultado é salvo no Firestore e não é consultado novamente durante
as visitas dos convidados. Se o Mercado Livre bloquear a leitura ou retirar o
produto, nome e foto podem ser preenchidos manualmente.

Na importação em lote, cada presente usa como destino a própria Lista de
Afiliados informada. Assim, o convite não troca o endereço afiliado por um link
comum do produto. O painel sempre exibe uma prévia e não duplica itens que já
tenham o mesmo identificador do Mercado Livre.

### Privacidade do Pix

A chave Pix cadastrada é pública para os convidados. Prefira uma chave aleatória
e não cadastre agência, conta, senha ou qualquer credencial bancária. A
confirmação é manual: o convidado apenas informa que enviou o valor, e os noivos
confirmam depois de conferir o extrato.

## Publicar no Firebase Hosting

Com o Firebase CLI instalado e a conta correta conectada:

```bash
firebase deploy --only firestore:rules,hosting --project convite-cecilia-e-rodrigo
```

O endereço esperado será <https://convite-cecilia-e-rodrigo.web.app> após a primeira publicação.

## Trocas futuras

- As fotografias atuais estão em `dist/assets/hero-tree-v7.webp`, `dist/assets/celebration-saint-v7.webp` e `dist/assets/after-rsvp-v7.webp`.
- A música atual está em `dist/assets/cant-help-falling-in-love-v7.mp3`.
- As informações públicas do Pix ficam no documento `settings/public` do Firestore.
- Presentes, reservas e avisos de Pix ficam nas coleções `gifts`, `reservations` e `pixContributions`.
