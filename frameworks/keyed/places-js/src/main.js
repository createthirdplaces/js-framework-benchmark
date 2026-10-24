import {DataStore,PresentationComponent} from "./lib/places-js-latest.js";
import {ROW_STORE} from "./store.js"

export class MainElement extends PresentationComponent {
  constructor(){
    super();
    this.setClickEvents({
      "select": ({componentId})=>{
        ROW_STORE.select(componentId);
      },
      "delete":({componentId})=>{
        ROW_STORE.delete(componentId);
      }
    })
  } 
}

customElements.define("main-element", MainElement);
