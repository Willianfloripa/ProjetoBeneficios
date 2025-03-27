import { Routes } from '@angular/router';
import { TelaRescisaoComponent } from './components/tela-rescisao/tela-rescisao.component';
import { HomeComponent } from './components/home/home.component';
import { TelaCcmComponent } from './components/tela-ccm/tela-ccm.component';
import { TelaWellhubComponent } from './components/tela-wellhub/tela-wellhub.component';
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'rescisao', component: TelaRescisaoComponent },
  { path: 'ccm', component: TelaCcmComponent },
  { path: 'wellhub', component: TelaWellhubComponent }
];
