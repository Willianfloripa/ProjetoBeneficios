import { Routes } from '@angular/router';
import { TelaRecisaoComponent } from './components/tela-recisao/tela-recisao.component';
import { HomeComponent } from './components/home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'recisao', component: TelaRecisaoComponent }
];
