import {ContainerComponent,CustomLoadAction,DataStore,PresentationComponent} from "./lib/places-js-latest.js";

function _random(max) {
  return Math.round(Math.random()*1000)%max;
}

class Store extends DataStore {

  id=1;

  constructor(loadAction){
    super(loadAction);
    
    const presentationSignals = {
      "selected": {
        "update":(({prevState,newState,componentUpdate})=>{

          return [
            {
              "id":prevState,
              "selected": ""
            },
            {
              "id":newState,
              "selected": "danger"
            }
          ]
        }),
        "presentationField":"data"
      },
      "data": {
        "update": [
          "label"
        ]
      }
    }
    
    this.setupPresentationSignals(presentationSignals);
    
  }
  
  buildData(count = 1000) {
        var adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
        var colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
        var nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];
        var data = [];
        for (var i = 0; i < count; i++)
            data.push({id: this.id++, label: adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)] });
      return data;
    }
    
    updateData(mod = 10) {
        // Just assigning setting each tenth this.data doesn't cause a redraw, the following does:
        var newData = [...this.getStoreData().data];

      
        for (let i = 0; i < newData.length; i += 10) {
            newData[i] = {...newData[i], label:newData[i].label + ' !!!'};
        }
        this.updateStoreData({data:newData});
    }
    
    delete(id) {
        const data = [...this.getStoreData().data];
        const idx = data.findIndex(d => d.id==id);
        this.updateStoreData({
          data: data.slice(0, idx).concat(data.slice(idx + 1))
        });
    }
        
    run() {
      this.updateStoreData({
        data:this.buildData(),
      });
    }
    
    add() {
        this.updateStoreData({
          data: this.getStoreData().data.concat(this.buildData(1000))
        });
    }
    
    update() {
        this.updateData();
    }
    
    select(id) {
      this.updateStoreData({
        selected:id
      });
    }
    
    runLots() {
      this.updateStoreData({
        data: this.buildData(10000),
        selected:undefined
      });
    }
    clear() {
        this.updateStoreData({
          data:[],
          selected:undefined
        });
    }
    
    swapRows() {
      let data = [...this.getStoreData().data];

      if(data.length > 998) {
        let d1 = data[1];
        let d998 = data[998];

        var newData = data.map(function(data2, i) {
          if(i === 1) {
            return d998;
          }
          else if(i === 998) {
            return d1;
          }
          return data2;
        });
        this.updateStoreData({
          data:newData
        });
      }
    }
}

const setData = function() {
  return {
    data:[],
    selected: undefined,
    id: 1
  }
}

const store = new Store(new CustomLoadAction(setData));

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
 
  
  defineComputedState() { 
    return {
      "selected": ({params})=>{
        return params ? 'danger' : '';
      },
      "label":(state)=>{
        return state.componentState.label;
        //console.log(state);
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
              aria-hidden="true"
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

		this.style="display:block";    
    const self = this;

    this.addClickEventListeners({
      "add": ()=>store.add(),
      "run": ()=>store.run(),
      "update":()=>store.update(),
      "runlots":()=>store.runLots(),
      "clear":()=>store.clear(),
      "swaprows":()=>store.swapRows()
    });
    PresentationComponent.init(TableItem);
  }
  
  render(data){
    const html = `
        <div class="container">
            <div class="jumbotron">
                <div class="row">
                    <div class="col-md-6">
                        <h1>Places.js keyed</h1>
                    </div>
                    <div class="col-md-6">
                        <div class="row">
                            <div class="col-sm-6 smallpad">
                            <button onClick={{run}} type="button" class="btn btn-primary btn-block" id="run">Create 1,000 rows</button>
                            </div>
                            <div class="col-sm-6 smallpad">
                                <button type="button" class="btn btn-primary btn-block" onClick={{runlots}} id="runlots">Create 10,000 rows</button>
                            </div>
                            <div class="col-sm-6 smallpad">
                                <button type="button" class="btn btn-primary btn-block" onClick={{add}} id="add">Append 1,000 rows</button>
                            </div>
                            <div class="col-sm-6 smallpad">
                                <button type="button" class="btn btn-primary btn-block" onClick={{update}} id="update">Update every 10th row</button>
                            </div>
                            <div class="col-sm-6 smallpad">
                                <button type="button" class="btn btn-primary btn-block" onClick={{clear}} id="clear">Clear</button>
                            </div>
                            <div class="col-sm-6 smallpad">
                                <button type="button" class="btn btn-primary btn-block" onClick={{swaprows}} id="swaprows">Swap Rows</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <table class="table table-hover table-striped test-data" style="table-layout:fixed">
                <tbody
                    data-component=TableItem
                    data-repeat
                    data-state=data
                    selected=data.selected
                ></tbody>
            </table>
            <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
        </div>`;
        return html;
    } 
}

customElements.define("main-element", MainElement);
