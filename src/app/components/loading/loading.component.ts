import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-overlay" *ngIf="loadingService.isLoading$ | async">
      <div class="spinner"></div>
      <span>{{ loadingService.message$ | async }}</span>
    </div>
  `,
  styleUrls: ['./loading.component.scss']
})
export class LoadingComponent {
  constructor(public loadingService: LoadingService) {}
}
