import {ContainerComponent,CustomLoadAction,DataStore,PresentationComponent} from "./lib/places-js-latest.js";
import {store} from "./store.js"

class TableItem extends PresentationComponent {

  clickHandlers() {
    return {
      "select": ({componentId})=>{
        store.select(componentId);
      },
      "delete":({componentId})=>{
        store.delete(componentId);
      }
    } 
  }
   
  defineTemplate(){ 
    return `
      <tr class={{selected}}>
        <td class="col-md-1" textContent={{id}}/>
        <td class="col-md-4">
          <a 
            onClick={{select}} 
            textContent={{label}}
          />
        </td>
        <td class="col-md-1">
          <a>
            <span
    t           aria-hidden="true"
              class="glyphicon glyphicon-remove" 
              onClick={{delete}}
            />
          </a>
        </td>
       <td class="col-md-6"/>
    </tr>`;
  }
}

export class MainElement extends ContainerComponent {
  constructor(){
    super([{
        dataStore:store
      }]
    );
    PresentationComponent.init(TableItem);
  } 
}

customElements.define("main-element", MainElement);
