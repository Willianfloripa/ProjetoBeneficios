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
  searchTerm: string = '';
  filteredData: DadosPlanilha[] = [];
  isEditing: number = -2; // -2: não editando, -1: novo registro, >= 0: editando registro existente
  editingRow: any = {};
  newRow: any = {};
  showModal = false;
  modalTitle = '';
  modalMessage = '';
  modalCallback: () => void = () => {};
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' | 'none' = 'none';
  editingField: string = '';
  displayColumns = [
    { field: 'planos', title: 'Planos' },
    { field: 'matricula', title: 'Matrícula' },
    { field: 'nome', title: 'Nome' },
    { field: 'cpf', title: 'CPF' },
    { field: 'valor', title: 'Valor' },
    { field: 'descricao', title: 'Descrição' },
    { field: 'observacao', title: 'Observação' }
  ];
  isLoading: boolean = false;

  constructor(private dataService: DataService, private router: Router) {
    this.filteredData = this.dataService.getData();
  }

  ngOnInit() {
    localStorage.removeItem('columnOrder');
    this.loadColumnOrder();
    this.filteredData = this.dataService.getData();
  }

  private loadColumnOrder() {
    const validColumns: ColumnDef[] = [
      { field: 'planos', title: 'Planos' },
      { field: 'matricula', title: 'Matrícula' },
      { field: 'nome', title: 'Nome' },
      { field: 'cpf', title: 'CPF' },
      { field: 'valor', title: 'Valor' },
      { field: 'descricao', title: 'Descrição' },
      { field: 'observacao', title: 'Observação' }
    ];

    const savedOrder = localStorage.getItem('columnOrder');
    if (savedOrder) {
      const savedColumns = JSON.parse(savedOrder);
      this.displayColumns = savedColumns.filter((col: ColumnDef) =>
        validColumns.some(validCol => validCol.field === col.field)
      );
    } else {
      this.displayColumns = validColumns;
    }
  }

  filterData() {
    if (!this.searchTerm) {
      this.filteredData = this.dataService.getData();
      return;
    }
    const searchTermLower = this.searchTerm.toLowerCase();
    this.filteredData = this.dataService.getData().filter(item =>
      Object.values(item).some(value =>
        value?.toString().toLowerCase().includes(searchTermLower)
      )
    );
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.isLoading = true;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const dados: DadosPlanilha[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const sheetData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
            raw: false,
            header: 1,
            defval: ''
          }) as any[][];

          const colunas = this.encontrarColunas(sheetData);

          for (let i = colunas.headerRow + 1; i < sheetData.length; i++) {
            const dado = this.extrairDadosLinha(sheetData[i], colunas.indices);
            if (this.isValidRecord(dado)) {
              dados.push(dado);
            }
          }
        });

        // Obtém dados existentes
        const dadosExistentes = this.dataService.getData();

        // Filtra apenas registros realmente novos
        const dadosNovos = dados.filter(novoItem =>
          !dadosExistentes.some(existente =>
            this.isExactSameRecord(novoItem, existente)
          )
        );

        // Combina dados existentes com novos
        const dadosCombinados = [...dadosExistentes, ...dadosNovos];

        this.dataService.setData(dadosCombinados);
        this.filteredData = dadosCombinados;
        this.isLoading = false;
      };
      reader.readAsBinaryString(file);
    }
  }

  private encontrarColunas(sheetData: any[][]): { headerRow: number, indices: { [key: string]: number } } {
    const indices: { [key: string]: number } = {};
    let headerRow = 0;

    for (let row = 0; row < Math.min(10, sheetData.length); row++) {
      for (let col = 0; col < sheetData[row].length; col++) {
        const value = String(sheetData[row][col] || '').toLowerCase().trim();

        if (value) {
          if (value.match(/^nome$/)) {
            indices['nome'] = col;
            headerRow = row;
          }
          else if (value.match(/descricao|desc/)) {
            indices['descricao'] = col;
            headerRow = row;
          }
          else if (value.match(/matric|cod|registro/)) {
            indices['matricula'] = col;
            headerRow = row;
          }
          else if (value.match(/cpf|cnpj|doc/)) {
            indices['cpf'] = col;
            headerRow = row;
          }
          else if (value.match(/planos/)) {
            indices['planos'] = col;
            headerRow = row;
          }
          else if (value.match(/valor|preco|custo/)) {
            indices['valor'] = col;
            headerRow = row;
          }
          else if (value.match(/obs|observ|nota/)) {
            indices['observacao'] = col;
            headerRow = row;
          }
        }
      }
      if (indices['nome'] !== undefined || indices['matricula'] !== undefined) {
        break;
      }
    }

    return { headerRow, indices };
  }

  private extrairDadosLinha(row: any[], indices: { [key: string]: number }): DadosPlanilha {
    const dado: DadosPlanilha = {};

    if (indices['nome'] !== undefined) {
      dado.nome = this.formatName(String(row[indices['nome']] || ''));
    }
    if (indices['descricao'] !== undefined) {
      dado.descricao = String(row[indices['descricao']] || '');
    }
    if (indices['matricula'] !== undefined) {
      dado.matricula = String(row[indices['matricula']] || '');
    }
    if (indices['cpf'] !== undefined) {
      dado.cpf = this.formatCPF(String(row[indices['cpf']] || ''));
    }
    if (indices['planos'] !== undefined) {
      dado.planos = String(row[indices['planos']] || '');
    }
    if (indices['valor'] !== undefined) {
      dado.valor = this.parseValor(row[indices['valor']]);
    }
    if (indices['observacao'] !== undefined) {
      dado.observacao = String(row[indices['observacao']] || '');
    }

    return dado;
  }

  private formatName(value: string): string {
    return value
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private formatCPF(value: string): string {
    // Remove tudo que não for número
    let digits = value.replace(/\D/g, '');

    // Se for tudo zero ou vazio, retorna vazio
    if (!digits || /^0+$/.test(digits)) {
      return '';
    }

    // Se tiver menos que 11 dígitos, completa com zeros à esquerda
    while (digits.length < 11) {
      digits = '0' + digits;
    }

    // Formata o CPF
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private isValidRecord(dado: DadosPlanilha): boolean {
    // Considera válido se tiver pelo menos um identificador válido
    return !!(
      dado.nome?.trim() ||
      dado.matricula?.toString().trim() ||
      (dado.cpf?.trim() && dado.cpf !== '000.000.000-00')  // Ignora CPF inválido
    );
  }

  private parseValor(valor: any): number {
    if (typeof valor === 'number') return valor;
    if (!valor) return 0;

    // Converte para string e limpa formatação
    let valorStr = valor.toString()
      .replace(/[R$\s]/g, '')  // Remove R$ e espaços
      .replace(/\./g, '')      // Remove pontos de milhar
      .replace(',', '.');      // Converte vírgula decimal para ponto

    // Converte para número
    let valorNumerico = parseFloat(valorStr);

    // Se o valor não tem casas decimais e é maior que 100, assume que precisa dividir por 100
    if (Number.isInteger(valorNumerico) && valorNumerico > 100) {
      valorNumerico = valorNumerico / 100;
    }

    return isNaN(valorNumerico) ? 0 : valorNumerico;
  }

  private removeDuplicados(dados: DadosPlanilha[]): DadosPlanilha[] {
    const map = new Map();
    dados.forEach(item => {
      // Usa apenas matrícula e CPF como chaves para identificação
      const key = [
        item.matricula?.toString().trim(),
        item.cpf?.trim()
      ].filter(Boolean).join('|');

      // Se não tiver nem matrícula nem CPF, considera como registro único
      if (!key) {
        map.set(Math.random(), item);
        return;
      }

      if (!map.has(key) || this.isRecordBetter(item, map.get(key))) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }

  private isRecordBetter(novo: DadosPlanilha, existente: DadosPlanilha): boolean {
    // Prefere registros com mais informações
    const pontuacaoNovo = Object.values(novo).filter(v => !!v).length;
    const pontuacaoExistente = Object.values(existente).filter(v => !!v).length;
    return pontuacaoNovo > pontuacaoExistente;
  }

  clearData() {
    this.openModal(
      'Limpar Dados',
      'Tem certeza que deseja limpar todos os dados?',
      () => {
        this.dataService.clearData();
        this.filteredData = [];
        this.searchTerm = '';
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      }
    );
  }

  exportToExcel() {
    const dataToExport = this.filteredData.map(item => {
      const row: any = {};
      this.displayColumns.forEach(col => {
        const value = item[col.field];
        row[col.title] = col.field === 'valor' && value ?
          `R$ ${typeof value === 'number' ? value.toFixed(2) : value}` :
          (value || '');
      });
      return row;
    });

    // Adiciona linha em branco e total
    dataToExport.push(Object.fromEntries(this.displayColumns.map(col => [col.title, ''])));

    const totalRow: any = Object.fromEntries(this.displayColumns.map(col => [col.title, '']));
    totalRow[this.displayColumns[0].title] = 'VALOR TOTAL A DESCONTAR';
    totalRow[this.displayColumns.find(col => col.field === 'valor')?.title || ''] =
      `R$ ${this.getTotalValue().toFixed(2)}`;
    dataToExport.push(totalRow);

    // Cria uma planilha
    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Ajusta o estilo da célula do total
    const totalRowIndex = dataToExport.length;
    ws['!merges'] = [
      { s: { r: totalRowIndex - 1, c: 0 }, e: { r: totalRowIndex - 1, c: this.displayColumns.length - 2 } }
    ];

    // Cria um livro
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');

    // Converte o livro para um blob
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });

    // Usa file-saver para salvar o arquivo
    saveAs(blob, `dados_exportados_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  getTotalValue(): number {
    return this.filteredData.reduce((total, item) => total + (item.valor || 0), 0);
  }

  addNewRow() {
    this.isEditing = -1;
    this.newRow = {
      nome: '',
      matricula: '',
      cpf: '',
      planos: '',
      valor: 0,
      descricao: '',
      observacao: ''
    };
  }

  editField(index: number, field: string) {
    this.isEditing = index;
    this.editingField = field;
    this.editingRow = { ...this.filteredData[index] };
  }

  saveNewRow() {
    if (this.newRow.nome) {
      if (this.newRow.cpf) {
        this.newRow.cpf = this.formatCPF(this.newRow.cpf);
      }
      this.dataService.setData([this.newRow, ...this.dataService.getData()]);
      this.filteredData = this.dataService.getData();
      this.cancelAdd();
    }
  }

  saveEdit() {
    if (this.editingRow.nome) {
      if (this.editingRow.cpf) {
        this.editingRow.cpf = this.formatCPF(this.editingRow.cpf);
      }

      const data = this.dataService.getData();
      const indexInData = data.findIndex(item =>
        item === this.filteredData[this.isEditing]
      );

      if (indexInData !== -1) {
        data[indexInData] = { ...this.editingRow };
        this.filteredData[this.isEditing] = { ...this.editingRow };
        this.dataService.setData([...data]);
      }

      this.cancelEdit();
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.saveEdit();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  cancelAdd() {
    this.isEditing = -2;
    this.newRow = {};
  }

  cancelEdit() {
    this.isEditing = -2;
    this.editingField = '';
    this.editingRow = {};
  }

  deleteRow(index: number) {
    this.openModal(
      'Excluir Registro',
      'Tem certeza que deseja excluir este registro?',
      () => {
        const itemToDelete = this.filteredData[index];

        const data = this.dataService.getData();

        const originalIndex = data.findIndex(item =>
          item.nome === itemToDelete.nome &&
          item.matricula === itemToDelete.matricula &&
          item.cpf === itemToDelete.cpf
        );

        if (originalIndex > -1) {
          data.splice(originalIndex, 1);
          this.dataService.setData(data);

          this.filterData();
        }
      }
    );
  }

  openModal(title: string, message: string, callback: () => void) {
    this.modalTitle = title;
    this.modalMessage = message;
    this.modalCallback = callback;
    this.showModal = true;
  }

  cancelModal() {
    this.showModal = false;
  }

  confirmModal() {
    this.modalCallback();
    this.showModal = false;
  }

  sortData(column: string) {
    if (this.sortColumn === column) {
      // Ciclo: asc -> desc -> none
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else if (this.sortDirection === 'desc') {
        this.sortDirection = 'none';
        this.sortColumn = '';
        this.filteredData = [...this.dataService.getData()]; // Reset para ordem original
        return;
      } else {
        this.sortDirection = 'asc';
      }
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filteredData.sort((a: any, b: any) => {
      let valueA = a[column];
      let valueB = b[column];

      if (column === 'valor') {
        valueA = valueA || 0;
        valueB = valueB || 0;
      } else {
        valueA = valueA?.toString().toLowerCase() || '';
        valueB = valueB?.toString().toLowerCase() || '';
      }

      if (valueA === valueB) return 0;
      const comparison = valueA > valueB ? 1 : -1;
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  triggerFileInput() {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  private isExactSameRecord(a: DadosPlanilha, b: DadosPlanilha): boolean {
    return a.nome === b.nome &&
           a.matricula === b.matricula &&
           a.cpf === b.cpf &&
           a.planos === b.planos &&
           a.valor === b.valor &&
           a.descricao === b.descricao &&
           a.observacao === b.observacao;
  }

  dropColumn(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.displayColumns, event.previousIndex, event.currentIndex);
    localStorage.setItem('columnOrder', JSON.stringify(this.displayColumns));
  }

  voltar() {
    this.router.navigate(['/']);
  }
}
