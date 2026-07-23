# Backend do Projeto Evangelismo Digital

## 📋 Sumário:

1. [Visão Geral](#visao-geral)
2. [Estrutura do Projeto](#estrutura-do-projeto)
3. [Tipos de Usuários](#tipos-de-usuarios)
4. [Funcionalidades por Requisito](#funcionalidades-por-requisito)
5. [Requisitos Não Funcionais](#requisitos-nao-funcionais)
6. [Casos de Uso Principais](#casos-de-uso-principais)
7. [Como Executar o Servidor](#como-executar-o-servidor)
8. [Links Externos](#links-externos)
9. [Equipe de Desenvolvimento](#equipe-de-desenvolvimento)

<a name="visao-geral"></a>

## 🗺️ Visão Geral:

Neste repositório está o projeto para ...

---

<a name="estrutura-do-projeto"></a>

## 📂 Estrutura do Projeto:

```bash
├─── .github
├─── .vscode
├─── logs
├─── prisma
└─── src
     ├─── @types
     ├─── constants
     ├─── env
     ├─── http
     │    ├─── controllers
     │    │    ├─── health-check
     │    │    └─── users
     │    ├─── middlewares
     │    └─── schemas
     │         ├───users
     │         └───utils
     ├─── lib
     │    ├─── logger
     │    └─── prisma
     ├─── repositories
     │    └─── prisma
     ├─── templates
     │    └─── forgot-password
     ├─── use-cases
     │    ├─── errors
     │    ├─── factories
     │    ├─── messaging
     │    └─── users
     └─── utils
```

---

<a name="tipos-de-usuarios"></a>

## 👤 Tipos de Usuários:

<div align="center">

| Tipo de Usuário   |            Permissões Principais            |
| :---------------: | :-----------------------------------------: |
|   Admin           |       Gerenciamento global do sistema       |
|   Default         | Usuário do sistema sem permissões especiais |

</div>

---

<a name="funcionalidades-por-requisito"></a>

## ✅ Funcionalidades por Requisito:

### 📌 Requisito 1 – (Nome do Requisito 1):

* [x] 1.1 Cadastro de usuário
* [x] 1.2 Redefinição de senha (esqueci a senha)
* [x] 1.3 Login com email e senha
* [ ] 1.4 Login com CPF

### 📌 Requisito 2 – (Nome do Requisito 2):

* [ ] 2.1 ...
* [ ] 2.2 ...

  * [ ] 2.2.1 ...
  * [ ] 2.2.2 ...
* [ ] 2.3 ...

---

<a name="requisitos-nao-funcionais"></a>

## 🧪 Requisitos Não Funcionais:

* [x] NF.1 - Segurança: controle de acesso por tipo de usuário
* [ ] NF.2 - ...
* [ ] NF.3 - ...

---

<a name="casos-de-uso-principais"></a>

## 🛠️ Casos de Uso Principais:

* [x] 1\. Usuário se cadastra no sistema
* [x] 2\. Administrador gerencia o sistema
* [ ] 3\. ...
* [ ] 4\. ...

<a name="como-executar-o-servidor"></a>

## 💻 Como Executar o Servidor em modo de Desenvolvimento:

1. Abra o terminal - `CMD`, `PowerShell`, `Bash` ou similares - em algum diretório de preferência em sua máquina.
2. No terminal, instale nvm através do chocolatey: `choco install nvm`
3. Clone este repositório com o comando: `git clone https://github.com/Amaro-peter/EvangelismoDigitalBackend.git`.
4. Navegue para dentro do projeto clonado com o comando: `cd backend-template-reborn`.
5. Instale a versão do NodeJs com o comando `nvm install 20.19.0`.
6. Execute `nvm use 20.19.0` para usar a versão
7. Instale as dependências do projeto ao executar no console o comando: `npm install`.
8. Crie um arquivo `.env` na raiz do projeto copiando o conteúdo do `.env.example`. Preencha manualmente os valores que não estiverem definidos.
9. Envie no console o comando `npx prisma generate`.
10. Rode o comando do `docker-compose up --build` para subir os servidores do projeto.
11. Se quiser desligar o servidor `docker-compose down -v` (apaga tudo).

Observacao: quando a API roda diretamente na maquina com `npm run start:dev`, o Redis deve estar acessivel em `localhost:6379`. O hostname `redis` so funciona dentro da rede do Docker.

### Se você já possui o Docker e deseja executar o Servidor em Produção. Faça:
1. Com o projeto aberto no terminal, execute `npm install --save-optional @rollup/rollup-linux-x64-gnu`.
2. Após a instalação, execute `docker-compose -f docker-compose.prod.yml up -d --build`.
3. O servidor de api, o database postgres, o redis e os workers devem estar funcionando.
4. Para testar, execute os comando `docker compose -f docker-compose.prod.yml logs -f` para ver o log stream de todos os serviços em execução.
5. Se quiser ver cada serviço de forma individual, basta rodar `docker compose -f docker-compose.prod.yml logs -f app` subsituindo por app, worker, redis ou db.

Se você já possui o <a href="https://pt.wikipedia.org/wiki/Docker_(software)" target="_blank">Docker</a> instalado e configurado em sua máquina, avance para a [etapa 6](#etapa-6) deste procedimento.

> \[!TIP]
> Para verificar se você possui o Docker instalado em sua máquina, você pode executar as seguintes etapas:
>
> ### Verificando a Existência do Docker no Windows
>
> Abra o menu iniciar e pesquise se o programa `Docker Desktop` está instalado em sua máquina. Alternativamente, abra um terminal com o WSL e tente o comando `sudo docker --version`. Se você não sabe abrir ou configurar o WSL, avance para a [etapa de instalação do Docker + WSL](#instalando-docker--wsl-no-windows) descrita posteriormente.
>
> ### Verificando a Existência do Docker no Linux
>
> Abra um terminal e execute o comando `sudo docker --version`. Se você obter uma mensagem de retorno com o comando bem-sucedido, o Docker estará instalado em sua máquina. , avance para a etapa de [instalação do Docker no Linux](#instalando-docker-no-linux).

Caso contrário, siga as etapas abaixo descrevendo o procedimento de instalação em sua máquina:

> \[!NOTE]
> Todos os comandos descritos a seguir podem e devem ser executados no terminal aberto diretamente na raiz do projeto clonado.

<a name="instalando-docker--wsl-no-windows"></a>

### Instalando Docker + WSL no Windows

Será necessário instalar previamente uma ferramenta de emulação do Linux no Windows chamada <a href="https://en.wikipedia.org/wiki/Windows_Subsystem_for_Linux" target="_blank">WSL (Windows Subsystem for Linux)</a> para suportar os contêineres de Docker. Para isto, abra um novo terminal com permissão de administrador e execute os comandos listados a seguir, respectivamente:

Instale o WSL na sua máquina com uma distro do Ubuntu utilizando o comando:

```bash
wsl --install
```

Inicie a primeira instância de usuário Linux no WSL com o comando a seguir:

```bash
wsl
```

Aguarde o término do processo e siga as etapas que o terminal solicitar, como a criação de um novo usuário e senha.

> \[!WARNING]
> Se você obtiver algum erro durante a execução de algum dos comandos listados acima, significa que o serviço necessário para criar a <a href="https://pt.wikipedia.org/wiki/M%C3%A1quina_virtual" target="_blank">máquina virtual (VM)</a> do WSL2. É um erro comum quando algum requisito do WSL2 está desativado, corrompido ou mal configurado. Para solucionar este problema, siga as seguintes etapas:
>
> 1. Abra um novo terminal com permissão de administrador.
> 2. Execute o comando `dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart` e, logo em seguida, execute `dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`.
> 3. Reinicie o seu computador.
> 4. Abra um terminal com permissão de administrador novamente.
> 5. Por fim, instale o WSL novamente com o comando `wsl --install`.
>
> Após concluir com êxito as etapas descritas acima, abra novamente um terminal na raíz do projeto e execute o comando `wsl` para acessar o terminal do wsl.

Finalizando as etapas anteriores, avance para o processo de instalação do Docker no Linux conforme descrito logo abaixo.

<a name="instalando-docker-no-linux"></a>

### Instalando Docker no Linux

Antes de proceder com a instalação, certifitique-se de remover quaisquer dependências conflitantes com o Docker de sua máquina. Para isto, execute o seguinte comando:

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done
```

> \[!TIP]
> Clique no ícone de "*copy to clipboard*" localizado no canto superior direito dos blocos de código com o estilo similar ao que está presente logo acima desta dica para copiar rapidamente todo o código contido no trecho.

Agora, antes de instalar o Docker, é preciso configurar o Docker apt Repository para preparar o ambiente de execução. Para tal, execute sequencialmente os comandos listados abaixo:

```bash
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```

Finalmente, basta agora instalar o próprio Docker em sua máquina com o comando:

```bash
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Se desejar checar a instalação bem sucedida do Docker, execute o comando `sudo docker run hello-world` para obter um `Hello World` diretamente do Docker.

Para mais informações detalhadas sobre a instalação do Docker em ambiente Linux, acesse <a href="https://docs.docker.com/engine/install/ubuntu/" target="_blank">este site</a>.

> \[!TIP]
> Alternativamente, você pode instalar o <a href="https://www.docker.com/products/docker-desktop/" target="_blank">Docker Desktop para Windows</a>, que já instala o Docker Engine e integra automaticamente com o WSL. Esta é a abordagem mais simples, mas necessita de um hardware mais potente.

> \[!NOTE]
> Durante a execução dos comandos de instalação do Docker no WSL, é possível que seja solicitada múltiplas vezes a senha <a href="https://en.wikipedia.org/wiki/Sudo" target="_blank">sudo (SuperUser Do)</a> do usuário. A senha digitada não irá aparecer no terminal enquanto você a preenche, mas basta escrevê-la corretamente e pressionar enter para enviá-la.

<!-- atalho para a etapa 6 do procedimento de execução do backend -->

<a name="etapa-6" display="none"></a>

6. Se você ainda não estiver dentro do WSL, inicie-o com o comando `wsl`.
7. Inicialize os contêiners do Docker executando o comando `sudo docker compose up -d` no terminal.
8. (**Opcional**) Execute `npx prisma migrate dev` para aplicar as migrações se desejar preservar dados existentes.
9. Execute `npx prisma migrate reset` para resetar o banco e popular com dados de teste definidos em `prisma/seed.ts`.
10. Rode o projeto com o comando: `npm run start:dev`.

<a name="links-externos"></a>

## 🔗 Links Externos:

* **Design Figma do Projeto**: <a href="#" target="_blank">Clique Aqui</a>
* **Template Backend Utilizado**: <a href="https://github.com/IN-Junior-UFF/backend-template-reborn" target="_blank">Clique Aqui</a>

<a name="equipe-de-desenvolvimento"></a>

## 👥 Equipe de Desenvolvimento:

* **Product Owner**: <a href="#" target="_blank">\<Nome 1></a>
* **Dev Backend**: <a href="#" target="_blank">\<Nome 2></a>
* **Dev Backend**: <a href="#" target="_blank">\<Nome 3></a>
