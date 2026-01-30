import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/recisao.service';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class HomeComponent {
  isLoading: boolean = false;
  versao: string = '1.0.3';

  constructor(
    private router: Router,
    private dataService: DataService,
    private loadingService: LoadingService
  ) {}

  async navegarParaTelaRescisao() {
    this.loadingService.show('Carregando...');
    try {
      // Aguarda os dados serem carregados
      await this.dataService.loadInitialData();
      await this.router.navigate(['/rescisao']);
    } finally {
      this.loadingService.hide();
    }
  }

  async navegarParaTelaCcm() {
    this.loadingService.show('Carregando...');
    try {
      await this.router.navigate(['/ccm']);
    } finally {
      this.loadingService.hide();
    }
  }

  async navegarParaTelaWellhub() {
    this.loadingService.show('Carregando...');
    try {
      await this.router.navigate(['/wellhub']);
    } finally {
      this.loadingService.hide();
    }
  }
}
