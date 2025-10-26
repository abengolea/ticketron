
import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type AppEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

class AppEventEmitter extends EventEmitter {
  emit<E extends keyof AppEvents>(event: E, ...args: Parameters<AppEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  on<E extends keyof AppEvents>(event: E, listener: AppEvents[E]): this {
    return super.on(event, listener);
  }
}

export const errorEmitter = new AppEventEmitter();
