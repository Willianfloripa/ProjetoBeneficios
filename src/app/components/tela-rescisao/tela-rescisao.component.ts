// 1. Imports necessários
import { Component, OnInit } from '@angular/core';
import { DataService } from '../../services/recisao.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';

export interface DadosPlanilha {
  [key: string]: string | number | undefined;
  nome?: string;
  nome_dependente?: string;
  grau_parentesco?: string;
  matricula?: string;
  cpf?: string;
  planos?: string;
  sinistro?: number;
  valor?: number;
  descricao?: string;
  observacao?: string;
}

interface ColunaDef {
  field: string;
  title: string;
}

@Component({
  selector: 'app-tela-rescisao',
  templateUrl: './tela-rescisao.component.html',
  styleUrls: ['./tela-rescisao.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule
  ]
})
export class TelaRescisaoComponent implements OnInit {
  carregando: boolean = false;
  dadosFiltrados: DadosPlanilha[] = [];
  termoBusca: string = '';
  colunaOrdenacao: string = '';
  direcaoOrdenacao: 'asc' | 'desc' | 'none' = 'none';
  editando: number = -2; // -2: não editando, -1: adicionando, 0..n: editando
  campoEditando: string = '';
  linhaEditando: any = {};
  novaLinha: any = {};
  mostrarModal: boolean = false;
  tituloModal: string = '';
  mensagemModal: string = '';
  callbackModal: () => void = () => {};

  // Propriedades de paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalPaginas: number = 1;

  // Getter para dados paginados
  get dadosPaginados(): DadosPlanilha[] {
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    return this.dadosFiltrados.slice(inicio, fim);
  }

