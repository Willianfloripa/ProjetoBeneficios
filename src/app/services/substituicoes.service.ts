import { Injectable } from '@angular/core';

interface Substituicao {
  original: string;
  correto: string;
  campos: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SubstituicoesService {
  private substituicoes: Substituicao[] = [
    {
      original: 'CAMILA DOS SANTOS',
      correto: 'CAMILA DOS SANTOS DO LIVRAMENTO',
      campos: ['NOME_TITULAR', 'NOME_BENEFICIARIO']
    },
    {
      original: 'MADLENE MARIA DE ABREU',
      correto: 'MARCELO AMARAL ROSA',
      campos: ['NOME_TITULAR']
    },
    {
      original: 'MARIA RAFAELA GOMES',
      correto: 'FERNANDA ARAGAO LOPES',
      campos: ['NOME_TITULAR']
    }
  ];

  corrigirNome(nome: string, campo: string): string {
    const substituicao = this.substituicoes.find(s =>
      s.original === nome && s.campos.includes(campo)
    );
    return substituicao ? substituicao.correto : nome;
  }
}
