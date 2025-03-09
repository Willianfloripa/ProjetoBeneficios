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

    if (this.isBrowser) {
      const savedData = localStorage.getItem(this.STORAGE_KEY);
      if (savedData) {
        this.data = JSON.parse(savedData);
      }
    }
  }

  getData(): any[] {
    return this.data;
  }

  setData(data: any[]) {
    this.data = data;
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }
  }

  addData(newData: any) {
    this.data.push(newData);
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }
  }

  clearData() {
    this.data = [];
    if (this.isBrowser) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }
}