  // Método para mudar de página
  mudarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaAtual = pagina;
      this.editando = -2; // Cancela qualquer edição em andamento
    }
  }

  private readonly CAMPOS_MONETARIOS = ['valor', 'sinistro'] as const;

  private readonly COLUNAS_PADRAO: ColunaDef[] = [
    { field: 'planos', title: 'Planos' },
    { field: 'matricula', title: 'Matrícula' },
    { field: 'nome', title: 'Nome' },
    { field: 'nome_dependente', title: 'Nome do Dependente' },
    { field: 'grau_parentesco', title: 'Grau de Parentesco' },
    { field: 'cpf', title: 'CPF' },
    { field: 'sinistro', title: 'Sinistro' },
    { field: 'valor', title: 'Valor' },
    { field: 'descricao', title: 'Descrição' },
    { field: 'observacao', title: 'Observação' }
  ];

  colunasExibidas: ColunaDef[] = [...this.COLUNAS_PADRAO];

  constructor(private dataService: DataService, private router: Router) {
    this.dadosFiltrados = this.dataService.getData();
    this.totalPaginas = Math.ceil(this.dadosFiltrados.length / this.itensPorPagina);
  }

  ngOnInit() {
    localStorage.removeItem('ordemColunas');
    this.carregarOrdemColunas();
  }

  // Importação de Dados e Exportação de Dados
  importarArquivo(evento: any) {
    const arquivo = evento.target.files[0];
    if (arquivo) {
      this.carregando = true;
      const leitor = new FileReader();

      leitor.onload = (e: any) => {
        try {
          const planilha = XLSX.read(e.target.result, { type: 'binary' });
          const dados: DadosPlanilha[] = [];

          planilha.SheetNames.forEach(nomeAba => {
            const planilhaAtual = planilha.Sheets[nomeAba];
            const dadosPlanilha = XLSX.utils.sheet_to_json<any[]>(planilhaAtual, {
              raw: true,
              header: 1,
              defval: ''
            }) as any[][];

            const colunas = this.encontrarColunas(dadosPlanilha);

            for (let i = colunas.linhaHeader + 1; i < dadosPlanilha.length; i++) {
              const dado = this.extrairDadosLinha(dadosPlanilha[i], colunas.indices);
              if (this.registroValido(dado)) {
                dados.push(dado);
              }
            }
          });

          const dadosExistentes = this.dataService.getData();
          const dadosNovos = dados.filter(novoItem =>
            !dadosExistentes.some(existente =>
              this.registrosIdenticos(novoItem, existente)
            )
          );

          const dadosCombinados = [...dadosExistentes, ...dadosNovos];
          this.dataService.setData(dadosCombinados);
          this.dadosFiltrados = dadosCombinados;
          this.totalPaginas = Math.ceil(this.dadosFiltrados.length / this.itensPorPagina);
          this.paginaAtual = 1;
        } catch (erro) {
          console.error('Erro ao processar arquivo:', erro);
          this.abrirModal(
            'Erro',
            'Ocorreu um erro ao processar o arquivo. Por favor, tente novamente.',
            () => {}
          );
        } finally {
          this.carregando = false;
        }
      };

      leitor.onerror = () => {
        this.carregando = false;
        this.abrirModal(
          'Erro',
          'Erro ao ler o arquivo. Por favor, tente novamente.',
          () => {}
        );
      };

      leitor.readAsBinaryString(arquivo);
    }
  }

  private encontrarColunas(dadosPlanilha: any[][]): { linhaHeader: number, indices: { [key: string]: number } } {
    const indices: { [key: string]: number } = {};
    let linhaHeader = 0;

    // Primeiro, encontrar a linha do cabeçalho
    for (let linha = 0; linha < Math.min(10, dadosPlanilha.length); linha++) {
      let encontrouHeader = false;

      for (let col = 0; col < dadosPlanilha[linha].length; col++) {
        const valor = String(dadosPlanilha[linha][col] || '').toLowerCase().trim();

        if (valor) {
          // Verificar se parece um cabeçalho (não é um número)
          if (!valor.match(/^\d+$/) && !valor.match(/^\d+[,\.]\d+$/)) {
            if (valor.match(/^nome$/)) {
              indices['nome'] = col;
              encontrouHeader = true;
            }
            else if (valor.match(/titularidade|dependentes/)) {
              indices['nome_dependente'] = col;
              encontrouHeader = true;
            }
            else if (valor.match(/grau.*parentesco|^parentesco$/) || valor === 'td') {
              if (indices['grau_parentesco'] === undefined) {
                indices['grau_parentesco'] = col;
              }
              encontrouHeader = true;
            }
            else if (valor.match(/^descricao|^desc$/)) indices['descricao'] = col;
            else if (valor.match(/^matricula|^matric|cod|registro/)) {
              indices['matricula'] = col;
              encontrouHeader = true;
            }
            else if (valor.match(/^cpf$|^cnpj$|^documento$|^doc$/)) {
              // Não sobrescrever se já foi definido
              if (indices['cpf'] === undefined) indices['cpf'] = col;
            }
            else if (valor.match(/^planos$/)) indices['planos'] = col;
            else if (valor.match(/sinistro/)) {
              if (indices['sinistro'] === undefined) {
                indices['sinistro'] = col;
              }
              encontrouHeader = true;
            }
            else if (valor.match(/^valor$|^preco$|^custo$/)) {
              // Não sobrescrever se já foi definido e garantir que não seja confundido com CPF
              if (indices['valor'] === undefined) indices['valor'] = col;
            }
            else if (valor.match(/^obs|^observ|^nota/)) indices['observacao'] = col;
          }
        }
      }

      // Se encontrou pelo menos nome ou matricula, esta é a linha do cabeçalho
      if (encontrouHeader) {
        linhaHeader = linha;
        break;
      }
    }

    return { linhaHeader, indices };
  }

  private extrairDadosLinha(linha: any[], indices: { [key: string]: number }): DadosPlanilha {
    const dado: DadosPlanilha = {};

    if (indices['nome'] !== undefined && indices['nome'] < linha.length) {
      dado.nome = this.formatarNome(String(linha[indices['nome']] || ''));
    }
    if (indices['descricao'] !== undefined && indices['descricao'] < linha.length) {
      dado.descricao = String(linha[indices['descricao']] || '');
    }
    if (indices['matricula'] !== undefined && indices['matricula'] < linha.length) {
      dado.matricula = String(linha[indices['matricula']] || '');
    }
    if (indices['grau_parentesco'] !== undefined && indices['grau_parentesco'] < linha.length) {
      const grau = String(linha[indices['grau_parentesco']] || '').trim();
      if (grau) {
        dado.grau_parentesco = grau.toUpperCase();
      }
    }

    const nomeDependente = this.extrairNomeDependente(linha, indices);
    if (nomeDependente) {
      dado.nome_dependente = nomeDependente;
    }

    // Extrair CPF - garantir que está pegando da coluna correta
    if (indices['cpf'] !== undefined && indices['cpf'] < linha.length) {
      const valorCPF = linha[indices['cpf']];
      // Garantir que não está pegando valor monetário por engano
      const valorCPFStr = String(valorCPF || '').trim();
      if (valorCPFStr && !valorCPFStr.match(/^[R$]/) && !valorCPFStr.match(/^\d+[,\.]\d+$/)) {
        dado.cpf = this.formatarCPF(valorCPFStr);
      }
    }

    if (indices['planos'] !== undefined && indices['planos'] < linha.length) {
      dado.planos = String(linha[indices['planos']] || '');
    }

    const sinistro = this.extrairValorMonetario(linha, indices['sinistro']);
    if (sinistro !== undefined) {
      dado.sinistro = sinistro;
    }

    const valor = this.extrairValorMonetario(linha, indices['valor']);
    if (valor !== undefined) {
      dado.valor = valor;
    }

    if (indices['observacao'] !== undefined && indices['observacao'] < linha.length) {
      dado.observacao = String(linha[indices['observacao']] || '');
    }

    return dado;
  }

  private carregarOrdemColunas() {
    const ordemSalva = localStorage.getItem('ordemColunas');
    if (ordemSalva) {
      const colunasSalvas = JSON.parse(ordemSalva) as ColunaDef[];
      const camposSalvos = new Set(colunasSalvas.map(col => col.field));
      const colunasNovas = this.COLUNAS_PADRAO.filter(col => !camposSalvos.has(col.field));
      this.colunasExibidas = [
        ...colunasSalvas.filter(col =>
          this.COLUNAS_PADRAO.some(colVal => colVal.field === col.field)
        ),
        ...colunasNovas
      ];
    } else {
      this.colunasExibidas = [...this.COLUNAS_PADRAO];
    }
  }

  exportarParaExcel() {
    const dadosParaExportar = this.dadosFiltrados.map(item => {
      const linha: any = {};
      this.colunasExibidas.forEach(col => {
        const valor = item[col.field];
        linha[col.title] = this.ehCampoMonetario(col.field)
          ? this.formatarMoeda(this.obterNumeroMonetario(valor))
          : String(valor ?? '');
      });
      return linha;
    });

    dadosParaExportar.push(this.montarLinhaTotal(''));
    dadosParaExportar.push(this.montarLinhaTotal('VALOR TOTAL A DESCONTAR', 'valor'));
    dadosParaExportar.push(this.montarLinhaTotal('SINISTROS EMPRESA', 'sinistro'));

    const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
    const idxLinhaValor = dadosParaExportar.length - 2;
    const idxLinhaSinistro = dadosParaExportar.length - 1;
    const limiteMesclagem = this.obterLimiteMesclagemRodape();

    this.aplicarTotaisNaPlanilha(ws, idxLinhaValor, idxLinhaSinistro);

    ws['!merges'] = [
      { s: { r: idxLinhaValor + 1, c: 0 }, e: { r: idxLinhaValor + 1, c: limiteMesclagem } },
      { s: { r: idxLinhaSinistro + 1, c: 0 }, e: { r: idxLinhaSinistro + 1, c: limiteMesclagem } }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });

    saveAs(blob, `dados_exportados_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  //CRUD
  barraPesquisa() {
    if (!this.termoBusca || this.termoBusca.length < 3) {
      this.dadosFiltrados = this.dataService.getData();
    } else {
      const termoMinusculo = this.termoBusca.toLowerCase();
      this.dadosFiltrados = this.dataService.getData().filter(item =>
        item.planos?.toLowerCase().includes(termoMinusculo) ||
        (item.nome?.toLowerCase().includes(termoMinusculo) ||
         item.nome_dependente?.toLowerCase().includes(termoMinusculo) ||
         item.grau_parentesco?.toLowerCase().includes(termoMinusculo) ||
         item.matricula?.toLowerCase().includes(termoMinusculo) ||
         item.cpf?.toLowerCase().includes(termoMinusculo))
      );
    }
    this.totalPaginas = Math.ceil(this.dadosFiltrados.length / this.itensPorPagina);
    this.paginaAtual = 1;
  }

  adicionarNovaLinha() {
    this.editando = -1;
    this.novaLinha = {
      nome: '',
      nome_dependente: '',
      grau_parentesco: '',
      matricula: '',
      cpf: '',
      planos: '',
      sinistro: '' as any,
      valor: '' as any,
      descricao: '',
      observacao: ''
    };
  }

  cancelarAdicao() {
    this.editando = -2;
    this.novaLinha = {};
  }

  cancelarEdicao() {
    this.editando = -2;
    this.campoEditando = '';
    this.linhaEditando = {};
  }

  editarCampo(indice: number, campo: string) {
    const indiceReal = (this.paginaAtual - 1) * this.itensPorPagina + indice;
    this.editando = indiceReal;
    this.campoEditando = campo;
    this.linhaEditando = { ...this.dadosFiltrados[indiceReal] };
    this.CAMPOS_MONETARIOS.forEach(campo => {
      this.linhaEditando[campo] = this.formatarValorParaInput(this.linhaEditando[campo]) as any;
    });
  }

  salvarNovaLinha() {
    if (this.novaLinha.nome) {
      if (this.novaLinha.cpf) {
        this.novaLinha.cpf = this.formatarCPF(this.novaLinha.cpf);
      }
      this.converterCamposMonetarios(this.novaLinha);
      this.dataService.setData([this.novaLinha, ...this.dataService.getData()]);
      this.dadosFiltrados = this.dataService.getData();
      this.cancelarAdicao();
    }
  }

  salvarEdicao() {
    if (this.linhaEditando.nome) {
      if (this.linhaEditando.cpf) {
        this.linhaEditando.cpf = this.formatarCPF(this.linhaEditando.cpf);
      }
      this.converterCamposMonetarios(this.linhaEditando);

      const dados = this.dataService.getData();
      const indiceNosDados = dados.findIndex(item =>
        item === this.dadosFiltrados[this.editando]
      );

      if (indiceNosDados !== -1) {
        const linhaAtualizada = {
          nome: this.linhaEditando.nome,
          nome_dependente: this.linhaEditando.nome_dependente,
          grau_parentesco: this.linhaEditando.grau_parentesco,
          matricula: this.linhaEditando.matricula,
          cpf: this.linhaEditando.cpf,
          planos: this.linhaEditando.planos,
          sinistro: this.linhaEditando.sinistro,
          valor: this.linhaEditando.valor,
          descricao: this.linhaEditando.descricao,
          observacao: this.linhaEditando.observacao
        };

        dados[indiceNosDados] = linhaAtualizada;
        this.dadosFiltrados[this.editando] = linhaAtualizada;
        this.dataService.setData([...dados]);
      }

      this.cancelarEdicao();
    }
  }

  excluirLinha(indice: number) {
    const indiceReal = (this.paginaAtual - 1) * this.itensPorPagina + indice;
    this.abrirModal(
      'Excluir Registro',
      'Tem certeza que deseja excluir este registro?',
      () => {
        const itemParaExcluir = this.dadosFiltrados[indiceReal];
        const dados = this.dataService.getData();
        const indiceOriginal = dados.findIndex(item =>
          item.nome === itemParaExcluir.nome &&
          item.matricula === itemParaExcluir.matricula &&
          item.cpf === itemParaExcluir.cpf
        );

        if (indiceOriginal > -1) {
          dados.splice(indiceOriginal, 1);
          this.dataService.setData(dados);
          this.barraPesquisa();
        }
      }
    );
  }

  limparDados() {
    this.abrirModal(
      'Limpar Dados',
      'Tem certeza que deseja limpar todos os dados?',
      () => {
        this.dataService.clearData();
        this.dadosFiltrados = [];
        this.termoBusca = '';
        this.totalPaginas = 1;
        this.paginaAtual = 1;
        const inputArquivo = document.getElementById('fileInput') as HTMLInputElement;
        if (inputArquivo) {
          inputArquivo.value = '';
        }
      }
    );
  }

  //Ordenação colunas
  soltarColuna(evento: CdkDragDrop<any[]>) {
    moveItemInArray(this.colunasExibidas, evento.previousIndex, evento.currentIndex);
    localStorage.setItem('ordemColunas', JSON.stringify(this.colunasExibidas));
  }

  ordenarDadosColunas(coluna: string) {
    if (this.colunaOrdenacao === coluna) {
      if (this.direcaoOrdenacao === 'asc') {
        this.direcaoOrdenacao = 'desc';
      } else if (this.direcaoOrdenacao === 'desc') {
        this.direcaoOrdenacao = 'none';
        this.colunaOrdenacao = '';
        this.dadosFiltrados = [...this.dataService.getData()];
        return;
      } else {
        this.direcaoOrdenacao = 'asc';
      }
    } else {
      this.colunaOrdenacao = coluna;
      this.direcaoOrdenacao = 'asc';
    }

    this.dadosFiltrados.sort((a: any, b: any) => {
      let valorA = a[coluna];
      let valorB = b[coluna];

      if (this.ehCampoMonetario(coluna)) {
        valorA = valorA || 0;
        valorB = valorB || 0;
      } else {
        valorA = valorA?.toString().toLowerCase() || '';
        valorB = valorB?.toString().toLowerCase() || '';
      }

      if (valorA === valorB) return 0;
      const comparacao = valorA > valorB ? 1 : -1;
      return this.direcaoOrdenacao === 'asc' ? comparacao : -comparacao;
    });

    this.totalPaginas = Math.ceil(this.dadosFiltrados.length / this.itensPorPagina);
    this.paginaAtual = 1;
  }

  //Modal de confirmação
  abrirModal(titulo: string, mensagem: string, callback: () => void) {
    this.tituloModal = titulo;
    this.mensagemModal = mensagem;
    this.callbackModal = callback;
    this.mostrarModal = true;
  }

  cancelarModal() {
    this.mostrarModal = false;
  }

  confirmarModal() {
    this.callbackModal();
    this.mostrarModal = false;
  }

  voltar() {
    this.router.navigate(['/']);
  }

  //Funções auxiliares
  obterValorTotal(): number {
    return this.obterSomaMonetaria('valor');
  }

  obterValorTotalSinistro(): number {
    return this.obterSomaMonetaria('sinistro');
  }

  private obterSomaMonetaria(campo: 'valor' | 'sinistro'): number {
    return this.dadosFiltrados.reduce(
      (total, item) => total + this.obterNumeroMonetario(item[campo]),
      0
    );
  }

  private obterNumeroMonetario(valor: unknown): number {
    if (valor === null || valor === undefined || valor === '') {
      return 0;
    }
    if (typeof valor === 'number') {
      return isNaN(valor) ? 0 : valor;
    }
    return this.converterValor(valor);
  }

  /** Mescla só até antes das colunas Sinistro/Valor para não apagar os totais */
  private obterLimiteMesclagemRodape(): number {
    const idxMonetario = this.colunasExibidas.findIndex(col =>
      col.field === 'sinistro' || col.field === 'valor'
    );
    return idxMonetario > 0 ? idxMonetario - 1 : 0;
  }

  private aplicarTotaisNaPlanilha(
    ws: XLSX.WorkSheet,
    indiceLinhaValor: number,
    indiceLinhaSinistro: number
  ): void {
    const escreverTotal = (indiceLinha: number, campo: 'valor' | 'sinistro') => {
      const coluna = this.colunasExibidas.findIndex(col => col.field === campo);
      if (coluna < 0) {
        return;
      }
      const ref = XLSX.utils.encode_cell({ r: indiceLinha + 1, c: coluna });
      ws[ref] = { t: 's', v: this.formatarMoeda(this.obterSomaMonetaria(campo)) };
    };

    escreverTotal(indiceLinhaValor, 'valor');
    escreverTotal(indiceLinhaSinistro, 'sinistro');
  }

  /** Monta linha de rodapé do Excel: rótulo na 1ª coluna e total na coluna valor ou sinistro */
  private montarLinhaTotal(rotulo: string, campo?: 'valor' | 'sinistro'): Record<string, string> {
    const linha: Record<string, string> = {};
    const total = campo ? this.obterSomaMonetaria(campo) : 0;

    this.colunasExibidas.forEach((col, indice) => {
      if (campo && col.field === campo) {
        linha[col.title] = this.formatarMoeda(total);
      } else if (indice === 0) {
        linha[col.title] = rotulo;
      } else {
        linha[col.title] = '';
      }
    });

    return linha;
  }

  formatarMoeda(valor: number | string | undefined): string {
    if (!valor && valor !== 0) return 'R$ 0,00';
    const valorNumerico = typeof valor === 'string' ? parseFloat(valor) || 0 : valor;
    return 'R$ ' + valorNumerico.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  manipularTecla(evento: KeyboardEvent) {
    if (evento.key === 'Enter') {
      this.salvarEdicao();
    } else if (evento.key === 'Escape') {
      this.cancelarEdicao();
    }
  }

  inputArquivo() {
    const inputArquivo = document.getElementById('fileInput') as HTMLInputElement;
    if (inputArquivo) {
      inputArquivo.click();
    }
  }

  ehCampoMonetario(campo: string): boolean {
    return this.CAMPOS_MONETARIOS.includes(campo as typeof this.CAMPOS_MONETARIOS[number]);
  }

  private extrairValorMonetario(linha: any[], indice?: number): number | undefined {
    if (indice === undefined || indice >= linha.length) {
      return undefined;
    }

    const valorBruto = linha[indice];
    const valorStr = String(valorBruto ?? '').trim();
    if (!valorStr) {
      return undefined;
    }

    const digitosValor = valorStr.replace(/\D/g, '');
    const temFormatoCPF = valorStr.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/) ||
      (digitosValor.length === 11 && !valorStr.match(/[R$]/));

    if (temFormatoCPF) {
      return undefined;
    }

    return this.converterValor(valorBruto);
  }

  private formatarValorParaInput(valor: number | string | undefined): string {
    if (valor === undefined || valor === null || valor === '') {
      return '';
    }

    const numero = typeof valor === 'number' ? valor : this.converterValor(valor);
    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  private converterCamposMonetarios(linha: Record<string, unknown>) {
    this.CAMPOS_MONETARIOS.forEach(campo => {
      if (typeof linha[campo] === 'string') {
        linha[campo] = this.converterValor(linha[campo]);
      }
    });
  }

  private formatarNome(valor: string): string {
    return valor
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
      .join(' ');
  }

  private extrairNomeDependente(
    linha: any[],
    indices: { [key: string]: number },
  ): string | undefined {
    const indiceColuna = indices['nome_dependente'];
    if (indiceColuna === undefined || indiceColuna >= linha.length) {
      return undefined;
    }

    const nomeColuna = this.formatarNome(String(linha[indiceColuna] || '').trim());
    if (!nomeColuna) {
      return undefined;
    }

    const indiceGrau = indices['grau_parentesco'];
    const grau = indiceGrau !== undefined && indiceGrau < linha.length
      ? String(linha[indiceGrau] || '').toUpperCase().trim()
      : '';

    return nomeColuna;
  }

  private nomesIguais(a: string, b: string): boolean {
    return a.trim().toUpperCase() === b.trim().toUpperCase();
  }

  private formatarCPF(valor: string): string {
    let digitos = valor.replace(/\D/g, '');
    if (!digitos || /^0+$/.test(digitos)) {
      return '';
    }
    while (digitos.length < 11) {
      digitos = '0' + digitos;
    }
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private converterValor(valor: any): number {
    if (typeof valor === 'number') return valor;
    if (!valor) return 0;

    let valorStr = String(valor).trim();

    // Se parece um CPF (XXX.XXX.XXX-XX ou 11 dígitos), retornar 0
    const digitos = valorStr.replace(/\D/g, '');
    if (digitos.length === 11 && (valorStr.match(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/) || !valorStr.match(/[R$]/))) {
      return 0;
    }

    // Remover R$ e espaços
    valorStr = valorStr.replace(/[R$\s]/g, '');

    // Verificar se tem vírgula (separador decimal brasileiro)
    const temVirgula = valorStr.includes(',');
    const temPonto = valorStr.includes('.');

    if (temVirgula && temPonto) {
      // Formato brasileiro: 2.329,95 (ponto é milhar, vírgula é decimal)
      // Remover TODOS os pontos (separadores de milhar) e substituir vírgula por ponto (decimal)
      valorStr = valorStr.replace(/\./g, '').replace(',', '.');
    } else if (temVirgula && !temPonto) {
      // Só tem vírgula: 2329,95 (vírgula é decimal)
      valorStr = valorStr.replace(',', '.');
    } else if (!temVirgula && temPonto) {
      // Só tem ponto: pode ser 2329.95 (decimal) ou 2.329 (milhar sem decimal)
      const partes = valorStr.split('.');
      if (partes.length === 2 && partes[1].length <= 2) {
        // Formato decimal: 2329.95 - manter como está
        // Não fazer nada
      } else {
        // Formato milhar: 2.329 ou 2.329.456 - remover TODOS os pontos
        valorStr = valorStr.replace(/\./g, '');
      }
    }
    // Se não tem nem vírgula nem ponto, manter como está (número inteiro)

    const valorNumerico = parseFloat(valorStr);
    return isNaN(valorNumerico) ? 0 : valorNumerico;
  }

  private registroValido(dado: DadosPlanilha): boolean {
    return !!(
      dado.nome?.trim() ||
      dado.matricula?.toString().trim() ||
      (dado.cpf?.trim() && dado.cpf !== '000.000.000-00')
    );
  }

  private registrosIdenticos(a: DadosPlanilha, b: DadosPlanilha): boolean {
    return a.nome === b.nome &&
           a.nome_dependente === b.nome_dependente &&
           a.grau_parentesco === b.grau_parentesco &&
           a.matricula === b.matricula &&
           a.cpf === b.cpf &&
           a.planos === b.planos &&
           a.sinistro === b.sinistro &&
           a.valor === b.valor &&
           a.descricao === b.descricao &&
           a.observacao === b.observacao;
  }
}
