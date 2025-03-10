import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  private messageSubject = new BehaviorSubject<string>('');

  isLoading$ = this.isLoadingSubject.asObservable();
  message$ = this.messageSubject.asObservable();

  show(message: string = 'Carregando...') {
    this.messageSubject.next(message);
    this.isLoadingSubject.next(true);
  }

  hide() {
    this.isLoadingSubject.next(false);
  }
}
