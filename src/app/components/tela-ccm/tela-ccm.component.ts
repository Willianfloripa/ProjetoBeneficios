import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { Router } from '@angular/router';
import { SubstituicoesService } from '../../services/substituicoes.service';
import { LoadingService } from '../../services/loading.service';

interface DadoPadrao {
  PLANOS: string;
  MATRICULA: string;
  TITULARIDADE: string;
  TITULARIDADE_DEPENDENTES: string;
  CENTRO_CUSTO: string;
  GRAU_PARENTESCO: string;
  CPF: string;
  NASCIMENTO: string;
  LANCAMENTO: string;
  MENSALIDADE_DESCONTO: number;
  COPART_DESCONTO: number;
  STATUS: string;
}

@Component({
  selector: 'app-tela-ccm',
  templateUrl: './tela-ccm.component.html',
  styleUrls: ['./tela-ccm.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TelaCcmComponent {
  searchTerm: string = '';
  dadosPadrao: DadoPadrao[] = [];
  filteredData: DadoPadrao[] = [];
  private planilhas: any[] = [];
  showModal = false;
  modalTitle = '';
  modalMessage = '';

  constructor(
    private router: Router,
    private substituicoesService: SubstituicoesService,
    private loadingService: LoadingService
  ) {}

  filterData() {
    if (!this.searchTerm) {
      this.filteredData = [...this.dadosPadrao];
      return;
    }

    const searchTermLower = this.searchTerm.toLowerCase();
    this.filteredData = this.dadosPadrao.filter(item => {
      return Object.values(item).some(value => {
        if (value === null || value === undefined) return false;
        return value.toString().toLowerCase().includes(searchTermLower);
      });
    });
  }

  voltar() {
    this.loadingService.show();
    this.router.navigate(['/'])
      .finally(() => this.loadingService.hide());
  }

  triggerFileInput() {
    document.getElementById('fileInput')?.click();
  }

  async importarPlanilha(event: any) {
    try {
      this.loadingService.show('Processando dados...');
      const files = event.target.files;
      if (!files) return;

      this.planilhas = [];
      this.dadosPadrao = [];

      for (const file of Array.from(files)) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async (e: any) => {
            const workbook = XLSX.read(e.target.result, { type: 'binary' });

            workbook.SheetNames.forEach(sheetName => {
              const worksheet = workbook.Sheets[sheetName];
              const dados = XLSX.utils.sheet_to_json(worksheet);
              const dadosNormalizados = dados.map((row: any) => {
                const newRow: any = {};
                Object.keys(row).forEach(key => {
                  newRow[key.toUpperCase().trim()] = row[key];
                });
                return newRow;
              });
              this.planilhas.push(dadosNormalizados);
            });
            resolve(null);
          };
          reader.readAsBinaryString(file as Blob);
        });
      }

      if (this.planilhas.length > 0) {
        await this.processarDados();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  private async processarDados() {
    if (!this.planilhas.length) return;

    // Separar planilhas CCM e Arena
    const ccm = this.planilhas.find(p => this.isCCMPlanilha(p)) || [];
    const arena = this.planilhas.find(p => this.isArenaPlanilha(p)) || [];
    const arenaFuncionarios = this.planilhas.find(p => this.isArenaFuncionariosPlanilha(p)) || [];
    const arenaDependentes = this.planilhas.find(p => this.isArenaDependentesPlanilha(p)) || [];

    // Filtrar registros de taxa
    const registrosSemTaxa = ccm.filter((d: any) =>
      (d.NOME_BENEFICIARIO || d.BENEFICIARIO)
    );

    // Calcular taxa separadamente
    const taxaTotal = ccm
      .filter((d: any) =>
        !d.NOME_BENEFICIARIO &&
        !d.BENEFICIARIO
      )
      .reduce((sum: number, d: any) => sum + Number(d.VALOR || 0), 0);

    const dadosProcessados = registrosSemTaxa.map((dado: any) => {
      const nomeTitular = this.limparTexto(
        this.substituicoesService.corrigirNome(dado.NOME_TITULAR || dado.TITULAR, 'NOME_TITULAR')
      );
      const nomeBeneficiario = this.limparTexto(
        this.substituicoesService.corrigirNome(dado.NOME_BENEFICIARIO || dado.BENEFICIARIO, 'NOME_BENEFICIARIO')
      );

      // Buscar titular no Arena (mantém busca original)
      const titularArena = arena.find((a: any) =>
        this.compararNomes(this.limparTexto(a.FUNCIONARIO || a.FUNCIONÁRIO), nomeTitular)
      );

      // Buscar dependente na aba de dependentes
      const dadosDependente = nomeBeneficiario !== nomeTitular ?
        arenaDependentes.find((a: any) => {
          const nomeDependente = this.limparTexto(a.NOME || '');
          const nomeFuncionarioDep = this.limparTexto(a['NOME FUNCIONÁRIO'] || '');
          return this.compararNomes(nomeDependente, nomeBeneficiario) &&
                 this.compararNomes(nomeFuncionarioDep, nomeTitular);
        }) : null;

      // Tratar o nome do plano
      const plano = dado.DESCRICAO_SERVICO || 'CCM';
      const planoProcessado = this.processarNomePlano(plano);

      // Verificar se é co-participação
      const isCopart = plano.toUpperCase().includes('CO-PARTICIPACAO');
      const valor = Number(dado.VALOR || 0);

      // Montar o registro padrão
      const dadoPadrao: DadoPadrao = {
        PLANOS: planoProcessado,
        MATRICULA: titularArena?.MATRICULA || titularArena?.MATRÍCULA || dado.MATRICULA || '',
        TITULARIDADE: nomeTitular,
        TITULARIDADE_DEPENDENTES: nomeBeneficiario,
        CENTRO_CUSTO: titularArena?.CC || '',
        GRAU_PARENTESCO: nomeBeneficiario === nomeTitular ?
          'TITULAR' :
          dadosDependente?.['GRAU DE PARENTESCO'] || '',
        CPF: nomeBeneficiario === nomeTitular ?
          titularArena?.CPF :
          dadosDependente?.CPF || '',
        NASCIMENTO: nomeBeneficiario === nomeTitular ?
          titularArena?.['DATA NASCIMENTO'] :
          dadosDependente?.['DATA DE NASCIMENTO'] || '',
        LANCAMENTO: isCopart ? 'Mensalidade + Co-part' : 'Mensalidade',
        MENSALIDADE_DESCONTO: isCopart ? 0 : valor,
        COPART_DESCONTO: isCopart ? valor : 0,
        STATUS: this.substituicoesService.corrigirStatus(nomeTitular, titularArena?.['SITUAÇÃO FUNCIONÁRIO'] || '')
      };

      return dadoPadrao;
    });

    // Agrupar registros por titular+beneficiário
    const dadosAgrupados = dadosProcessados.reduce((acc: { [key: string]: DadoPadrao }, curr: DadoPadrao) => {
      const key = `${curr.TITULARIDADE}-${curr.TITULARIDADE_DEPENDENTES}`;
      if (!acc[key]) {
        acc[key] = curr;
      } else {
        acc[key].MENSALIDADE_DESCONTO += curr.MENSALIDADE_DESCONTO;
        acc[key].COPART_DESCONTO += curr.COPART_DESCONTO;
        // Atualizar o lançamento se houver ambos os valores
        if (acc[key].MENSALIDADE_DESCONTO > 0 && acc[key].COPART_DESCONTO > 0) {
          acc[key].LANCAMENTO = 'Mensalidade + Copart';
        }
      }
      return acc;
    }, {} as { [key: string]: DadoPadrao });

    // Montar array final com taxa e total
    const dadosFinal = Object.values(dadosAgrupados) as DadoPadrao[];
    const totalMensalidades = dadosFinal.reduce((sum: number, d: DadoPadrao) => sum + d.MENSALIDADE_DESCONTO, 0);

    // Adicionar linha de taxa se houver
    if (taxaTotal > 0) {
      dadosFinal.push({
        PLANOS: 'TAXA',
        MATRICULA: '',
        TITULARIDADE: '',
        TITULARIDADE_DEPENDENTES: '',
        CENTRO_CUSTO: 'FINANCEIRO',
        GRAU_PARENTESCO: '',
        CPF: '',
        NASCIMENTO: '',
        LANCAMENTO: '',
        MENSALIDADE_DESCONTO: taxaTotal,
        COPART_DESCONTO: 0,
        STATUS: ''
      });
    }

    // Adicionar linha de total
    dadosFinal.push({
      PLANOS: 'TOTAL',
      MATRICULA: '',
      TITULARIDADE: '',
      TITULARIDADE_DEPENDENTES: '',
      CENTRO_CUSTO: '',
      GRAU_PARENTESCO: '',
      CPF: '',
      NASCIMENTO: '',
      LANCAMENTO: '',
      MENSALIDADE_DESCONTO: totalMensalidades + taxaTotal,
      COPART_DESCONTO: dadosFinal.reduce((sum, d) => sum + d.COPART_DESCONTO, 0),
      STATUS: ''
    });

    this.dadosPadrao = dadosFinal;
    this.filteredData = [...this.dadosPadrao];
  }

  private processarNomePlano(plano: string): string {
    if (plano.toUpperCase().startsWith('CCM')) {
      return 'CCM';
    }

    // Para códigos específicos da AEMFLO
    const codigosAemflo: { [key: string]: string } = {
      '0901': 'AEMFLO',
      '0936': 'AEMFLO'
    };

    const match = plano.match(/^(\d{4})/);
    if (match && codigosAemflo[match[1]]) {
      return codigosAemflo[match[1]];
    }

    return plano;
  }

  private isCCMPlanilha(dados: any[]): boolean {
    return dados.some(d =>
      d.NOME_TITULAR !== undefined ||
      d.TITULAR !== undefined ||
      d.NOME_BENEFICIARIO !== undefined ||
      d.BENEFICIARIO !== undefined
    );
  }

  private isArenaPlanilha(dados: any[]): boolean {
    return dados.some(d =>
      d.FUNCIONÁRIO !== undefined ||
      d.FUNCIONARIO !== undefined ||
      d.MATRÍCULA !== undefined ||
      d.MATRICULA !== undefined
    );
  }

  private isArenaFuncionariosPlanilha(dados: any[]): boolean {
    return dados.some(d =>
      d.FUNCIONARIO !== undefined &&
      d.CPF !== undefined
    );
  }

  private isArenaDependentesPlanilha(dados: any[]): boolean {
    return dados.some(d =>
      d['NOME FUNCIONÁRIO'] !== undefined &&
      d.NOME !== undefined &&
      d['GRAU DE PARENTESCO'] !== undefined
    );
  }

  private compararNomes(nome1: string, nome2: string): boolean {
    const nome1Lower = nome1.toLowerCase();
    const nome2Lower = nome2.toLowerCase();
    return nome1Lower === nome2Lower;
  }

  private limparTexto(texto: string): string {
    return texto?.trim().replace('Ç', 'C') || '';
  }

  async exportToExcel() {
    try {
      this.loadingService.show('Exportando dados...');
      const ws = XLSX.utils.json_to_sheet(this.dadosPadrao);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, 'planilha_padrao.xlsx');
    } finally {
      this.loadingService.hide();
    }
  }

  cancelModal() {
    this.showModal = false;
  }

  confirmModal() {
    this.showModal = false;
    // Implementar ação de confirmação se necessário
  }
}
