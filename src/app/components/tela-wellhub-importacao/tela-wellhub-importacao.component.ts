import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { Router } from '@angular/router';
import { LoadingService } from '../../services/loading.service';
import { DadoPadrao } from './dado-padrao.model';
import { DADOS_FIXOS_WELLHUB } from './dados-fixos-wellhub';

interface DadoExportacao {
  Name: string;
  Email: string;
  'National ID': string;
  'Employee ID': string;
  Department: string;
  'Payroll ID': string;
  'Cost center': string;
  'Office zip code': string;
  'Payroll Enabled': 'YES' | 'NO';
}

interface PlanilhaProcessada {
  nome: string;
  dados: Record<string, unknown>[];
}

@Component({
  selector: 'app-tela-wellhub-importacao',
  templateUrl: './tela-wellhub-importacao.component.html',
  styleUrls: ['./tela-wellhub-importacao.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TelaWellhubImportacaoComponent {
  searchTerm = '';
  dadosPadrao: DadoPadrao[] = [];
  filteredData: DadoPadrao[] = [];
  private planilhas: PlanilhaProcessada[] = [];
  private matriculasGeradas = new Set<string>();
  private cpfsFixos = new Set<string>();
  showModal = false;
  modalTitle = '';
  modalMessage = '';

  private readonly cargosSemDesconto = [
    'APRENDIZ AUXILIAR DE ESCRITORIO',
    'APRENDIZ AUXILIAR DE ESCRITORIO SEIS HORAS',
    'ESTAGIARIO ADMINISTRATIVO'
  ];

  constructor(
    private router: Router,
    private loadingService: LoadingService
  ) {}

  // --- Importação ---

  triggerFileInput() {
    document.getElementById('fileInput')?.click();
  }

  async importarPlanilha(event: Event) {
    const input = event.target as HTMLInputElement;
    try {
      this.loadingService.show('Processando planilha...');
      const files = input.files;
      if (!files?.length) return;

      this.planilhas = [];

      for (const file of Array.from(files)) {
        const planilhasDoArquivo = await this.lerPlanilha(file);
        this.planilhas.push(...planilhasDoArquivo);
      }

      if (this.planilhas.length > 0) {
        this.processarDados();
      } else {
        this.mostrarModal('Aviso', 'Nenhuma aba válida encontrada. A planilha deve conter as abas Funcionário e Endereço Eletrônico.');
      }
    } catch (error) {
      console.error('Erro ao processar planilha:', error);
      this.mostrarModal('Erro', 'Ocorreu um erro ao processar a planilha. Verifique o formato do arquivo.');
    } finally {
      this.loadingService.hide();
      input.value = '';
    }
  }

  private lerPlanilha(file: File): Promise<PlanilhaProcessada[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const result = e.target?.result;
          if (!result) {
            resolve([]);
            return;
          }

          const workbook = XLSX.read(result, { type: 'binary', cellDates: true });
          const planilhasDoArquivo: PlanilhaProcessada[] = [];

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const dados = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
            if (dados.length > 0) {
              planilhasDoArquivo.push({ nome: sheetName, dados });
            }
          });

          resolve(planilhasDoArquivo);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsBinaryString(file);
    });
  }

  // --- Tratamento de dados ---

  private carregarDadosFixos() {
    const dadosFixos = this.obterDadosFixos();
    this.cpfsFixos = new Set(dadosFixos.map(d => this.limparCPF(d.CPF)));
    this.dadosPadrao = dadosFixos;
    this.filteredData = [...dadosFixos];
    this.inicializarMatriculasGeradas(dadosFixos);
  }

  private obterDadosFixos(): DadoPadrao[] {
    return DADOS_FIXOS_WELLHUB.map(dado => ({
      ...dado,
      CPF: this.formatarCPF(dado.CPF)
    }));
  }

  private inicializarMatriculasGeradas(dados: DadoPadrao[]) {
    this.matriculasGeradas.clear();
    dados.forEach(d => this.matriculasGeradas.add(d.MATRICULA_WLLHUB));
  }

  private processarDados() {
    const abaFuncionario = this.encontrarAba(['funcionario', 'funcionarios']);
    const abaEmail = this.encontrarAba(['endereco eletronico', 'endereco eletrônico']);

    if (!abaFuncionario) {
      this.mostrarModal('Aviso', 'Aba "Funcionário" não encontrada na planilha.');
      return;
    }

    this.carregarDadosFixos();

    const emailsPorCpf = abaEmail ? this.montarMapaEmails(abaEmail.dados) : new Map<string, string>();
    const dadosProcessados: DadoPadrao[] = [...this.obterDadosFixos()];
    this.inicializarMatriculasGeradas(dadosProcessados);

    abaFuncionario.dados.forEach(linha => {
      const cpf = this.limparCPF(String(this.obterValor(linha, ['CPF', 'CPF FUNCIONÁRIO', 'CPF FUNCIONARIO']) || ''));
      if (!cpf || this.cpfsFixos.has(cpf)) return;

      const funcionario = String(this.obterValor(linha, ['FUNCIONÁRIO', 'FUNCIONARIO', 'NOME']) || '').trim();
      if (!funcionario) return;

      const cc = String(this.obterValor(linha, ['CC', 'CENTRO CUSTO', 'CENTRO DE CUSTOS']) || '').trim();
      if (this.deveExcluirCcBratec(cc, cpf)) return;

      const dataNascimento = this.formatarData(this.obterValor(linha, ['DATA NASCIMENTO', 'DATA_NASCIMENTO']));
      const prazo1 = this.obterValor(linha, ['PRAZO EXPERIÊNCIA (1)', 'PRAZO EXPERIENCIA (1)']);
      const prazo2 = this.obterValor(linha, ['PRAZO EXPERIÊNCIA (2)', 'PRAZO EXPERIENCIA (2)']);
      const cargo = String(this.obterValor(linha, ['CARGO']) || '').trim();

      dadosProcessados.push({
        FUNCIONARIO: funcionario,
        EMAIL: emailsPorCpf.get(cpf) || '',
        CPF: this.formatarCPF(cpf),
        MATRICULA_WLLHUB: this.gerarMatriculaWellhub(cpf, dataNascimento, funcionario),
        FILIAL: String(this.obterValor(linha, ['FILIAL']) || ''),
        MATRICULA: String(this.obterValor(linha, ['MATRÍCULA', 'MATRICULA']) || ''),
        CC: cc,
        DESCONTO_EM_FOLHA: this.calcularPayrollEnabled(cargo, prazo1, prazo2),
        DATA_NASCIMENTO: dataNascimento,
        DATA_ADMISSAO: this.formatarData(this.obterValor(linha, ['DATA ADMISSÃO', 'DATA ADMISSAO', 'DATA_ADMISSAO'])),
        SITUACAO_FUNCIONARIO: String(this.obterValor(linha, ['SITUAÇÃO FUNCIONÁRIO', 'SITUACAO FUNCIONARIO', 'SITUAÇÃO', 'SITUACAO']) || ''),
        CARGO: cargo,
        PRAZO_EXPERIENCIA_1: this.formatarData(prazo1),
        PRAZO_EXPERIENCIA_2: this.formatarData(prazo2)
      });
    });

    this.dadosPadrao = dadosProcessados;
    this.filteredData = [...this.dadosPadrao];
  }

  private encontrarAba(nomesPossiveis: string[]): PlanilhaProcessada | undefined {
    return this.planilhas.find(planilha => {
      const nomeNormalizado = this.normalizarTexto(planilha.nome);
      return nomesPossiveis.some(nome => nomeNormalizado.includes(this.normalizarTexto(nome)));
    });
  }

  private montarMapaEmails(dados: Record<string, unknown>[]): Map<string, string> {
    const mapa = new Map<string, string>();

    dados.forEach(linha => {
      const cpf = this.limparCPF(String(this.obterValor(linha, ['CPF FUNCIONÁRIO', 'CPF FUNCIONARIO', 'CPF']) || ''));
      if (!cpf || mapa.has(cpf)) return;

      const tipo = this.normalizarTexto(String(this.obterValor(linha, [
        'TIPO DE ENDEREÇO ELETRÔNICO',
        'TIPO DE ENDERECO ELETRONICO',
        'TIPO'
      ]) || ''));

      if (!tipo.includes('EMAIL')) return;

      const email = String(this.obterValor(linha, ['ENDEREÇO', 'ENDERECO', 'EMAIL']) || '').trim();
      if (email) {
        mapa.set(cpf, email);
      }
    });

    return mapa;
  }

  private gerarMatriculaWellhub(cpf: string, dataNascimento: string, nome: string): string {
    const cpfLimpo = this.limparCPF(cpf);
    const data = this.parseData(dataNascimento);
    const prefixo = cpfLimpo.slice(0, 5) + (data ? String(data.getFullYear()) : '');

    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) {
      return prefixo;
    }

    const indiceInicial = partes.length - 1;

    for (let i = indiceInicial; i >= 1; i--) {
      const sobrenome = this.normalizarTexto(partes[i]);
      const matricula = `${prefixo}${sobrenome}`;

      if (!this.matriculasGeradas.has(matricula)) {
        this.matriculasGeradas.add(matricula);
        return matricula;
      }
    }

    const sobrenomeFallback = this.normalizarTexto(partes[indiceInicial]);
    const matricula = `${prefixo}${sobrenomeFallback}`;
    this.matriculasGeradas.add(matricula);
    return matricula;
  }

  private calcularPayrollEnabled(
    cargo: string,
    prazo1: unknown,
    prazo2: unknown
  ): 'YES' | 'NO' {
    if (this.isCargoSemDesconto(cargo)) {
      return 'NO';
    }

    const hoje = this.inicioDoDia(new Date());
    const dataPrazo1 = this.parseData(prazo1);
    const dataPrazo2 = this.parseData(prazo2);

    if (!dataPrazo1 && !dataPrazo2) {
      return 'YES';
    }

    if (dataPrazo1 && hoje > dataPrazo1 && !dataPrazo2) {
      return 'YES';
    }

    if (dataPrazo1 && dataPrazo2 && hoje > dataPrazo1 && hoje > dataPrazo2) {
      return 'YES';
    }

    return 'NO';
  }

  private isCargoSemDesconto(cargo: string): boolean {
    const cargoNormalizado = this.normalizarTexto(cargo);
    return this.cargosSemDesconto.some(c => cargoNormalizado === this.normalizarTexto(c));
  }

  private deveExcluirCcBratec(cc: string, cpf: string): boolean {
    return this.normalizarTexto(cc) === 'BRATEC' && !this.cpfsFixos.has(cpf);
  }

  private obterValor(linha: Record<string, unknown>, chaves: string[]): unknown {
    for (const chave of chaves) {
      if (linha[chave] !== undefined && linha[chave] !== null && linha[chave] !== '') {
        return linha[chave];
      }

      const chaveEncontrada = Object.keys(linha).find(coluna =>
        this.normalizarTexto(coluna) === this.normalizarTexto(chave)
      );

      if (chaveEncontrada && linha[chaveEncontrada] !== undefined && linha[chaveEncontrada] !== '') {
        return linha[chaveEncontrada];
      }
    }

    return '';
  }

  private parseData(valor: unknown): Date | null {
    if (valor === null || valor === undefined || valor === '') return null;

    if (valor instanceof Date && !isNaN(valor.getTime())) {
      return this.inicioDoDia(valor);
    }

    if (typeof valor === 'number') {
      const parsed = XLSX.SSF.parse_date_code(valor);
      if (parsed) {
        return this.inicioDoDia(new Date(parsed.y, parsed.m - 1, parsed.d));
      }
    }

    const texto = String(valor).trim();
    const partes = texto.split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const ano = parseInt(partes[2], 10);
      const data = new Date(ano, mes, dia);
      if (!isNaN(data.getTime())) {
        return this.inicioDoDia(data);
      }
    }

    return null;
  }

  private formatarData(valor: unknown): string {
    const data = this.parseData(valor);
    if (!data) return valor ? String(valor).trim() : '';

    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  private formatarCPF(cpf: string): string {
    const cpfLimpo = this.limparCPF(cpf);
    if (cpfLimpo.length !== 11) return cpf;
    return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private limparCPF(cpf: string): string {
    if (!cpf) return '';
    return cpf.toString().replace(/\D/g, '').padStart(11, '0');
  }

  private inicioDoDia(data: Date): Date {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  private mapearParaExportacao(dados: DadoPadrao[]): DadoExportacao[] {
    return dados.map(item => ({
      Name: item.FUNCIONARIO,
      Email: item.EMAIL,
      'National ID': item.CPF,
      'Employee ID': item.MATRICULA_WLLHUB,
      Department: item.FILIAL,
      'Payroll ID': item.MATRICULA,
      'Cost center': item.CC,
      'Office zip code': '',
      'Payroll Enabled': item.DESCONTO_EM_FOLHA
    }));
  }

  // --- Exportação ---

  exportToExcel() {
    try {
      this.loadingService.show('Exportando dados...');
      const dadosExportacao = this.mapearParaExportacao(this.dadosPadrao);
      const ws = XLSX.utils.json_to_sheet(dadosExportacao);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, 'employees-list-template.xlsx');
    } finally {
      this.loadingService.hide();
    }
  }

  // --- Uso da tela ---

  voltar() {
    this.loadingService.show();
    this.router.navigate(['/'])
      .finally(() => this.loadingService.hide());
  }

  filterData() {
    if (!this.searchTerm) {
      this.filteredData = [...this.dadosPadrao];
      return;
    }

    const termo = this.searchTerm.toLowerCase();
    this.filteredData = this.dadosPadrao.filter(item =>
      Object.values(item).some(value => {
        if (value === null || value === undefined) return false;
        return value.toString().toLowerCase().includes(termo);
      })
    );
  }

  getTotalRegistros(): number {
    return this.filteredData.length;
  }

  private mostrarModal(titulo: string, mensagem: string) {
    this.modalTitle = titulo;
    this.modalMessage = mensagem;
    this.showModal = true;
  }

  cancelModal() {
    this.showModal = false;
  }

  confirmModal() {
    this.showModal = false;
  }
}
