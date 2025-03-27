import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { Router } from '@angular/router';
import { LoadingService } from '../../services/loading.service';

interface DadoPadrao {
  PLANOS?: string;
  MATRICULA?: string;
  NOME?: string;
  CPF?: string;
  VALOR?: string | number;
  FILIAL?: string;
  CENTRO_CUSTOS?: string;
  STATUS?: string;
  valor?: string | number;
}

interface ColunasMap {
  [key: string]: string[];
}

interface PlanilhaProcessada {
  nome: string;
  dados: any[];
}

@Component({
  selector: 'app-tela-wellhub',
  templateUrl: './tela-wellhub.component.html',
  styleUrls: ['./tela-wellhub.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TelaWellhubComponent {
  searchTerm: string = '';
  dadosPadrao: DadoPadrao[] = [];
  filteredData: DadoPadrao[] = [];
  private planilhas: PlanilhaProcessada[] = [];
  showModal = false;
  modalTitle = '';
  modalMessage = '';

  // Mapeamento de possíveis nomes de colunas
  private colunasMap: ColunasMap = {
    PLANOS: ['PLANOS', 'PLANO', 'PLAN', 'TIPO_PLANO', 'TIPO PLANO'],
    MATRICULA: ['MATRICULA', 'MATRÍCULA', 'PAYROLL_ID', 'PAYROLLID', 'ID', 'REGISTRATION'],
    NOME: ['NOME', 'FUNCIONÁRIO', 'FUNCIONARIO', 'FULL_NAME', 'FULLNAME', 'NAME', 'EMPLOYEE_NAME'],
    CPF: ['CPF', 'NATIONAL_ID', 'NATIONALID', 'DOCUMENTO', 'TAX_ID'],
    VALOR: ['VALOR', 'AMOUNT_DUE', 'AMOUNTDUE', 'VALUE', 'PRICE', 'TOTAL', 'AMOUNT', 'AMOUNT DUE', 'AMOUNT DUE (BRL)', 'AMOUNT DUE BRL'],
    FILIAL: ['FILIAL', 'DEPARTMENT', 'DEPARTAMENTO', 'BRANCH', 'UNIT'],
    CENTRO_CUSTOS: ['CENTRO_CUSTOS', 'CENTRO DE CUSTOS', 'CC', 'COST_CENTER', 'COSTCENTER'],
    STATUS: ['STATUS', 'SITUAÇÃO', 'SITUACAO', 'SITUAÇÃO FUNCIONÁRIO', 'SITUACAO FUNCIONARIO', 'EMPLOYEE_STATUS']
  };

  constructor(
    private router: Router,
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
      this.loadingService.show('Processando planilhas...');
      const files = event.target.files;
      if (!files) return;

      this.planilhas = [];
      this.dadosPadrao = [];

      // Processar cada arquivo
      for (const file of Array.from(files)) {
        const planilhasDoArquivo = await this.lerPlanilha(file as File);
        this.planilhas.push(...planilhasDoArquivo);
      }

      if (this.planilhas.length > 0) {
        await this.processarDados();
      }
    } catch (error) {
      console.error('Erro ao processar planilhas:', error);
      this.mostrarModal('Erro', 'Ocorreu um erro ao processar as planilhas. Verifique o formato dos arquivos.');
    } finally {
      this.loadingService.hide();
    }
  }

  private async lerPlanilha(file: File): Promise<PlanilhaProcessada[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const planilhasDoArquivo: PlanilhaProcessada[] = [];

      reader.onload = (e: any) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'binary' });

          // Primeiro, tenta encontrar a aba "Funcionário"
          const abaFuncionario = workbook.SheetNames.find(name =>
            name.toLowerCase().includes('funcionário') ||
            name.toLowerCase().includes('funcionario')
          );

          // Se encontrar a aba "Funcionário", processa ela primeiro
          if (abaFuncionario) {
            const worksheet = workbook.Sheets[abaFuncionario];
            const dados = XLSX.utils.sheet_to_json(worksheet);
            if (dados.length > 0) {
              const dadosNormalizados = this.normalizarDados(dados);
              planilhasDoArquivo.push({
                nome: abaFuncionario,
                dados: dadosNormalizados
              });
            }
          }

          // Depois processa as outras abas
          workbook.SheetNames.forEach(sheetName => {
            if (sheetName !== abaFuncionario) {
              const worksheet = workbook.Sheets[sheetName];
              const dados = XLSX.utils.sheet_to_json(worksheet);
              if (dados.length > 0) {
                const dadosNormalizados = this.normalizarDados(dados);
                planilhasDoArquivo.push({
                  nome: sheetName,
                  dados: dadosNormalizados
                });
              }
            }
          });

          resolve(planilhasDoArquivo);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  }

  private normalizarDados(dados: any[]): any[] {
    return dados.map(row => {
      const newRow: any = {};
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = this.normalizarNomeColuna(key.toString().trim().toUpperCase());
        // Se for CPF, normaliza o valor
        if (this.colunasMap['CPF'].includes(normalizedKey)) {
          newRow[normalizedKey] = this.formatarCPF(value);
        } else {
          newRow[normalizedKey] = value;
        }
      });
      return newRow;
    });
  }

  private formatarCPF(cpf: any): string {
    if (!cpf) return '';

    // Converter para string e remover caracteres não numéricos
    const cpfLimpo = cpf.toString().replace(/\D/g, '');

    // Verificar se tem 11 dígitos
    if (cpfLimpo.length !== 11) return cpf.toString();

    // Formatar no padrão CPF
    return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private normalizarNomeColuna(coluna: string): string {
    for (const [padrao, alternativas] of Object.entries(this.colunasMap)) {
      if (alternativas.some(alt =>
        coluna === alt.toUpperCase() ||
        coluna.replace(/[^A-Z0-9]/g, '') === alt.toUpperCase().replace(/[^A-Z0-9]/g, '')
      )) {
        return padrao;
      }
    }
    return coluna;
  }

  private encontrarValorColuna(dado: any, colunasPossiveis: string[]): any {
    for (const coluna of colunasPossiveis) {
      const valor = dado[coluna];
      if (valor !== undefined) return valor;
    }
    return '';
  }

  private async processarDados() {
    if (!this.planilhas.length) return;

    let dadosPrincipais: any[] = [];
    let dadosSecundarios: any[] = [];

    // Identificar planilhas principais e secundárias
    this.planilhas.forEach(planilha => {
      const temColunasPrincipais = planilha.dados.some((d: any) =>
        this.encontrarValorColuna(d, this.colunasMap['VALOR']) !== '' ||
        this.encontrarValorColuna(d, this.colunasMap['PLANOS']) !== ''
      );

      if (temColunasPrincipais) {
        dadosSecundarios.push(...planilha.dados);
      } else {
        dadosPrincipais.push(...planilha.dados);
      }
    });

    // Processar dados
    const cpfsProcessados = new Set<string>(); // Conjunto para controlar CPFs já processados
    const dadosProcessados = dadosPrincipais.map(dado => {
      const cpfPrincipal = this.limparCPF(this.encontrarValorColuna(dado, this.colunasMap['CPF']));

      // Se o CPF já foi processado, pula este registro
      if (cpfsProcessados.has(cpfPrincipal)) {
        return null;
      }

      const dadoCorrespondente = this.encontrarDadoCorrespondente(cpfPrincipal, dadosSecundarios);

      // Só processa se encontrar correspondência de CPF
      if (!dadoCorrespondente || Object.keys(dadoCorrespondente).length === 0) {
        return null;
      }

      // Adiciona o CPF ao conjunto de processados
      cpfsProcessados.add(cpfPrincipal);

      // Obter o status com valor padrão
      const statusPrincipal = this.encontrarValorColuna(dado, this.colunasMap['STATUS']);
      const statusSecundario = this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['STATUS']);
      const status = statusPrincipal || statusSecundario || 'ATIVO';

      // Obter o valor com tratamento especial
      const valorPrincipal = this.encontrarValorColuna(dado, this.colunasMap['VALOR']);
      const valorSecundario = this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['VALOR']);
      const valor = this.processarValor(valorPrincipal || valorSecundario);

      // Buscar nome apenas na planilha principal
      const nome = this.encontrarValorColuna(dado, this.colunasMap['NOME']);

      return {
        PLANOS: this.encontrarValorColuna(dado, this.colunasMap['PLANOS']) ||
                this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['PLANOS']),
        MATRICULA: this.encontrarValorColuna(dado, this.colunasMap['MATRICULA']) ||
                  this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['MATRICULA']),
        NOME: nome, // Usa apenas o nome da planilha principal
        CPF: this.formatarCPF(cpfPrincipal),
        VALOR: valor,
        FILIAL: this.encontrarValorColuna(dado, this.colunasMap['FILIAL']) ||
                this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['FILIAL']),
        CENTRO_CUSTOS: this.encontrarValorColuna(dado, this.colunasMap['CENTRO_CUSTOS']) ||
                      this.encontrarValorColuna(dadoCorrespondente, this.colunasMap['CENTRO_CUSTOS']),
        STATUS: status
      };
    }).filter(dado => dado !== null); // Remove registros sem correspondência ou duplicados

    this.dadosPadrao = dadosProcessados;
    this.filteredData = [...this.dadosPadrao];
  }

  private processarValor(valor: any): number {
    if (!valor) return 0;

    // Se for string, remove caracteres não numéricos exceto ponto e vírgula
    if (typeof valor === 'string') {
      // Remove caracteres não numéricos exceto ponto e vírgula
      const valorLimpo = valor.replace(/[^\d.,]/g, '');

      // Substitui vírgula por ponto para conversão
      const valorNumerico = valorLimpo.replace(',', '.');

      // Converte para número
      const numero = parseFloat(valorNumerico);

      // Se for um número válido, retorna
      if (!isNaN(numero)) {
        return numero;
      }
    }

    // Se for número, retorna diretamente
    if (typeof valor === 'number') {
      return valor;
    }

    return 0;
  }

  private limparCPF(cpf: string): string {
    if (!cpf) return '';

    // Converter para string e remover caracteres não numéricos
    const cpfLimpo = cpf.toString().replace(/\D/g, '');

    // Garantir que tenha 11 dígitos, preenchendo com zeros à esquerda se necessário
    return cpfLimpo.padStart(11, '0');
  }

  private encontrarDadoCorrespondente(cpfPrincipal: string, dadosSecundarios: any[]): any {
    if (!cpfPrincipal) return null;

    const cpfPrincipalLimpo = this.limparCPF(cpfPrincipal);

    return dadosSecundarios.find(d => {
      const cpfSecundario = this.limparCPF(this.encontrarValorColuna(d, this.colunasMap['CPF']));
      return cpfPrincipalLimpo === cpfSecundario;
    }) || null;
  }

  private mostrarModal(titulo: string, mensagem: string) {
    this.modalTitle = titulo;
    this.modalMessage = mensagem;
    this.showModal = true;
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
  }

  getTotalValue(): number {
    return this.filteredData.reduce((total, item) => {
      const valor = typeof item.VALOR === 'string' ? parseFloat(item.VALOR) : (item.VALOR || 0);
      return total + valor;
    }, 0);
  }
}
