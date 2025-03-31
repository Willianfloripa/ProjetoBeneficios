import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly STORAGE_KEY = 'app_data';
  private data: any[] = [];
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.loadData();
  }

  private loadData() {
    if (this.isBrowser) {
      try {
        const savedData = localStorage.getItem(this.STORAGE_KEY);
        if (savedData) {
          this.data = JSON.parse(savedData);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do localStorage:', error);
        this.data = [];
      }
    }
  }

  getData(): any[] {
    return [...this.data];
  }

  setData(data: any[]) {
    this.data = [...data];
    this.saveData();
  }

  addData(newData: any) {
    this.data.push(newData);
    this.saveData();
  }

  clearData() {
    this.data = [];
    this.saveData();
  }

  private saveData() {
    if (this.isBrowser) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
      } catch (error) {
        console.error('Erro ao salvar dados no localStorage:', error);
      }
    }
  }

  async loadInitialData(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.loadData();
        resolve();
      }, 1000);
    });
  }
}
