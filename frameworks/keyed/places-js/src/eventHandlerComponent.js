import {StaticComponent} from "./lib/places-js-latest.js";
import {ROW_STORE} from './store.js';

export class EventHandlerComponent extends StaticComponent {
  constructor(){
    super();
    this.setClickEvents({
      "add": ()=>ROW_STORE.add(),
      "run": ()=>ROW_STORE.run(),
      "update":()=>ROW_STORE.update(),
      "runlots":()=>ROW_STORE.runLots(),
      "clear":()=>ROW_STORE.clear(),
      "swaprows":()=>ROW_STORE.swapRows()
    });
  }
}

customElements.define("event-handler-component",EventHandlerComponent);
