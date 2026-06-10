import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbService } from './db.service';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {

  title = '';
  datetime = '';
  days: Date[] = [];
  currentDate = new Date();

  selectedDay: Date | null = null;
  items: CalendarItem[] = [];

  newText = '';
  newTime = '';

  constructor(private db: DbService, private cdr: ChangeDetectorRef) {}

  isNativeApp(): boolean {
    return Capacitor.isNativePlatform();
  }

  ngOnInit() {
    this.generateCalendar();  // UI primero
    this.init();              // luego DB
  }

  async init() {
    await this.db.init();
    this.load();
    if (this.isNativeApp()) {
      await LocalNotifications.requestPermissions();
    }
  }

  /* save() {
    const itemsToSave = this.items.map(i => {
      if (i.type === 'file') {
        return {
          id: i.id,
          datetime: i.datetime,
          type: i.type,
          fileName: i.fileName,
          fileType: i.fileType
        };
      }
      return i;
    });

    localStorage.setItem('items', JSON.stringify(itemsToSave));
  } */

  save() {
    localStorage.setItem('items', JSON.stringify(this.items));
  }

  /* load() {
    const data = localStorage.getItem('items');
    if (data) {
      this.items = JSON.parse(data);
      this.cdr.detectChanges(); // 👈 fuerza render
    }
  } */

  load() {
    const data = localStorage.getItem('items');

    if (!data) {
      this.items = [];
      return;
    }

    this.items = JSON.parse(data);

    // 🔥 safety: ensure array reactivity
    this.items = [...this.items];
    this.cdr.detectChanges();
  }

  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    this.days = [];

    // 🔥 OFFSET: cuántos días en blanco antes del día 1
    let startDay = firstDay.getDay(); 
    // getDay(): 0=domingo, 1=lunes...

    // Ajuste para que semana empiece en lunes
    startDay = startDay === 0 ? 6 : startDay - 1;

    // 🔹 espacios vacíos
    for (let i = 0; i < startDay; i++) {
      this.days.push(null as any);
    }

    // 🔹 días reales del mes
    for (let i = 1; i <= lastDay.getDate(); i++) {
      this.days.push(new Date(year, month, i));
    }
  }

  prevMonth() {
    this.currentDate = new Date(
      this.currentDate.getFullYear(),
      this.currentDate.getMonth() - 1,
      1
    );
    this.generateCalendar();
  }

  nextMonth() {
    this.currentDate = new Date(
      this.currentDate.getFullYear(),
      this.currentDate.getMonth() + 1,
      1
    );
    this.generateCalendar();
  }

  isToday(day: Date): boolean {
    const today = new Date();

    return (
      day.getFullYear() === today.getFullYear() &&
      day.getMonth() === today.getMonth() &&
      day.getDate() === today.getDate()
    );
  }

  openDay(day: Date) {
    this.selectedDay = day;
  }

  closeModal() {
    this.selectedDay = null;
  }

  addText() {
    const text = prompt('Texto');

    if (!text || !this.selectedDay) return;

    this.items.push({
      id: Date.now().toString(),
      datetime: this.selectedDay.toISOString(),
      type: 'text',
      content: text
    });

    this.save();
  }

  async handleFile(event: any) {
    const file = event.target.files[0];
    if (!file || !this.selectedDay) return;

    const id = Date.now().toString();
    const path = `${id}-${file.name}`;

    const reader = new FileReader();

    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];

      const newItem: CalendarItem = {
        id,
        datetime: this.selectedDay!.toISOString(),
        type: 'file',
        fileName: file.name,
        fileType: file.type,
        filePath: path
      };

      this.items = [...this.items, newItem];
      this.save();
      this.cdr.detectChanges();

      try {
        await Filesystem.writeFile({
          path,
          data: base64,
          directory: Directory.Data
        });
      } catch (e) {
        console.error('Filesystem write failed', e);
        alert('File could not be saved');
      }
    };

    reader.readAsDataURL(file);
  }

  getItemsByDay(day: Date) {
    return this.items.filter(item => {
      const itemDate = new Date(item.datetime);

      return (
        itemDate.getFullYear() === day.getFullYear() &&
        itemDate.getMonth() === day.getMonth() &&
        itemDate.getDate() === day.getDate()
      );
    });
  }

  async addTextFromForm() {
    if (!this.newText || !this.newTime || !this.selectedDay) return;

    const datetime = new Date(this.selectedDay);
    const [h, m] = this.newTime.split(':');

    datetime.setHours(+h, +m);

    const item: CalendarItem = {
      id: Date.now().toString(),
      datetime: datetime.toISOString(),
      type: 'text',
      content: this.newText
    };

    this.items = [...this.items, item];

    this.newText = '';
    this.newTime = '';

    this.save();

    await this.scheduleNotifications(item);
  }

  async deleteItem(item: CalendarItem) {
    // 1. actualizar UI primero
    this.items = this.items.filter(i => i.id !== item.id);
    this.save();

    // 2. luego borrar en DB
    if (item.type === 'file' && item.filePath) {
      await Filesystem.deleteFile({
        path: item.filePath,
        directory: Directory.Data
      });
    }

    await this.cancelNotifications(item);
  }

  editItem(item: CalendarItem) {
    if (item.type === 'text') {
      const newText = prompt('Editar texto', item.content);

      if (newText) {
        item.content = newText;
        this.save();
      }
    }
  }

  async openFile(item: CalendarItem) {
    try {
      if (!item.filePath) {
        alert('Missing file path');
        return;
      }

      const file = await Filesystem.getUri({
        directory: Directory.Data,
        path: item.filePath
      });

      window.open(file.uri, '_system');
    } catch (e) {
      alert('File not found');
    }
  }

  async scheduleNotifications(item: CalendarItem) {
  if (!this.isNativeApp()) return;
  const eventDate = new Date(item.datetime);
  const notifications = [];
  for (let i = 2; i >= 0; i--) {
      const notifyDate = new Date(eventDate);

      notifyDate.setDate(eventDate.getDate() - i);

      if (notifyDate < new Date()) continue;

      notifications.push({
        title: '📅 Reminder',
        body:
          item.type === 'text'
            ? item.content || 'Event'
            : item.fileName || 'File',

        id: Number(item.id + i),

        schedule: {
          at: notifyDate
        }
      });
    }
    await LocalNotifications.schedule({
      notifications
    });
  }

  async cancelNotifications(item: CalendarItem) {

    if (!this.isNativeApp()) return;

    const ids = [];

    for (let i = 0; i <= 2; i++) {

      ids.push({
        id: Number(item.id + i)
      });

    }

    await LocalNotifications.cancel({
      notifications: ids
    });
  }
}

type CalendarItem = {
  id: string;
  datetime: string;
  type: 'text' | 'file';
  content?: string;
  fileName?: string;
  fileType?: string;

  // 🔥 NEW
  filePath?: string | null;
};