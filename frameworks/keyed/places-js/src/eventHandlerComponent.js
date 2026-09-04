import {UserEventComponent} from "./lib/places-js-latest.js";
import {store} from './store.js';
export class EventHandlerComponent extends UserEventComponent {
  constructor(){
    super();
    this.setClickEvents({
      "add": ()=>store.add(),
      "run": ()=>store.run(),
      "update":()=>store.update(),
      "runlots":()=>store.runLots(),
      "clear":()=>store.clear(),
      "swaprows":()=>store.swapRows()
    });
  }
}

customElements.define("event-handler-component",EventHandlerComponent);
