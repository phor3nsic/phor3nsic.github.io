---
layout: post
title: "Oddiscovery"
date: 2025-10-21
---

# Oddiscovery

**Oddiscovery** é uma ferramenta voltada à **descoberta de ativos** presentes no ambiente **Microsoft Office 365**, muito comum em grandes corporações.  
Seu principal objetivo é identificar **domínios adicionais associados ao mesmo tenant** (workspace) da Microsoft, os quais muitas vezes **não aparecem em ferramentas tradicionais de enumeração de subdomínios**.

---

## Onde tudo começou

Durante análises de diversos targets corporativos, é comum perceber que **existem domínios pertencentes à mesma organização** que não estão listados em fontes públicas, nem são detectados por ferramentas comuns de enumeração (como `amass`, `subfinder`, `assetfinder`, entre outras).  
Mesmo assim, esses domínios **podem autenticar no mesmo tenant do Office 365**, o que indica um vínculo corporativo direto.

Em uma dessas análises, ao testar a autenticação em um portal de login do **Office 365**, percebi que **vários domínios diferentes conseguiam autenticar no mesmo workspace** (por exemplo, `empresa.com` e `empresa-tech.com` redirecionando para o mesmo tenant Microsoft).  
Ao investigar mais a fundo e cruzar informações com a **documentação da Microsoft**, confirmei que isso ocorre porque **um mesmo tenant pode conter múltiplos domínios personalizados associados**, utilizados para:

- Gerenciamento de usuários com diferentes domínios de e-mail;
    
- Divisões regionais de uma empresa (ex: `empresa.us`, `empresa.eu`, `empresa.com.br`);
    
- Reestruturações de marca ou fusões corporativas.
    

Essa associação entre domínios pode ser verificada de forma indireta através de endpoints e respostas dos serviços Microsoft, como:

- `autodiscover.<domínio>`
    
- `login.microsoftonline.com`
    
- `login.windows.net`
    
- `graph.microsoft.com`
    

Esses serviços, ao receber um domínio não vinculado, costumam retornar erros genéricos. Entretanto, quando o domínio pertence a um tenant existente, a resposta contém **metadados que revelam o identificador do tenant (Tenant ID)** ou redirecionamentos específicos.

Além disso, ferramentas como o **TrevorSpray** demonstram esse mesmo comportamento, mostrando como é possível **identificar tenants e domínios adicionais** por meio de testes controlados de autenticação.

---

## Customizando

A partir dessas observações, decidi criar uma ferramenta **simples e automatizável**, capaz de integrar-se diretamente em **pipelines de reconhecimento** (recon automation).  
Assim nasceu o **Oddiscovery**.

A ferramenta recebe como entrada **um domínio principal**, realiza consultas automatizadas aos endpoints do Office 365 e, ao detectar o Tenant ID, busca **outros domínios atrelados ao mesmo workspace**.  
Os resultados são retornados de forma **organizada via STDOUT**, permitindo integração direta com outras ferramentas de recon, como:

```bash
oddiscovery empresa.com | tee tenants.txt | subfinder -silent | httpx
```

Essa abordagem simples já me rendeu **bons achados em programas de Bug Bounty**, especialmente em escopos amplos de empresas multinacionais, onde **muitos domínios corporativos secundários ficam esquecidos** — mas ainda **compartilham credenciais, políticas de login e superfícies expostas**.

Exemplo real de uso:

```
oddiscovery comcast.net
```

Resultado: retorno de domínios alternativos que **não aparecem em listagens públicas**, mas são **válidos e pertencem ao mesmo tenant** — o que amplia consideravelmente o escopo de análise.

---

## Entendendo o lado Microsoft (Análise Técnica)

O Microsoft 365 utiliza uma estrutura multi-tenant na qual **cada organização possui um identificador único (Tenant ID)** dentro do Azure AD.  
Esse tenant pode ter diversos **domínios verificados** associados, que são adicionados através do portal de administração (`admin.microsoft.com`) ou via API.  
Durante o processo de login, o serviço tenta **resolver o domínio informado** e determinar **a qual tenant ele pertence**.

Tecnicamente, quando um domínio é verificado em um tenant, o serviço passa a responder requisições de descoberta (como `autodiscover`, `OpenID Connect metadata`, e `OAuth2 authorization endpoints`) associando aquele domínio ao mesmo **Tenant ID**.  
Essas respostas contêm informações públicas o suficiente para que uma ferramenta automatizada consiga identificar o vínculo entre múltiplos domínios.

O **Oddiscovery** explora exatamente esse comportamento legítimo do serviço Microsoft, de forma **não intrusiva** e **totalmente passiva**, sem realizar tentativas de login ou bruteforce, mantendo-se dentro dos limites éticos e legais de coleta de informações públicas (OSINT).

---

## Conclusão

O **Oddiscovery** nasceu da necessidade de enxergar **além da superfície** na fase de reconhecimento, aproveitando peculiaridades do ecossistema Microsoft 365 para **mapear a verdadeira extensão de um tenant corporativo**.  
Ele é uma ferramenta simples, mas poderosa, que se integra facilmente em pipelines de automação e complementa técnicas tradicionais de enumeração de domínios — entregando resultados que podem **revelar ativos críticos não mapeados** e, consequentemente, **novas oportunidades de vulnerabilidades** dentro do escopo de bug bounty.
