import { registerRootComponent } from 'expo';

// Registra la tarea de ubicación en segundo plano antes de montar la app.
import './src/tracking';
import App from './App';

registerRootComponent(App);
