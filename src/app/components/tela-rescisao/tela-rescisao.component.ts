// 1. Imports necessários
import { Component, OnInit } from '@angular/core';
import { DataService } from '../../services/recisao.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';

// 2. Estrutura de Dados
export interface DadosPlanilha {
  [key: string]: string | number | undefined;
  nome?: string;
  matricula?: string;
  cpf?: string;
  planos?: string;
  valor?: number;
  descricao?: string;
  observacao?: string;
}

interface ColumnDef {
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
  // 3. Estados e Variáveis Principais
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
  colunasExibidas: ColumnDef[] = [
    { field: 'planos', title: 'Planos' },
    { field: 'matricula', title: 'Matrícula' },
    { field: 'nome', title: 'Nome' },
    { field: 'cpf', title: 'CPF' },
    { field: 'valor', title: 'Valor' },
    { field: 'descricao', title: 'Descrição' },
    { field: 'observacao', title: 'Observação' }
  ];

  constructor(private dataService: DataService, private router: Router) {
    this.dadosFiltrados = this.dataService.getData();
  }

  ngOnInit() {
    localStorage.removeItem('ordemColunas');
    this.carregarOrdemColunas();
    this.dadosFiltrados = this.dataService.getData();
  }

  // 4. Funcionalidades do Sistema
  // 4.1 Importação de Dados
  aoAlterarArquivo(evento: any) {
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
              raw: false,
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

    for (let linha = 0; linha < Math.min(10, dadosPlanilha.length); linha++) {
      for (let col = 0; col < dadosPlanilha[linha].length; col++) {
        const valor = String(dadosPlanilha[linha][col] || '').toLowerCase().trim();

        if (valor) {
          if (valor.match(/^nome$/)) indices['nome'] = col;
          else if (valor.match(/descricao|desc/)) indices['descricao'] = col;
          else if (valor.match(/matric|cod|registro/)) indices['matricula'] = col;
          else if (valor.match(/cpf|cnpj|doc/)) indices['cpf'] = col;
          else if (valor.match(/planos/)) indices['planos'] = col;
          else if (valor.match(/valor|preco|custo/)) indices['valor'] = col;
          else if (valor.match(/obs|observ|nota/)) indices['observacao'] = col;
          linhaHeader = linha;
        }
      }
      if (indices['nome'] !== undefined || indices['matricula'] !== undefined) break;
    }

    return { linhaHeader, indices };
  }

  private extrairDadosLinha(linha: any[], indices: { [key: string]: number }): DadosPlanilha {
    const dado: DadosPlanilha = {};

    if (indices['nome'] !== undefined) dado.nome = this.formatarNome(String(linha[indices['nome']] || ''));
    if (indices['descricao'] !== undefined) dado.descricao = String(linha[indices['descricao']] || '');
    if (indices['matricula'] !== undefined) dado.matricula = String(linha[indices['matricula']] || '');
    if (indices['cpf'] !== undefined) dado.cpf = this.formatarCPF(String(linha[indices['cpf']] || ''));
    if (indices['planos'] !== undefined) dado.planos = String(linha[indices['planos']] || '');
    if (indices['valor'] !== undefined) dado.valor = this.converterValor(linha[indices['valor']]);
    if (indices['observacao'] !== undefined) dado.observacao = String(linha[indices['observacao']] || '');

    return dado;
  }

  filtrarDados() {
    if (!this.termoBusca) {
      this.dadosFiltrados = this.dataService.getData();
      return;
    }
    const termoMinusculo = this.termoBusca.toLowerCase();
    this.dadosFiltrados = this.dataService.getData().filter(item =>
      Object.values(item).some(value =>
        value?.toString().toLowerCase().includes(termoMinusculo)
      )
    );
  }

  adicionarNovaLinha() {
    this.editando = -1;
    this.novaLinha = {
      nome: '',
      matricula: '',
      cpf: '',
      planos: '',
      valor: 0,
      descricao: '',
      observacao: ''
    };
  }

  editarCampo(indice: number, campo: string) {
    this.editando = indice;
    this.campoEditando = campo;
    this.linhaEditando = { ...this.dadosFiltrados[indice] };
  }

