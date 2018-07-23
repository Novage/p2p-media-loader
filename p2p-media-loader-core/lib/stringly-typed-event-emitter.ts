import {EventEmitter} from "events";

export default class<T extends string> extends EventEmitter {
    public on(event: T, listener: Function) { return super.on(event, listener); }
    public emit(event: T, ...args: any[]) { return super.emit(event, ...args); }
}
