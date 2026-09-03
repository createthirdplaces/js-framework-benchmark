import {CustomLoadAction,DataStore} from "./lib/places-js-latest.js";

function _random(max) {
  return Math.round(Math.random()*1000)%max;
}

class Store extends DataStore {

  id=1;

  constructor(loadAction,storeName){
    super(loadAction, storeName);
   
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
      console.log("Swap rows");
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
};

export const store = new Store((new CustomLoadAction(setData)),"mainStore");