  salvarNovaLinha() {
    if (this.novaLinha.nome) {
      if (this.novaLinha.cpf) {
        this.novaLinha.cpf = this.formatarCPF(this.novaLinha.cpf);
      }
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

      const dados = this.dataService.getData();
      const indiceNosDados = dados.findIndex(item =>
        item === this.dadosFiltrados[this.editando]
      );

      if (indiceNosDados !== -1) {
        const linhaAtualizada = {
          nome: this.linhaEditando.nome,
          matricula: this.linhaEditando.matricula,
          cpf: this.linhaEditando.cpf,
          planos: this.linhaEditando.planos,
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
    this.abrirModal(
      'Excluir Registro',
      'Tem certeza que deseja excluir este registro?',
      () => {
        const itemParaExcluir = this.dadosFiltrados[indice];
        const dados = this.dataService.getData();
        const indiceOriginal = dados.findIndex(item =>
          item.nome === itemParaExcluir.nome &&
          item.matricula === itemParaExcluir.matricula &&
          item.cpf === itemParaExcluir.cpf
        );

        if (indiceOriginal > -1) {
          dados.splice(indiceOriginal, 1);
          this.dataService.setData(dados);
          this.filtrarDados();
        }
      }
    );
  }

  exportarParaExcel() {
    const dadosParaExportar = this.dadosFiltrados.map(item => {
      const linha: any = {};
      this.colunasExibidas.forEach(col => {
        const valor = item[col.field];
        linha[col.title] = col.field === 'valor' && valor ?
          `R$ ${typeof valor === 'number' ? valor.toFixed(2) : valor}` :
          (valor || '');
      });
      return linha;
    });

    dadosParaExportar.push(Object.fromEntries(this.colunasExibidas.map(col => [col.title, ''])));

    const linhaTotal: any = Object.fromEntries(this.colunasExibidas.map(col => [col.title, '']));
    linhaTotal[this.colunasExibidas[0].title] = 'VALOR TOTAL A DESCONTAR';
    linhaTotal[this.colunasExibidas.find(col => col.field === 'valor')?.title || ''] =
      `R$ ${this.obterValorTotal().toFixed(2)}`;
    dadosParaExportar.push(linhaTotal);

    const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
    ws['!merges'] = [
      { s: { r: dadosParaExportar.length - 1, c: 0 }, e: { r: dadosParaExportar.length - 1, c: this.colunasExibidas.length - 2 } }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });

    saveAs(blob, `dados_exportados_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  obterValorTotal(): number {
    return this.dadosFiltrados.reduce((total, item) => total + (item.valor || 0), 0);
  }

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

  manipularTecla(evento: KeyboardEvent) {
    if (evento.key === 'Enter') {
      this.salvarEdicao();
    } else if (evento.key === 'Escape') {
      this.cancelarEdicao();
    }
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

  soltarColuna(evento: CdkDragDrop<any[]>) {
    moveItemInArray(this.colunasExibidas, evento.previousIndex, evento.currentIndex);
    localStorage.setItem('ordemColunas', JSON.stringify(this.colunasExibidas));
  }

  acionarInputArquivo() {
    const inputArquivo = document.getElementById('fileInput') as HTMLInputElement;
    if (inputArquivo) {
      inputArquivo.click();
    }
  }

  ordenarDados(coluna: string) {
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

      if (coluna === 'valor') {
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
  }

  private formatarNome(valor: string): string {
    return valor
      .toLowerCase()
      .split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
      .join(' ');
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

    let valorStr = valor.toString()
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

    let valorNumerico = parseFloat(valorStr);

    if (Number.isInteger(valorNumerico) && valorNumerico > 100) {
      valorNumerico = valorNumerico / 100;
    }

    return isNaN(valorNumerico) ? 0 : valorNumerico;
  }

  private carregarOrdemColunas() {
    const colunasValidas: ColumnDef[] = [
      { field: 'planos', title: 'Planos' },
      { field: 'matricula', title: 'Matrícula' },
      { field: 'nome', title: 'Nome' },
      { field: 'cpf', title: 'CPF' },
      { field: 'valor', title: 'Valor' },
      { field: 'descricao', title: 'Descrição' },
      { field: 'observacao', title: 'Observação' }
    ];

    const ordemSalva = localStorage.getItem('ordemColunas');
    if (ordemSalva) {
      const colunasSalvas = JSON.parse(ordemSalva);
      this.colunasExibidas = colunasSalvas.filter((col: ColumnDef) =>
        colunasValidas.some(colVal => colVal.field === col.field)
      );
    } else {
      this.colunasExibidas = colunasValidas;
    }
  }

  limparDados() {
    this.abrirModal(
      'Limpar Dados',
      'Tem certeza que deseja limpar todos os dados?',
      () => {
        this.dataService.clearData();
        this.dadosFiltrados = [];
        this.termoBusca = '';
        const inputArquivo = document.getElementById('fileInput') as HTMLInputElement;
        if (inputArquivo) {
          inputArquivo.value = '';
        }
      }
    );
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
           a.matricula === b.matricula &&
           a.cpf === b.cpf &&
           a.planos === b.planos &&
           a.valor === b.valor &&
           a.descricao === b.descricao &&
           a.observacao === b.observacao;
  }

  voltar() {
    this.router.navigate(['/']);
  }
}
