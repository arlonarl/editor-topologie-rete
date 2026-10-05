import { Component } from '@angular/core';

import { Canvas } from './components/canvas/canvas';

@Component({
  selector: 'app-root',
  imports: [Canvas],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
